import {
  assertDraftProject,
  assertNoPendingProjectPlanApproval,
  assertProjectPlanApprovalProgressionState,
  assertSalesOwner,
  buildInitialTimelineUpdate,
  buildRejectedProjectPlanReviewResult,
  hasValidInitialTimeline,
} from './project-plan-approval.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertThrows = (name: string, action: () => void): void => {
  try {
    action();
  } catch {
    console.log(`${name}: rejected`);
    return;
  }

  throw new Error(`${name}: expected rejection`);
};

const salesOwner = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Owner' };
const ownerProject = {
  id: 'project-1',
  name: 'Project Test',
  customer: 'Customer Test',
  sales_id: 'sales-1',
  pic_id: null,
  status: 'DRAFT',
  is_postponed: false,
};
const executableMilestone = {
  id: 'milestone-3',
  project_id: 'project-1',
  name: 'Assessment',
  step_order: 3,
  status: 'CREATED',
  start_date: '2026-09-01',
  duration_working_days: 3,
  due_date: '2026-09-03',
};
const setDeadlineMilestone = { ...executableMilestone, id: 'milestone-2', name: 'Set Deadline', step_order: 2, status: 'IN_PROGRESS' };

assertSalesOwner(ownerProject, salesOwner);
assertThrows('Test 1 - Non-owner SALES cannot manage plan', () =>
  assertSalesOwner(ownerProject, { userId: 'sales-2', role: 'SALES', fullName: 'Other Sales' })
);
assertDraftProject(ownerProject);
assertThrows('Test 2 - Non-DRAFT project cannot change plan', () =>
  assertDraftProject({ ...ownerProject, status: 'ACTIVE' })
);
assert(hasValidInitialTimeline([setDeadlineMilestone, executableMilestone]), 'Test 3: complete executable timeline should be valid');
console.log('Test 3 - Full executable timeline required: complete timeline accepted');
assert(!hasValidInitialTimeline([{ ...executableMilestone, due_date: null }]), 'Test 4: incomplete timeline should be invalid');
console.log('Test 4 - Incomplete executable timeline: rejected');
assertThrows('Test 5 - Planning milestone cannot be edited', () =>
  buildInitialTimelineUpdate(setDeadlineMilestone, {
    start_date: '2026-09-01',
    duration_working_days: 3,
    due_date: '2026-09-03',
  })
);
assertThrows('Test 6 - Duplicate pending approval', () =>
  assertNoPendingProjectPlanApproval(true, 'A project plan approval is already pending.')
);

const rejected = buildRejectedProjectPlanReviewResult(ownerProject.status);
assert(rejected.project_status === 'DRAFT' && rejected.next_milestone === null, 'Test 7: rejection must keep project DRAFT');
console.log('Test 7 - Rejected plan remains DRAFT: passed');

assertProjectPlanApprovalProgressionState(ownerProject, setDeadlineMilestone);
console.log('Test 8 - APPROVED plan prerequisites: DRAFT plus IN_PROGRESS Set Deadline accepted');
assertThrows('Test 9 - Set Deadline must be IN_PROGRESS', () =>
  assertProjectPlanApprovalProgressionState(ownerProject, { ...setDeadlineMilestone, status: 'COMPLETED' })
);
assertThrows('Test 10 - Approval progression requires DRAFT project', () =>
  assertProjectPlanApprovalProgressionState({ ...ownerProject, status: 'ACTIVE' }, setDeadlineMilestone)
);
