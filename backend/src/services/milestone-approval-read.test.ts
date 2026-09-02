import { assertCanViewMilestoneApprovalHistory } from './milestone-approval.service';

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
