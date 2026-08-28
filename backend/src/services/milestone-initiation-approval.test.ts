import {
  buildInitiationApprovalRequest,
  buildInitiationApprovalReview,
} from './milestone-initiation-approval.service';

const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' };
const otherSales = { userId: 'sales-2', role: 'SALES', fullName: 'Sales Other' };
const headSa = { userId: 'head-sa-1', role: 'HEAD_SA', fullName: 'Head Solution Architect Test' };

const milestone = {
  id: 'milestone-1',
  project_id: 'project-1',
  name: 'Customer Assessment',
  status: 'CREATED',
  pic_id: 'sa-1',
  workflow_stage: { default_role: 'SA' },
  start_date: '2026-08-28',
  duration_working_days: 3,
  due_date: '2026-09-02',
  project: { sales_id: 'sales-1', status: 'ACTIVE', is_postponed: false },
};

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const assertThrows = (name: string, action: () => unknown) => {
  try {
    action();
  } catch {
    console.log(`${name}: rejected`);
    return;
  }

  throw new Error(`${name}: expected rejection`);
};

const request = buildInitiationApprovalRequest(milestone, sales, false, 'APPROVED', 'Ready');
assert(request.status === 'PENDING', 'Test 1: request should create PENDING approval');
assert(request.requested_by === sales.userId, 'Test 1: requested_by should be authenticated sales');
console.log('Test 1 - SALES owner + CREATED + PIC + approved deadline: PENDING');

assertThrows('Test 2 - Milestone without PIC', () =>
  buildInitiationApprovalRequest({ ...milestone, pic_id: null }, sales, false, 'APPROVED')
);

const salesStageRequest = buildInitiationApprovalRequest(
  { ...milestone, pic_id: null, workflow_stage: { default_role: 'SALES' } },
  sales,
  false,
  'APPROVED'
);
assert(salesStageRequest.status === 'PENDING', 'Test 3: SALES stage should allow no PIC');
console.log('Test 3 - SALES stage + no PIC + approved deadline: PENDING');

const headSaStageRequest = buildInitiationApprovalRequest(
  { ...milestone, pic_id: null, workflow_stage: { default_role: 'HEAD_SA' } },
  sales,
  false,
  'APPROVED'
);
assert(headSaStageRequest.status === 'PENDING', 'Test 4: HEAD_SA stage should allow no PIC');
console.log('Test 4 - HEAD_SA stage + no PIC + approved deadline: PENDING');

assertThrows('Test 5 - Milestone without deadline', () =>
  buildInitiationApprovalRequest({ ...milestone, start_date: null }, sales, false, 'APPROVED')
);

assertThrows('Test 6 - Deadline approval not APPROVED', () =>
  buildInitiationApprovalRequest(milestone, sales, false, 'PENDING')
);

const approved = buildInitiationApprovalReview('PENDING', milestone, 'APPROVED', headSa, 'Ready to initiate', 'APPROVED');
assert(approved.status === 'APPROVED', 'Test 7: approval should be APPROVED');
assert(milestone.status === 'CREATED', 'Test 7: milestone should remain CREATED');
console.log('Test 7 - HEAD_SA approve PENDING: APPROVED, milestone remains CREATED');

const rejected = buildInitiationApprovalReview('PENDING', milestone, 'REJECTED', headSa, 'Please revise');
assert(rejected.status === 'REJECTED', 'Test 8: approval should be REJECTED');
assert(milestone.status === 'CREATED', 'Test 8: milestone should remain CREATED');
console.log('Test 8 - HEAD_SA reject PENDING + note: REJECTED, milestone remains CREATED');

assertThrows('Test 9 - non HEAD_SA approve/reject', () =>
  buildInitiationApprovalReview('PENDING', milestone, 'APPROVED', sales, undefined, 'APPROVED')
);

assertThrows('Test 10 - Duplicate review', () =>
  buildInitiationApprovalReview('APPROVED', milestone, 'REJECTED', headSa, 'Second review')
);

const secondRequest = buildInitiationApprovalRequest(milestone, sales, false, 'APPROVED', 'Retry after rejection');
assert(secondRequest.status === 'PENDING', 'Test 11: rejected history should allow a new PENDING request');
assert(request.status === 'PENDING', 'Test 11: old request object should not be overwritten');
console.log('Test 11 - After REJECTED, SALES request again: old row can remain REJECTED, new request=PENDING');

assertThrows('Bonus - SALES not project owner', () =>
  buildInitiationApprovalRequest(milestone, otherSales, false, 'APPROVED')
);
