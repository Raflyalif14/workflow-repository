import { buildDeadlineApprovalReadResult } from './deadline-approval.service';

const users = [
  { id: 'sales-1', full_name: 'Sales Test', email: 'sales@test.com' },
  { id: 'headsa-1', full_name: 'Head SA Test', email: 'headsa@test.com' },
];

const histories = [
  {
    id: 'history-1',
    start_date: '2026-08-26',
    duration_working_days: 7,
    due_date: '2026-09-04',
    change_reason: 'Initial deadline',
  },
  {
    id: 'history-2',
    start_date: '2026-08-26',
    duration_working_days: 9,
    due_date: '2026-09-08',
    change_reason: 'Testing deadline rejection flow',
  },
];

const approvals = [
  {
    id: 'approval-old',
    milestone_id: 'milestone-1',
    deadline_history_id: 'history-1',
    status: 'APPROVED' as const,
    requested_by: 'sales-1',
    reviewed_by: 'headsa-1',
    review_note: 'Approved',
    requested_at: '2026-08-26T01:00:00.000Z',
    reviewed_at: '2026-08-26T02:00:00.000Z',
  },
  {
    id: 'approval-new',
    milestone_id: 'milestone-1',
    deadline_history_id: 'history-2',
    status: 'REJECTED' as const,
    requested_by: 'sales-1',
    reviewed_by: 'headsa-1',
    review_note: 'Deadline terlalu lama',
    requested_at: '2026-08-27T01:00:00.000Z',
    reviewed_at: '2026-08-27T02:00:00.000Z',
  },
];

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const current = buildDeadlineApprovalReadResult(true, approvals, histories, users, true);
assert(!Array.isArray(current) && current?.id === 'approval-new', 'Test 1: current approval should return latest record');
console.log('Test 1 - Current approval returns latest record: approval-new');

const history = buildDeadlineApprovalReadResult(true, approvals, histories, users, false);
assert(Array.isArray(history) && history[0]?.id === 'approval-new' && history[1]?.id === 'approval-old', 'Test 2: history should be ordered newest first');
console.log('Test 2 - Approval history ordered newest first: approval-new, approval-old');

const emptyCurrent = buildDeadlineApprovalReadResult(true, [], [], [], true);
assert(!Array.isArray(emptyCurrent) && emptyCurrent === null, 'Test 3: no approval current should be null');
console.log('Test 3 - No approval current: null');

const emptyHistory = buildDeadlineApprovalReadResult(true, [], [], [], false);
assert(Array.isArray(emptyHistory) && emptyHistory.length === 0, 'Test 4: no approval history should be empty array');
console.log('Test 4 - No approval history: []');

try {
  buildDeadlineApprovalReadResult(false, approvals, histories, users, true);
  throw new Error('Test 5: expected milestone not found error');
} catch (error: any) {
  assert(error.message === 'Milestone not found', 'Test 5: expected Milestone not found');
  console.log('Test 5 - Milestone not found: error');
}
