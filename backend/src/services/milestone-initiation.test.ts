import { buildMilestoneSubmissionResult } from './milestone.service';
import {
  buildMilestoneInitiatedActivityLog,
  buildMilestoneInitiationResult,
} from './milestone-initiation-approval.service';

const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' };
const otherSales = { userId: 'sales-2', role: 'SALES', fullName: 'Sales Other' };
const saPic = { userId: 'sa-1', role: 'SA', fullName: 'Solution Architect Test 2' };

const createdMilestone = {
  id: 'milestone-1',
  project_id: 'project-1',
  name: 'Customer Assessment',
  status: 'CREATED',
  pic_id: 'sa-1',
  pic: {
    id: 'sa-1',
    full_name: 'Solution Architect Test 2',
  },
  start_date: '2026-08-28',
  duration_working_days: 3,
  due_date: '2026-09-02',
  project: {
    sales_id: 'sales-1',
    status: 'ACTIVE',
    is_postponed: false,
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

const initiated = buildMilestoneInitiationResult(createdMilestone, sales, 'APPROVED', 'APPROVED');
assert(initiated.status === 'IN_PROGRESS', 'Test 1: milestone should move to IN_PROGRESS');
assert(initiated.initiated_by.id === sales.userId, 'Test 1: initiated_by should be authenticated SALES');
console.log('Test 1 - SALES owner + CREATED + PIC + approved deadline + approved initiation approval: IN_PROGRESS');

assertThrows('Test 2 - SALES is not project owner', () =>
  buildMilestoneInitiationResult(createdMilestone, otherSales, 'APPROVED', 'APPROVED')
);

assertThrows('Test 3 - Milestone is not CREATED', () =>
  buildMilestoneInitiationResult({ ...createdMilestone, status: 'IN_PROGRESS' }, sales, 'APPROVED', 'APPROVED')
);

assertThrows('Test 4 - PIC null', () =>
  buildMilestoneInitiationResult({ ...createdMilestone, pic_id: null, pic: null }, sales, 'APPROVED', 'APPROVED')
);

assertThrows('Test 5 - Deadline missing', () =>
  buildMilestoneInitiationResult({ ...createdMilestone, due_date: null }, sales, 'APPROVED', 'APPROVED')
);

assertThrows('Test 6 - Deadline approval is not APPROVED', () =>
  buildMilestoneInitiationResult(createdMilestone, sales, 'PENDING', 'APPROVED')
);

assertThrows('Test 7 - No initiation approval', () =>
  buildMilestoneInitiationResult(createdMilestone, sales, 'APPROVED', null)
);

assertThrows('Test 8 - Latest initiation approval PENDING', () =>
  buildMilestoneInitiationResult(createdMilestone, sales, 'APPROVED', 'PENDING')
);

assertThrows('Test 9 - Latest initiation approval REJECTED', () =>
  buildMilestoneInitiationResult(createdMilestone, sales, 'APPROVED', 'REJECTED')
);

const firstInitiate = buildMilestoneInitiationResult(createdMilestone, sales, 'APPROVED', 'APPROVED');
assert(firstInitiate.status === 'IN_PROGRESS', 'Test 10: first initiate should succeed');
assertThrows('Test 10 - Duplicate initiate', () =>
  buildMilestoneInitiationResult({ ...createdMilestone, status: firstInitiate.status }, sales, 'APPROVED', 'APPROVED')
);
console.log('Test 10 - Duplicate initiate: first succeeds, second rejected, status remains IN_PROGRESS');

assertThrows('Test 11 - Project POSTPONED', () =>
  buildMilestoneInitiationResult(
    { ...createdMilestone, project: { ...createdMilestone.project, status: 'POSTPONED' } },
    sales,
    'APPROVED',
    'APPROVED'
  )
);

assertThrows('Test 11 - Project is_postponed=true', () =>
  buildMilestoneInitiationResult(
    { ...createdMilestone, project: { ...createdMilestone.project, is_postponed: true } },
    sales,
    'APPROVED',
    'APPROVED'
  )
);

assert(!('approval' in initiated), 'Test 12: initiate result should not include milestone_approvals data');
console.log('Test 12 - Successful initiate does not create or return public.milestone_approvals row');

const submission = buildMilestoneSubmissionResult(
  {
    id: createdMilestone.id,
    name: createdMilestone.name,
    status: initiated.status,
    pic_id: saPic.userId,
    project: { status: 'ACTIVE', is_postponed: false },
  },
  saPic,
  false
);
assert(submission.status === 'SUBMITTED', 'Test 13: existing submission flow should accept IN_PROGRESS milestone');
assert(submission.approval.status === 'PENDING', 'Test 13: existing submission flow should create PENDING submission approval');
console.log('Test 13 - After initiate, existing SA submission flow accepts IN_PROGRESS');

const activityLog = buildMilestoneInitiatedActivityLog(sales, createdMilestone);
assert(activityLog.action === 'MILESTONE_INITIATED', 'Activity log: action should be MILESTONE_INITIATED');
assert(activityLog.project_id === createdMilestone.project_id, 'Activity log: project_id should match milestone project');
assert(activityLog.user_id === sales.userId, 'Activity log: user_id should be authenticated SALES');
console.log('Activity Log Test - MILESTONE_INITIATED with project_id and authenticated SALES user_id');
