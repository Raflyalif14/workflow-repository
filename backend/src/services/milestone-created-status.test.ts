import {
  buildInitialMilestoneRows,
  buildMilestoneRevisionStartResult,
  buildMilestoneSubmissionResult,
  calculateMilestoneProgress,
  INITIAL_MILESTONE_STATUS,
  resolveWorkflowInitializationMode,
} from './milestone.service';

const saPic = { userId: 'sa-1', role: 'SA', fullName: 'Solution Architect Test' };
const createdAt = '2026-08-31T03:00:00.000Z';

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

const assessmentRows = buildInitialMilestoneRows('project-assessment', makeStages(13), createdAt);
assert(assessmentRows.length === 13, 'Test 1: Assessment should create 13 milestones');
assert(assessmentRows[0].status === 'COMPLETED' && assessmentRows[0].completed_at === createdAt, 'Test 1: Create Project must be completed');
assert(assessmentRows[1].status === 'IN_PROGRESS', 'Test 1: Set Deadline must be in progress');
assert(assessmentRows.slice(2).every((row) => row.status === INITIAL_MILESTONE_STATUS), 'Test 1: executable milestones should be CREATED');
console.log('Test 1 - New project: step 1 COMPLETED, step 2 IN_PROGRESS, remaining stages CREATED');

const existingTorRows = buildInitialMilestoneRows('project-existing-tor', makeStages(11), createdAt);
assert(existingTorRows[0].status === 'COMPLETED' && existingTorRows[1].status === 'IN_PROGRESS', 'Test 2: Existing TOR planning states should match');
assert(existingTorRows.slice(2).every((row) => row.status === 'CREATED'), 'Test 2: Existing TOR executable stages should be CREATED');
console.log('Test 2 - Existing TOR receives the same DRAFT planning milestone states');

const progress = calculateMilestoneProgress(assessmentRows);
assert(progress.completed === 1, 'Test 3: Create Project should count as completed');
assert(progress.percentage === 8, 'Test 3: 1 of 13 milestones should produce 8% progress');
console.log('Test 3 - Initial progress includes the completed Create Project stage');

const operationalV2Stages = [
  'Customer Assessment',
  'Assessment Report',
  'Requirement Gathering',
  'Pain Point Analysis',
  'Proposal Solution',
  'Deliverables',
  'Technical Proposal & BOQ',
  'Tender Process',
].map((name, index) => ({
  id: `operational-v2-stage-${index + 1}`,
  name,
  description: null,
  step_order: index + 1,
}));
const operationalV2Rows = buildInitialMilestoneRows(
  'project-operational-v2',
  operationalV2Stages,
  createdAt,
  { workflow_model: 'OPERATIONAL_V2', workflow_version: 2 }
);
assert(operationalV2Rows.length === 8, 'Test 4: all active V2 stages should be initialized');
assert(operationalV2Rows[0].name === 'Customer Assessment' && operationalV2Rows[0].status === 'CREATED', 'Test 4: Customer Assessment must remain CREATED');
assert(operationalV2Rows.every((row) => row.status === 'CREATED' && row.completed_at === undefined), 'Test 4: V2 must not auto-complete or auto-start any milestone');
console.log('Test 4 - OPERATIONAL_V2 initializes all eight active stages as CREATED');

const existingTorOperationalV2Stages = [
  'Requirement Gathering',
  'Pain Point Analysis',
  'Proposal Solution',
  'Deliverables',
  'Technical Proposal & BOQ',
  'Tender Process',
].map((name, index) => ({
  id: `existing-tor-operational-v2-stage-${index + 1}`,
  name,
  description: null,
  step_order: index + 1,
}));
const existingTorOperationalV2Rows = buildInitialMilestoneRows(
  'project-existing-tor-operational-v2',
  existingTorOperationalV2Stages,
  createdAt,
  { workflow_model: 'OPERATIONAL_V2', workflow_version: 2 }
);
assert(existingTorOperationalV2Rows.length === 6, 'Test 4b: all six active Existing TOR V2 stages should be initialized');
assert(existingTorOperationalV2Rows[0].name === 'Requirement Gathering', 'Test 4b: Requirement Gathering must be the first operational milestone');
assert(existingTorOperationalV2Rows.every((row) => row.status === 'CREATED' && row.completed_at === undefined), 'Test 4b: Existing TOR V2 must not auto-complete or auto-start any milestone');
console.log('Test 4b - Existing TOR OPERATIONAL_V2 initializes all six active stages as CREATED');

assertThrows('Test 5 - unsupported scenario workflow model/version', () =>
  resolveWorkflowInitializationMode({ workflow_model: 'OPERATIONAL_V2', workflow_version: 1 })
);
console.log('Test 5 - Unsupported scenario workflow model/version is rejected without a legacy fallback');

assert(
  resolveWorkflowInitializationMode({ workflow_model: 'LEGACY', workflow_version: 1, is_active: false } as any) === 'LEGACY',
  'Test 5b: persisted legacy project model resolution must not require scenario is_active=true'
);
console.log('Test 5b - Existing project model resolution remains valid when its LEGACY scenario is inactive');

assertThrows('Test 6 - CREATED milestone submit attempt', () =>
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
console.log('Test 6 - CREATED SA stage cannot be submitted before it starts');

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
assert(revision.status === 'IN_PROGRESS', 'Test 7: rejected milestone should start revision to IN_PROGRESS');
console.log('Test 7 - Existing REJECTED -> start-revision flow: IN_PROGRESS');
