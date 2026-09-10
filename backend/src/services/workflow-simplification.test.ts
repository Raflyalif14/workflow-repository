import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildDeadlineProposalArtifacts,
} from './deadline.service';
import { buildDeadlineApprovalResolution } from './deadline-approval.service';
import {
  buildMilestoneApprovalReview,
  shouldCompleteProject,
} from './milestone-approval.service';
import {
  buildInitialMilestoneRows,
  buildMilestoneRevisionStartResult,
  buildMilestoneSubmissionResult,
} from './milestone.service';
import {
  buildInitialTimelineUpdate,
  hasValidInitialTimeline,
  projectPlanConstants,
} from './project-plan-approval.service';
import { MilestoneInitiationApprovalController } from '../controllers/milestone-initiation-approval.controller';
import { getAutoStartBlockReason, isMilestoneCompletedLike } from './workflow-progression.service';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const assertThrows = (name: string, action: () => unknown) => {
  try {
    action();
  } catch {
    console.log(`${name}: passed`);
    return;
  }

  throw new Error(`${name}: expected rejection`);
};

const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Test' };
const headSa = { userId: 'headsa-1', role: 'HEAD_SA', fullName: 'Head SA Test' };
const sa = { userId: 'sa-1', role: 'SA', fullName: 'SA Test' };
const activeProject = { status: 'ACTIVE', is_postponed: false };

const stages = [
  { id: 'stage-1', name: 'Create Project', description: null, step_order: 1 },
  { id: 'stage-2', name: 'Set Deadline', description: null, step_order: 2 },
  { id: 'stage-3', name: 'MoM', description: null, step_order: 3 },
  { id: 'stage-4', name: 'Assign PIC', description: null, step_order: 4 },
  { id: 'stage-5', name: 'Requirement Gathering', description: null, step_order: 5 },
  { id: 'stage-6', name: 'Tender Process', description: null, step_order: 6 },
];

const rows = buildInitialMilestoneRows('project-1', stages, '2026-08-31T03:00:00.000Z');
assert(rows[0].status === 'COMPLETED', 'Test 1: Create Project must be completed');
console.log('Test 1 - Project creation completes Create Project');

assert(rows[0].completed_at === '2026-08-31T03:00:00.000Z', 'Test 2: completed_at must be stored');
console.log('Test 2 - Create Project has completed_at');

assert(rows[1].status === 'IN_PROGRESS', 'Test 3: Set Deadline must be in progress');
console.log('Test 3 - Project creation starts Set Deadline');

assert(rows.slice(2).every((row) => row.status === 'CREATED'), 'Test 4: remaining stages must stay created');
console.log('Test 4 - Executable stages remain CREATED before plan approval');

const executableTimeline = [
  { id: 'stage-1', project_id: 'project-1', name: 'Create Project', step_order: 1, status: 'COMPLETED', start_date: null, duration_working_days: null, due_date: null },
  { id: 'stage-2', project_id: 'project-1', name: 'Set Deadline', step_order: 2, status: 'IN_PROGRESS', start_date: null, duration_working_days: null, due_date: null },
  { id: 'stage-3', project_id: 'project-1', name: 'MoM', step_order: 3, status: 'CREATED', start_date: '2026-09-01', duration_working_days: 2, due_date: '2026-09-02' },
  { id: 'stage-4', project_id: 'project-1', name: 'Assign PIC', step_order: 4, status: 'CREATED', start_date: '2026-09-03', duration_working_days: 1, due_date: '2026-09-03' },
];
assert(hasValidInitialTimeline(executableTimeline), 'Test 5: complete executable timeline should be valid');
console.log('Test 5 - DRAFT initial timeline can be valid without a milestone approval');

const initialTimelineUpdate = buildInitialTimelineUpdate(executableTimeline[2], {
  start_date: '2026-09-01',
  duration_working_days: 2,
  due_date: '2026-09-02',
});
assert(!('approval' in initialTimelineUpdate) && initialTimelineUpdate.due_date === '2026-09-02', 'Test 6: initial timeline update must write effective deadline directly');
console.log('Test 6 - DRAFT timeline update creates no milestone deadline approval artifact');

assertThrows('Test 7 - Planning stages cannot be edited in the executable timeline', () =>
  buildInitialTimelineUpdate(executableTimeline[1], {
    start_date: '2026-09-01',
    duration_working_days: 1,
    due_date: '2026-09-01',
  })
);

assert(!hasValidInitialTimeline([{ ...executableTimeline[2], due_date: null }]), 'Test 8: incomplete timeline must be rejected before submission');
console.log('Test 8 - Missing deadline makes initial timeline invalid');

const activeMilestone = {
  id: 'milestone-1',
  project_id: 'project-1',
  name: 'Requirement Gathering',
  status: 'CREATED',
  start_date: '2026-09-01',
  duration_working_days: 2,
  due_date: '2026-09-02',
  project: { id: 'project-1', name: 'Project Test', sales_id: sales.userId, status: 'ACTIVE', is_postponed: false, pic_id: sa.userId },
};
const proposedDeadline = { start_date: '2026-09-01', duration_working_days: 3, due_date: '2026-09-03' };
const deadlineChange = buildDeadlineProposalArtifacts(activeMilestone, proposedDeadline, sales, false, 'Customer requested more time');
assert(deadlineChange.approval.status === 'PENDING', 'Test 9: ACTIVE deadline changes should still require approval');
console.log('Test 9 - ACTIVE deadline change creates a PENDING approval');

assertThrows('Test 10 - DRAFT deadline uses project timeline, not deadline approval', () =>
  buildDeadlineProposalArtifacts(
    { ...activeMilestone, project: { ...activeMilestone.project, status: 'DRAFT' } },
    proposedDeadline,
    sales,
    false,
    'Draft change'
  )
);

const rejectedDeadline = buildDeadlineApprovalResolution('PENDING', 'REJECTED', headSa.userId, deadlineChange.history, {
  start_date: activeMilestone.start_date,
  duration_working_days: activeMilestone.duration_working_days,
  due_date: activeMilestone.due_date,
}, 'Keep the approved timeline');
assert(rejectedDeadline.effectiveDeadline.due_date === '2026-09-02', 'Test 11: rejected change keeps effective deadline');
console.log('Test 11 - Rejected active deadline change keeps old effective deadline');

const approvedDeadline = buildDeadlineApprovalResolution('PENDING', 'APPROVED', headSa.userId, deadlineChange.history, {
  start_date: activeMilestone.start_date,
  duration_working_days: activeMilestone.duration_working_days,
  due_date: activeMilestone.due_date,
});
assert(approvedDeadline.effectiveDeadline.due_date === '2026-09-03', 'Test 12: approved change applies new effective deadline');
console.log('Test 12 - Approved active deadline change applies the proposal');

assert(getAutoStartBlockReason('SALES', null) === null && getAutoStartBlockReason('HEAD_SA', null) === null, 'Test 13: SALES and HEAD_SA stages auto-start');
console.log('Test 13 - SALES and HEAD_SA stages can auto-start without PIC');

assert(getAutoStartBlockReason('SA', null) === 'PIC_REQUIRED', 'Test 14: SA stage needs PIC');
console.log('Test 14 - SA auto-start waits for PIC');

assert(getAutoStartBlockReason('SA', sa.userId) === null, 'Test 15: assigned SA stage auto-starts');
console.log('Test 15 - Assigned SA stage is eligible for auto-start');

assert(isMilestoneCompletedLike('COMPLETED') && isMilestoneCompletedLike('APPROVED'), 'Test 16: historical APPROVED remains completed-equivalent');
console.log('Test 16 - COMPLETED and historical APPROVED are completed-equivalent');

assert(shouldCompleteProject('ACTIVE', [{ status: 'COMPLETED' }, { status: 'APPROVED' }]), 'Test 17: completed final stage completes project');
console.log('Test 17 - Final completed stage can complete project');

const submission = buildMilestoneSubmissionResult({
  id: 'milestone-sa',
  name: 'Requirement Gathering',
  status: 'IN_PROGRESS',
  pic_id: sa.userId,
  project: activeProject,
}, sa, false, 'Ready for review');
assert(submission.status === 'SUBMITTED' && submission.approval.status === 'PENDING', 'Test 18: SA submission remains reviewed');
console.log('Test 18 - SA work still submits for HEAD_SA review');

const rejection = buildMilestoneApprovalReview('PENDING', 'SUBMITTED', activeProject, 'REJECTED', headSa, 'Please revise');
assert(rejection.milestone.status === 'REJECTED', 'Test 19: HEAD_SA rejection keeps revision flow');
console.log('Test 19 - SA rejection remains REJECTED');

const revision = buildMilestoneRevisionStartResult({
  id: 'milestone-sa', project_id: 'project-1', name: 'Requirement Gathering', status: 'REJECTED', pic_id: sa.userId, project: activeProject,
}, sa, true, false);
assert(revision.status === 'IN_PROGRESS', 'Test 20: SA can start revision');
console.log('Test 20 - SA revision returns the milestone to IN_PROGRESS');

const projectRoutes = readFileSync(join(__dirname, '../routes/project.routes.ts'), 'utf8');
assert(projectRoutes.includes("'/:projectId/timeline'") && projectRoutes.includes("'/:projectId/plan/submit'") && projectRoutes.includes("'/:projectId/plan/approve'"), 'Test 21: project timeline and plan review routes must be registered');
console.log('Test 21 - Timeline and project-plan endpoints are registered');

const migration = readFileSync(join(__dirname, '../../supabase/phase10a-project-plan-approvals.sql'), 'utf8');
assert(migration.includes('create table if not exists public.project_plan_approvals') && migration.includes('where status = \'PENDING\''), 'Test 22: project plan migration must enforce one pending approval');
console.log('Test 22 - Project plan migration includes a partial pending-approval index');

const milestoneRoutes = readFileSync(join(__dirname, '../routes/milestone.routes.ts'), 'utf8');
const milestoneController = readFileSync(join(__dirname, '../controllers/milestone.controller.ts'), 'utf8');
assert(
  /router\.post\(\s*'\/:milestoneId\/start',\s*MilestoneInitiationApprovalController\.retired\s*\);/s.test(milestoneRoutes) &&
    milestoneRoutes.includes("'/:milestoneId/complete'") &&
    !/static async start\(/.test(milestoneController),
  'Test 23: manual start must be retired without a mutating controller entry point'
);
console.log('Test 23 - Manual Start Stage is retired while automatic completion remains available');

let retiredStatusCode: number | undefined;
MilestoneInitiationApprovalController.retired(
  {} as never,
  {
    status: (statusCode: number) => {
      retiredStatusCode = statusCode;
      return { json: () => undefined };
    },
  } as never
);
assert(retiredStatusCode === 410, 'Test 23b: retired manual start handler must return HTTP 410 without a workflow mutation');
console.log('Test 23b - Retired manual Start Stage responds with HTTP 410');

const assignmentSource = readFileSync(join(__dirname, 'assignment-phase5.service.ts'), 'utf8');
const dashboardSource = readFileSync(join(__dirname, 'dashboard.service.ts'), 'utf8');
assert(assignmentSource.includes('completeAssignPicStageIfCurrent') && dashboardSource.includes("from('project_plan_approvals')") && !dashboardSource.includes("from('milestone_initiation_approvals')"), 'Test 24: assignment auto-completes current Assign PIC and dashboard excludes initiation');
console.log('Test 24 - Assign PIC and dashboard use simplified workflow behavior');

assert(projectPlanConstants.PROJECT_CREATION_STEP_ORDER === 1 && projectPlanConstants.TIMELINE_PLANNING_STEP_ORDER === 2, 'Planning step constants must remain stable');
