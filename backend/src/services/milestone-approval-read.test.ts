import { supabaseAdmin } from '../config/supabase';
import { assertCanViewMilestoneApprovalHistory, MilestoneApprovalService } from './milestone-approval.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertThrows = (name: string, action: () => void): void => {
  try {
    action();
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Milestone not found') {
      throw new Error(`${name}: unexpected error`);
    }
    console.log(`${name}: non-disclosed`);
    return;
  }

  throw new Error(`${name}: expected denial`);
};

const project = { id: 'project-1', sales_id: 'sales-owner', pic_id: 'sa-pic' };
const superAdmin = { userId: 'admin-1', role: 'SUPER_ADMIN', fullName: 'Admin' };
const headSa = { userId: 'head-sa-1', role: 'HEAD_SA', fullName: 'Head SA' };
const salesOwner = { userId: 'sales-owner', role: 'SALES', fullName: 'Sales Owner' };
const assignedSa = { userId: 'sa-pic', role: 'SA', fullName: 'Assigned SA' };

assertCanViewMilestoneApprovalHistory(project, superAdmin);
assertCanViewMilestoneApprovalHistory(project, headSa);
assertCanViewMilestoneApprovalHistory(project, salesOwner);
assertCanViewMilestoneApprovalHistory(project, assignedSa);
console.log('Test 1 - SUPER_ADMIN, HEAD_SA, owner SALES, and assigned SA can read history: passed');

assertThrows('Test 2 - Unrelated SALES', () =>
  assertCanViewMilestoneApprovalHistory(project, { userId: 'sales-other', role: 'SALES', fullName: 'Other Sales' })
);
assertThrows('Test 3 - Unrelated SA', () =>
  assertCanViewMilestoneApprovalHistory(project, { userId: 'sa-other', role: 'SA', fullName: 'Other SA' })
);

async function verifySalesReviewDetailVisibility(): Promise<void> {
  const originalFrom = supabaseAdmin.from;

  try {
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'project_milestones') {
        const request: any = {
          select: () => request,
          eq: () => request,
          single: async () => ({ data: { id: 'milestone-1', project }, error: null }),
        };
        return request;
      }
      if (table === 'milestone_approvals') {
        const request: any = {
          select: () => request,
          eq: () => request,
          order: async () => ({
            data: [{
              id: 'approval-1',
              milestone_id: 'milestone-1',
              submitted_by: 'sa-pic',
              submission_note: 'Evidence submitted.',
              status: 'REJECTED',
              reviewed_by: headSa.userId,
              review_note: 'Please add the missing analysis.',
              submitted_at: '2026-09-08T08:00:00.000Z',
              reviewed_at: '2026-09-08T09:00:00.000Z',
            }],
            error: null,
          }),
        };
        return request;
      }
      if (table === 'users') {
        const request: any = {
          select: () => request,
          in: async () => ({
            data: [
              { id: 'sa-pic', full_name: 'Assigned SA', email: 'sa@example.com' },
              { id: headSa.userId, full_name: headSa.fullName, email: 'headsa@example.com' },
            ],
            error: null,
          }),
        };
        return request;
      }
      throw new Error(`Unexpected table: ${table}`);
    };

    const history = await MilestoneApprovalService.getApprovalHistory('milestone-1', salesOwner);
    assert(history.length === 1, 'Test 4: owning SALES must receive milestone review history');
    assert(history[0].status === 'REJECTED', 'Test 4: owning SALES must retain milestone rejection status visibility');
    assert(history[0].review_note === 'Please add the missing analysis.', 'Test 4: owning SALES must retain the rejection reason');
    assert(history[0].reviewed_by?.full_name === headSa.fullName, 'Test 4: owning SALES must retain reviewer visibility');
    assert(history[0].reviewed_at === '2026-09-08T09:00:00.000Z', 'Test 4: owning SALES must retain review timestamp visibility');
    console.log('Test 4 - SALES retains milestone review status, note, reviewer, and timestamp visibility: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
}

verifySalesReviewDetailVisibility().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
