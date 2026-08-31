import { readFileSync } from 'fs';
import { join } from 'path';
import { buildInitiationApprovalReadResult } from './milestone-initiation-approval.service';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const milestoneRoutes = readFileSync(join(__dirname, '../routes/milestone.routes.ts'), 'utf8');
const initiationRoutes = readFileSync(join(__dirname, '../routes/milestone-initiation-approval.routes.ts'), 'utf8');

assert(
  milestoneRoutes.includes("'/:milestoneId/request-initiation-approval'") &&
    milestoneRoutes.includes("'/:milestoneId/initiate'") &&
    milestoneRoutes.match(/MilestoneInitiationApprovalController\.retired/g)?.length === 2,
  'Test 1: initiation request and initiate mutations must be retired'
);
console.log('Test 1 - SALES initiation mutations return the retired workflow response');

assert(
  initiationRoutes.includes("router.post('/:approvalId/approve', MilestoneInitiationApprovalController.retired)") &&
    initiationRoutes.includes("router.post('/:approvalId/reject', MilestoneInitiationApprovalController.retired)"),
  'Test 2: initiation review mutations must be retired'
);
console.log('Test 2 - HEAD_SA initiation review mutations return the retired workflow response');

const historicalApproval = buildInitiationApprovalReadResult(
  true,
  [
    {
      id: 'legacy-initiation-1',
      milestone_id: 'milestone-1',
      status: 'APPROVED',
      requested_by: 'sales-1',
      request_note: 'Historical request',
      reviewed_by: 'headsa-1',
      review_note: 'Historical approval',
      requested_at: '2026-08-20T01:00:00.000Z',
      reviewed_at: '2026-08-20T02:00:00.000Z',
    },
  ],
  [
    { id: 'sales-1', full_name: 'Sales Test', email: 'sales@test.com' },
    { id: 'headsa-1', full_name: 'Head SA Test', email: 'headsa@test.com' },
  ],
  true
);
assert(!Array.isArray(historicalApproval) && historicalApproval?.status === 'APPROVED', 'Test 3: historical initiation approval should remain readable');
console.log('Test 3 - Historical initiation approval remains readable for compatibility');
