import {
  buildDeadlineChangeRequestedActivity,
  buildDeadlineProposalArtifacts,
} from './deadline.service';
import {
  buildDeadlineApprovalReadResult,
  buildDeadlineApprovalResolution,
} from './deadline-approval.service';
import { buildInitiationApprovalRequest } from './milestone-initiation-approval.service';
import { addWorkingDays } from '../utils/dates';

const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' };
const reviewerId = 'headsa-1';
const reviewedAt = '2026-09-02T03:00:00.000Z';

const effectiveDeadline = {
  start_date: '2026-08-28',
  duration_working_days: 3,
  due_date: '2026-09-02',
};

const proposedDeadline = {
  start_date: '2026-08-28',
  duration_working_days: 5,
  due_date: '2026-09-04',
};

const baseMilestone = {
  id: 'milestone-1',
  project_id: 'project-1',
  name: 'Customer Assessment',
  status: 'CREATED',
  start_date: null,
  duration_working_days: null,
  due_date: null,
  project: {
    id: 'project-1',
    name: 'Project Test',
    sales_id: sales.userId,
    status: 'ACTIVE',
    is_postponed: false,
    pic_id: 'sa-1',
  },
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

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

const initialProposal = buildDeadlineProposalArtifacts(baseMilestone, effectiveDeadline, sales, false);
assert(initialProposal.history.due_date === '2026-09-02', 'Test 1: proposed due date should be stored in history');
assert(initialProposal.approval.status === 'PENDING', 'Test 1: approval should be PENDING');
assert(initialProposal.effectiveDeadline.due_date === null, 'Test 1: effective due date should remain null');
console.log('Test 1 - Initial deadline creates proposal + PENDING approval without effective update: passed');

const approvedInitial = buildDeadlineApprovalResolution(
  'PENDING',
  'APPROVED',
  reviewerId,
  initialProposal.history,
  initialProposal.effectiveDeadline,
  undefined,
  reviewedAt
);
assert(approvedInitial.approval.status === 'APPROVED', 'Test 2: approval should be APPROVED');
assert(approvedInitial.effectiveDeadline.due_date === '2026-09-02', 'Test 2: effective due date should come from history');
console.log('Test 2 - Approve initial deadline applies proposal to effective milestone deadline: passed');

const rejectedInitial = buildDeadlineApprovalResolution(
  'PENDING',
  'REJECTED',
  reviewerId,
  initialProposal.history,
  initialProposal.effectiveDeadline,
  'Too long',
  reviewedAt
);
assert(rejectedInitial.approval.status === 'REJECTED', 'Test 3: approval should be REJECTED');
assert(rejectedInitial.effectiveDeadline.due_date === null, 'Test 3: effective due date should remain null');
console.log('Test 3 - Reject initial deadline leaves effective milestone deadline unchanged: passed');

const existingDeadlineMilestone = {
  ...baseMilestone,
  start_date: effectiveDeadline.start_date,
  duration_working_days: effectiveDeadline.duration_working_days,
  due_date: effectiveDeadline.due_date,
};
const changeProposal = buildDeadlineProposalArtifacts(
  existingDeadlineMilestone,
  proposedDeadline,
  sales,
  false,
  'Customer requested more time'
);
assert(changeProposal.history.due_date === '2026-09-04', 'Test 4: new due date should be stored as proposal history');
assert(changeProposal.effectiveDeadline.due_date === '2026-09-02', 'Test 4: old effective due date should remain effective');
console.log('Test 4 - Change existing approved deadline creates proposal without changing effective deadline: passed');

const approvedChange = buildDeadlineApprovalResolution(
  'PENDING',
  'APPROVED',
  reviewerId,
  changeProposal.history,
  changeProposal.effectiveDeadline,
  undefined,
  reviewedAt
);
assert(approvedChange.effectiveDeadline.due_date === '2026-09-04', 'Test 5: approved change should apply proposed due date');
console.log('Test 5 - Approve deadline change applies proposed deadline: passed');

const rejectedChange = buildDeadlineApprovalResolution(
  'PENDING',
  'REJECTED',
  reviewerId,
  changeProposal.history,
  changeProposal.effectiveDeadline,
  'Keep original timeline',
  reviewedAt
);
assert(rejectedChange.effectiveDeadline.due_date === '2026-09-02', 'Test 6: rejected change should keep old effective deadline');
console.log('Test 6 - Reject deadline change keeps previous effective deadline: passed');

assertThrows('Test 7 - Second proposal while PENDING exists', () =>
  buildDeadlineProposalArtifacts(existingDeadlineMilestone, proposedDeadline, sales, true, 'Second proposal')
);

assertThrows('Test 8a - APPROVED approval cannot be approved again', () =>
  buildDeadlineApprovalResolution('APPROVED', 'APPROVED', reviewerId, changeProposal.history, changeProposal.effectiveDeadline)
);
assertThrows('Test 8b - REJECTED approval cannot be rejected again', () =>
  buildDeadlineApprovalResolution('REJECTED', 'REJECTED', reviewerId, changeProposal.history, changeProposal.effectiveDeadline, 'Again')
);

const injectedAttempt = { start_date: '2026-08-30', duration_working_days: 99, due_date: '2026-12-31' };
const approvedWithoutInjectedValues = buildDeadlineApprovalResolution(
  'PENDING',
  'APPROVED',
  reviewerId,
  changeProposal.history,
  injectedAttempt,
  undefined,
  reviewedAt
);
assert(approvedWithoutInjectedValues.effectiveDeadline.due_date === changeProposal.history.due_date, 'Test 9: approved deadline must use history proposal');
assert(approvedWithoutInjectedValues.effectiveDeadline.due_date !== injectedAttempt.due_date, 'Test 9: injected current values must not be used for approval');
console.log('Test 9 - Approve cannot inject frontend deadline values: passed');

const calculatedWithHoliday = toDateKey(addWorkingDays('2026-08-28', 3, ['2026-08-31']));
assert(calculatedWithHoliday === '2026-09-02', 'Test 10: Friday + 3 working days with Monday holiday should be Wednesday');
console.log('Test 10 - Working-day calculation with holiday remains correct: 2026-09-02');

const writeArtifacts = {
  initialProposal,
  changeProposal,
  requestActivity: buildDeadlineChangeRequestedActivity(sales, existingDeadlineMilestone, proposedDeadline.due_date),
  approvedResolution: approvedChange,
  rejectedResolution: rejectedChange,
};
assert(!JSON.stringify(writeArtifacts).includes('SUPERSEDED'), 'Test 11: new write artifacts must not contain SUPERSEDED');
console.log('Test 11 - New runtime write artifacts do not use SUPERSEDED: passed');

const historicalRead = buildDeadlineApprovalReadResult(
  true,
  [
    {
      id: 'approval-superseded',
      milestone_id: 'milestone-1',
      deadline_history_id: 'history-1',
      status: 'SUPERSEDED',
      requested_by: sales.userId,
      reviewed_by: null,
      review_note: null,
      requested_at: '2026-08-28T01:00:00.000Z',
      reviewed_at: null,
    },
  ],
  [
    {
      id: 'history-1',
      start_date: '2026-08-28',
      duration_working_days: 3,
      due_date: '2026-09-02',
      change_reason: 'Historical pending replaced before Phase 8A',
    },
  ],
  [{ id: sales.userId, full_name: sales.fullName, email: 'sales@test.com' }],
  true
);
assert(!Array.isArray(historicalRead) && historicalRead?.status === 'SUPERSEDED', 'Test 12: historical SUPERSEDED approvals should remain readable');
console.log('Test 12 - Historical SUPERSEDED approval remains readable: passed');

assertThrows('Test 13 - Pending initial deadline cannot satisfy initiation prerequisite', () =>
  buildInitiationApprovalRequest(
    {
      ...baseMilestone,
      pic_id: 'sa-1',
    },
    sales,
    false,
    'PENDING'
  )
);

const initiationRequest = buildInitiationApprovalRequest(
  {
    ...baseMilestone,
    pic_id: 'sa-1',
    start_date: approvedInitial.effectiveDeadline.start_date,
    duration_working_days: approvedInitial.effectiveDeadline.duration_working_days,
    due_date: approvedInitial.effectiveDeadline.due_date,
  },
  sales,
  false,
  'APPROVED'
);
assert(initiationRequest.status === 'PENDING', 'Test 14: approved initial deadline should allow initiation approval request');
console.log('Test 14 - Approved initial deadline satisfies initiation prerequisite: passed');
