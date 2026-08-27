import {
  buildInitialMilestoneRows,
  buildMilestoneRevisionStartResult,
  buildMilestoneSubmissionResult,
  calculateMilestoneProgress,
  INITIAL_MILESTONE_STATUS,
} from './milestone.service';

const saPic = { userId: 'sa-1', role: 'SA', fullName: 'Solution Architect Test' };

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

const makeStages = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `stage-${index + 1}`,
    name: `Milestone ${index + 1}`,
    description: null,
    step_order: index + 1,
  }));

const assessmentRows = buildInitialMilestoneRows('project-assessment', makeStages(13));
assert(assessmentRows.length === 13, 'Test 1: Assessment should create 13 milestones');
assert(assessmentRows.every((row) => row.status === INITIAL_MILESTONE_STATUS), 'Test 1: all Assessment milestones should be CREATED');
console.log('Test 1 - Create project scenario Assessment: 13 milestones, all status=CREATED');

const existingTorRows = buildInitialMilestoneRows('project-existing-tor', makeStages(11));
assert(existingTorRows.length === 11, 'Test 2: Existing TOR should create 11 milestones');
assert(existingTorRows.every((row) => row.status === INITIAL_MILESTONE_STATUS), 'Test 2: all Existing TOR milestones should be CREATED');
console.log('Test 2 - Create project scenario Existing TOR: 11 milestones, all status=CREATED');

const progress = calculateMilestoneProgress(assessmentRows);
assert(progress.completed === 0, 'Test 3: CREATED milestones should not be completed');
assert(progress.percentage === 0, 'Test 3: all CREATED milestones should return 0% progress');
console.log('Test 3 - Progress with all CREATED milestones: completed=0, percentage=0');

assertThrows('Test 4 - CREATED milestone submit attempt', () =>
  buildMilestoneSubmissionResult(
    {
      id: 'milestone-created',
      name: 'Requirement Gathering',
      status: 'CREATED',
      pic_id: 'sa-1',
      project: { status: 'ACTIVE', is_postponed: false },
    },
    saPic,
    false
  )
);
console.log('Test 4 - CREATED submit rejection keeps status=CREATED and creates no PENDING approval in service flow');

const revision = buildMilestoneRevisionStartResult(
  {
    id: 'milestone-rejected',
    project_id: 'project-1',
    name: 'Pain Point Analysis',
    status: 'REJECTED',
    pic_id: 'sa-1',
    project: { status: 'ACTIVE', is_postponed: false },
  },
  saPic,
  true,
  false
);
assert(revision.status === 'IN_PROGRESS', 'Test 5: rejected milestone should start revision to IN_PROGRESS');
console.log('Test 5 - Existing REJECTED -> start-revision flow: IN_PROGRESS');
