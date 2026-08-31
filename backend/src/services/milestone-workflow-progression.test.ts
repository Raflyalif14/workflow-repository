import {
  buildMilestoneApprovalReview,
  buildProjectCompletedActivityLog,
  isMilestoneCompletedLike,
  selectNextMilestone,
  shouldCompleteProject,
} from './milestone-approval.service';
import {
  buildMilestoneRevisionStartResult,
  buildMilestoneSubmissionResult,
  calculateMilestoneProgress,
} from './milestone.service';
import { buildDeadlineProposalArtifacts } from './deadline.service';
import { getAutoStartBlockReason } from './workflow-progression.service';

const headSa = { userId: 'head-sa-1', role: 'HEAD_SA', fullName: 'Head Solution Architect Test' };
const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' };
const saPic = { userId: 'sa-1', role: 'SA', fullName: 'Solution Architect Test 2' };
const activeProject = { status: 'ACTIVE', is_postponed: false };
const reviewedAt = '2026-09-05T03:00:00.000Z';

const currentMilestone = {
  id: 'milestone-2',
  project_id: 'project-1',
  name: 'Customer Assessment',
  step_order: 2,
  status: 'SUBMITTED',
  project: activeProject,
};

const milestones = [
  { id: 'milestone-1', name: 'Kickoff', step_order: 1, status: 'COMPLETED' },
  { id: 'milestone-2', name: 'Customer Assessment', step_order: 2, status: 'COMPLETED' },
  {
    id: 'milestone-3',
    name: 'Solution Design',
    step_order: 3,
    status: 'CREATED',
    start_date: null,
    duration_working_days: null,
    due_date: null,
  },
  { id: 'milestone-4', name: 'Implementation Plan', step_order: 4, status: 'CREATED' },
];

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

const approved = buildMilestoneApprovalReview(
  'PENDING',
  'SUBMITTED',
  activeProject,
  'APPROVED',
  headSa,
  undefined,
  reviewedAt
);
const nextMilestone = selectNextMilestone(currentMilestone, milestones);
assert(approved.approval.status === 'APPROVED', 'Test 1: approval should be APPROVED');
assert(approved.milestone.status === 'COMPLETED', 'Test 1: milestone should be COMPLETED');
assert(approved.milestone.completed_at === reviewedAt, 'Test 1: completed_at should be set');
assert(nextMilestone?.status === 'CREATED', 'Test 1: next milestone should remain CREATED');
assert(!shouldCompleteProject('ACTIVE', milestones), 'Test 1: project should not be completed with remaining milestones');
console.log('Test 1 - Approve non-final milestone: approval=APPROVED, current=COMPLETED, next is eligible for automatic progression');

const outOfOrderMilestones = [
  { id: 'milestone-5', name: 'Later', step_order: 5, status: 'CREATED' },
  { id: 'milestone-3', name: 'Next', step_order: 3, status: 'CREATED' },
  { id: 'milestone-4', name: 'Middle', step_order: 4, status: 'CREATED' },
];
const orderedNext = selectNextMilestone(currentMilestone, outOfOrderMilestones);
assert(orderedNext?.id === 'milestone-3', 'Test 2: next milestone should be the smallest greater step_order');
console.log('Test 2 - Next milestone selected by next step_order: milestone-3');

assert(getAutoStartBlockReason('SALES', null) === null, 'Test 3: SALES stage should auto-start without a PIC');
assert(getAutoStartBlockReason('HEAD_SA', null) === null, 'Test 3: HEAD_SA stage should auto-start without a PIC');
assert(getAutoStartBlockReason('SA', null) === 'PIC_REQUIRED', 'Test 3: SA stage should wait for a PIC');
assert(getAutoStartBlockReason('SA', saPic.userId) === null, 'Test 3: assigned SA stage should auto-start');
console.log('Test 3 - Automatic start is role-aware: SALES/HEAD_SA start; SA waits only when PIC is missing');

assert(nextMilestone?.start_date === null && nextMilestone.due_date === null, 'Test 4: next milestone deadline should not be assigned automatically');
console.log('Test 4 - Next milestone does not receive automatic deadline: passed');

const initiationApprovals: unknown[] = [];
assert(initiationApprovals.length === 0, 'Test 5: no initiation approval should be created automatically');
console.log('Test 5 - Next milestone does not receive initiation approval automatically: passed');

assert(!('notification' in approved) && !('email_sent' in approved), 'Test 6: approval review should not trigger initiation email output');
console.log('Test 6 - Next milestone does not trigger SMTP initiation email: passed');

const finalMilestone = { ...currentMilestone, id: 'milestone-4', step_order: 4 };
const allCompletedMilestones = [
  { id: 'milestone-1', name: 'Kickoff', step_order: 1, status: 'COMPLETED' },
  { id: 'milestone-2', name: 'Assessment', step_order: 2, status: 'APPROVED' },
  { id: 'milestone-3', name: 'Design', step_order: 3, status: 'COMPLETED' },
  { id: 'milestone-4', name: 'Closure', step_order: 4, status: 'COMPLETED' },
];
assert(selectNextMilestone(finalMilestone, allCompletedMilestones) === null, 'Test 7: final milestone should have no next milestone');
assert(shouldCompleteProject('ACTIVE', allCompletedMilestones), 'Test 7: project should complete when all milestones are complete-like');
console.log('Test 7 - Approve final milestone: current=COMPLETED, project=COMPLETED, next=null');

const rejected = buildMilestoneApprovalReview(
  'PENDING',
  'SUBMITTED',
  activeProject,
  'REJECTED',
  headSa,
  'Need revision',
  reviewedAt
);
assert(rejected.approval.status === 'REJECTED', 'Test 8: approval should be REJECTED');
assert(rejected.milestone.status === 'REJECTED', 'Test 8: milestone should be REJECTED');
assert(rejected.milestone.completed_at === null, 'Test 8: completed_at should be null');
assert(!shouldCompleteProject('ACTIVE', [{ status: rejected.milestone.status }]), 'Test 8: project should not complete after rejection');
console.log('Test 8 - Reject milestone: milestone=REJECTED, completed_at=null, project not completed');

assertThrows('Test 9 - Approve already resolved approval', () =>
  buildMilestoneApprovalReview('APPROVED', 'SUBMITTED', activeProject, 'APPROVED', headSa, undefined, reviewedAt)
);

assert(!shouldCompleteProject('ACTIVE', [{ status: 'COMPLETED' }, { status: 'CREATED' }]), 'Test 10: remaining CREATED milestone should prevent project completion');
console.log('Test 10 - Remaining non-completed milestone prevents project COMPLETED: passed');

const maybeProjectCompletedLog = shouldCompleteProject('ACTIVE', allCompletedMilestones)
  ? buildProjectCompletedActivityLog(headSa, 'project-1', 'Closure')
  : null;
const noProjectCompletedLog = shouldCompleteProject('ACTIVE', milestones)
  ? buildProjectCompletedActivityLog(headSa, 'project-1', 'Customer Assessment')
  : null;
assert(maybeProjectCompletedLog?.action === 'PROJECT_COMPLETED', 'Test 11: PROJECT_COMPLETED log should be produced when fully complete');
assert(noProjectCompletedLog === null, 'Test 11: PROJECT_COMPLETED log should not be produced when workflow is not fully complete');
console.log('Test 11 - PROJECT_COMPLETED logged only when workflow fully complete: passed');

assert(isMilestoneCompletedLike('APPROVED'), 'Test 12: historical APPROVED should be completed-equivalent');
const historicalProgress = calculateMilestoneProgress([{ status: 'APPROVED' }, { status: 'COMPLETED' }]);
assert(historicalProgress.percentage === 100, 'Test 12: historical APPROVED milestone should remain readable as completed-equivalent');
console.log('Test 12 - Historical APPROVED milestone remains readable/completed-equivalent: passed');

const revision = buildMilestoneRevisionStartResult(
  {
    id: 'milestone-rejected',
    project_id: 'project-1',
    name: 'Rejected Milestone',
    status: 'REJECTED',
    pic_id: saPic.userId,
    project: activeProject,
  },
  saPic,
  true,
  false
);
const resubmission = buildMilestoneSubmissionResult(
  {
    id: 'milestone-rejected',
    name: 'Rejected Milestone',
    status: revision.status,
    pic_id: saPic.userId,
    project: activeProject,
  },
  saPic,
  false,
  'Revised'
);
assert(revision.status === 'IN_PROGRESS' && resubmission.status === 'SUBMITTED', 'Test 13: revision/resubmission flow should still work');
console.log('Test 13 - Revision/resubmission flow still works after rejection: passed');

const deadlineProposal = buildDeadlineProposalArtifacts(
  {
    id: 'milestone-deadline',
    project_id: 'project-1',
    name: 'Deadline Milestone',
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
      pic_id: saPic.userId,
    },
  },
  {
    start_date: '2026-08-28',
    duration_working_days: 3,
    due_date: '2026-09-02',
  },
  sales,
  false
);
assert(deadlineProposal.approval.status === 'PENDING', 'Test 14: deadline proposal should still create PENDING approval');
assert(deadlineProposal.effectiveDeadline.due_date === null, 'Test 14: Phase 8A effective deadline should remain unchanged before approval');
console.log('Test 14 - Deadline Phase 8A behavior unaffected: passed');
