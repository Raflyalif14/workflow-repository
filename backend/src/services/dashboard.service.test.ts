import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildDashboardOverviewFromRows,
  countOverdueMilestones,
  countWaitingApprovals,
  DashboardSourceRows,
  isProjectVisibleToActor,
  toSafeDashboardError,
} from './dashboard.service';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const rows: DashboardSourceRows = {
  projects: [
    { id: 'project-sales', name: 'Sales Project', customer: 'Customer A', scenario_id: 'scenario-assessment', sales_id: 'sales-1', pic_id: 'sa-2', status: 'ACTIVE', is_postponed: false, updated_at: '2026-08-28T04:00:00.000Z' },
    { id: 'project-sales-completed', name: 'Completed Sales Project', customer: 'Customer B', scenario_id: 'scenario-assessment', sales_id: 'sales-1', pic_id: 'sa-2', status: 'COMPLETED', is_postponed: false, updated_at: '2026-08-27T04:00:00.000Z' },
    { id: 'project-draft', name: 'Draft Sales Project', customer: 'Customer F', scenario_id: 'scenario-assessment', sales_id: 'sales-1', pic_id: null, status: 'DRAFT', is_postponed: false, updated_at: '2026-08-26T04:00:00.000Z' },
    { id: 'project-sa', name: 'SA Project', customer: 'Customer C', scenario_id: 'scenario-tor', sales_id: 'sales-2', pic_id: 'sa-1', status: 'ACTIVE', is_postponed: false, updated_at: '2026-08-25T04:00:00.000Z' },
    { id: 'project-postponed', name: 'Postponed Project', customer: 'Customer D', scenario_id: 'scenario-tor', sales_id: 'sales-3', pic_id: 'sa-3', status: 'POSTPONED', is_postponed: true, updated_at: '2026-08-24T04:00:00.000Z' },
    { id: 'project-cancelled', name: 'Cancelled Project', customer: 'Customer E', scenario_id: null, sales_id: 'sales-3', pic_id: 'sa-3', status: 'CANCELLED', is_postponed: false, updated_at: '2026-08-23T04:00:00.000Z' },
  ],
  milestones: [
    { id: 'milestone-overdue', project_id: 'project-sales', status: 'IN_PROGRESS', due_date: '2026-08-20' },
    { id: 'milestone-completed', project_id: 'project-sales', status: 'COMPLETED', due_date: '2026-08-20' },
    { id: 'milestone-historical-approved', project_id: 'project-sales', status: 'APPROVED', due_date: '2026-08-21' },
    { id: 'milestone-submission', project_id: 'project-sales', status: 'SUBMITTED', due_date: '2026-09-01' },
    { id: 'milestone-completed-project-open', project_id: 'project-sales-completed', status: 'CREATED', due_date: '2026-08-20' },
    { id: 'milestone-draft', project_id: 'project-draft', status: 'IN_PROGRESS', due_date: '2026-08-20' },
    { id: 'milestone-sa', project_id: 'project-sa', status: 'CREATED', due_date: '2026-08-29' },
    { id: 'milestone-postponed', project_id: 'project-postponed', status: 'IN_PROGRESS', due_date: '2026-08-20' },
    { id: 'milestone-cancelled', project_id: 'project-cancelled', status: 'IN_PROGRESS', due_date: '2026-08-20' },
  ],
  scenarios: [
    { id: 'scenario-assessment', name: 'Assessment' },
    { id: 'scenario-tor', name: 'Existing TOR' },
  ],
  deadlineApprovals: [
    { id: 'deadline-active', milestone_id: 'milestone-overdue', status: 'PENDING' },
    { id: 'deadline-draft', milestone_id: 'milestone-draft', status: 'PENDING' },
  ],
  projectPlanApprovals: [
    { id: 'plan-1', project_id: 'project-draft', status: 'PENDING' },
  ],
  milestoneApprovals: [
    { id: 'submission-active', milestone_id: 'milestone-submission', status: 'PENDING' },
    { id: 'submission-postponed', milestone_id: 'milestone-postponed', status: 'PENDING' },
  ],
  activityLogs: [
    { id: 'activity-1', project_id: 'project-sales', user_id: 'sales-1', action: 'MILESTONE_STARTED', description: "Sales Test started milestone 'Assessment'", created_at: '2026-08-28T06:00:00.000Z' },
    { id: 'activity-2', project_id: 'project-cancelled', user_id: 'sales-3', action: 'UNKNOWN_RUNTIME_ACTION', description: null, created_at: '2026-08-28T05:00:00.000Z' },
  ],
  users: [
    { id: 'sales-1', full_name: 'Sales Test', role: 'SALES' },
    { id: 'sales-3', full_name: 'Other Sales', role: 'SALES' },
  ],
  saUsers: [
    { id: 'sa-1', full_name: 'Solution Architect One', role: 'SA', is_active: true },
    { id: 'sa-2', full_name: 'Solution Architect Two', role: 'SA', is_active: true },
    { id: 'sa-3', full_name: 'Solution Architect Three', role: 'SA', is_active: true },
    { id: 'sa-zero', full_name: 'Solution Architect Zero', role: 'SA', is_active: true },
    { id: 'sa-inactive', full_name: 'Inactive Solution Architect', role: 'SA', is_active: false },
  ],
  outputDocuments: [
    { project_id: 'project-sales', status: 'IN_REVIEW', is_required: true, is_selected: true },
    { project_id: 'project-sales', status: 'APPROVED', is_required: true, is_selected: true },
    { project_id: 'project-sa', status: 'REVISION_REQUIRED', is_required: true, is_selected: true },
    { project_id: 'project-sa', status: 'DRAFT', is_required: false, is_selected: true },
    { project_id: 'project-postponed', status: 'IN_REVIEW', is_required: true, is_selected: true },
  ],
};

const superAdmin = { userId: 'admin-1', role: 'SUPER_ADMIN' };
const sales = { userId: 'sales-1', role: 'SALES' };
const sa = { userId: 'sa-1', role: 'SA' };
const headSa = { userId: 'head-sa-1', role: 'HEAD_SA' };
const today = '2026-08-28';

const superDashboard = buildDashboardOverviewFromRows(rows, superAdmin, today);
assert(superDashboard.summary.totalProjects === 6, 'Test 1: SUPER_ADMIN should see all projects');
console.log('Test 1 - SUPER_ADMIN scope returns all projects: passed');

const salesDashboard = buildDashboardOverviewFromRows(rows, sales, today);
assert(salesDashboard.summary.totalProjects === 3, 'Test 2: SALES should see only owned projects');
assert(salesDashboard.projectProgress.every((project) => ['project-sales', 'project-sales-completed'].includes(project.id)), 'Test 2: SALES progress should exclude DRAFT project planning');
console.log('Test 2 - SALES sees only own sales_id projects: passed');

const saDashboard = buildDashboardOverviewFromRows(rows, sa, today);
assert(saDashboard.summary.totalProjects === 1 && saDashboard.projectProgress[0]?.id === 'project-sa', 'Test 3: SA should see only projects where project.pic_id matches actor');
console.log('Test 3 - SA sees only projects where project.pic_id = actor.userId: passed');

assert(isProjectVisibleToActor(rows.projects[0], headSa) && buildDashboardOverviewFromRows(rows, headSa, today).summary.totalProjects === 6, 'Test 4: HEAD_SA should access workflow dashboard scope');
console.log('Test 4 - HEAD_SA access semantics works: passed');

assert(superDashboard.summary.activeProjects === 2, 'Test 5: ACTIVE projects should be counted as active');
assert(superDashboard.summary.postponedProjects === 1 && superDashboard.summary.onHoldProjects === 1, 'Test 5: POSTPONED should map to legacy onHold alias');
console.log('Test 5 - Dashboard keeps DRAFT, ACTIVE, POSTPONED, COMPLETED, and CANCELLED live statuses: passed');

assert(countOverdueMilestones(rows.milestones, rows.projects, today) === 1, 'Test 6: overdue should use due_date and exclude completed/postponed/cancelled');
console.log('Test 6 - Overdue uses due_date and excludes completed/postponed/cancelled milestones: passed');

assert(superDashboard.summary.waitingApproval === 3, 'Test 7: waiting approval should include project plan, active deadline, and active submission');
assert(countWaitingApprovals(new Set(['milestone-overdue']), rows.deadlineApprovals, rows.milestoneApprovals) === 1, 'Test 7: milestone approval count should stay scoped by milestone id');
console.log('Test 7 - Waiting approval excludes initiation and includes pending project plan approvals: passed');

const assessmentDistribution = salesDashboard.scenarioDistribution.find((item) => item.scenarioName === 'Assessment');
assert(assessmentDistribution?.count === 3, 'Test 8: scenario distribution should count scoped projects per scenario');
console.log('Test 8 - Scenario distribution correct: passed');

const salesProgress = salesDashboard.projectProgress.find((project) => project.id === 'project-sales');
const completedProjectProgress = salesDashboard.projectProgress.find((project) => project.id === 'project-sales-completed');
assert(salesProgress?.completedMilestones === 2 && salesProgress.percentage === 50, 'Test 9: COMPLETED and historical APPROVED milestones should be completed-equivalent');
assert(completedProjectProgress?.percentage === 100, 'Test 9: COMPLETED project should show 100%');
console.log('Test 9 - Project progress uses completed-equivalent statuses and completed project 100%: passed');

assert(salesDashboard.recentActivity[0]?.details === "Sales Test started milestone 'Assessment'", 'Test 10: recent activity should use live description');
assert(salesDashboard.recentActivity[0]?.action === 'MILESTONE_STARTED', 'Test 10: recent activity should preserve action');
console.log('Test 10 - Recent activity uses live schema description/action: passed');

const emptyDashboard = buildDashboardOverviewFromRows(rows, { userId: 'sa-empty', role: 'SA' }, today);
assert(emptyDashboard.summary.totalProjects === 0 && emptyDashboard.projectProgress.length === 0 && emptyDashboard.recentActivity.length === 0, 'Test 11: zero project role should return empty dashboard');
console.log('Test 11 - Role with zero project returns valid empty dashboard: passed');

try {
  throw toSafeDashboardError(new Error('service role key leaked detail'), 'projects');
} catch (error: any) {
  assert(error.message === 'Failed to load dashboard data.', 'Test 12: Supabase error should be safe');
  assert(!error.message.includes('service role'), 'Test 12: safe error should not expose internal detail');
  console.log('Test 12 - Supabase error handled safely: passed');
}

const serviceSource = readFileSync(join(__dirname, 'dashboard.service.ts'), 'utf8');
const removedOrm = ['pri', 'sma'].join('');
assert(!serviceSource.includes(`../config/${removedOrm}`) && !serviceSource.includes(`${removedOrm}.`), 'Test 13: DashboardService should contain no removed ORM runtime query');
assert(!serviceSource.includes("from('milestone_initiation_approvals')"), 'Test 13: dashboard must not count initiation approvals');
console.log('Test 13 - Dashboard uses Supabase runtime and excludes initiation approval KPI: passed');

const headSaOutputQueue = buildDashboardOverviewFromRows(rows, headSa, today).outputDocuments.reviewQueue;
assert(headSaOutputQueue.length === 1 && headSaOutputQueue[0].projectId === 'project-sales' && headSaOutputQueue[0].count === 1, 'Test 14: HEAD_SA should receive one grouped active-project IN_REVIEW queue item');
const saOutputQueue = buildDashboardOverviewFromRows(rows, sa, today).outputDocuments.revisionQueue;
assert(saOutputQueue.length === 1 && saOutputQueue[0].projectId === 'project-sa' && saOutputQueue[0].count === 1, 'Test 14: assigned SA should receive only its active-project REVISION_REQUIRED output queue');
assert(buildDashboardOverviewFromRows(rows, { userId: 'sa-other', role: 'SA' }, today).outputDocuments.revisionQueue.length === 0, 'Test 14: non-PIC SA must not receive output tasks');
console.log('Test 14 - Output queues are role-scoped, grouped by project, and exclude postponed work: passed');

const salesOutputProgress = salesDashboard.outputDocuments.salesProgress;
const ownedOutputProgress = salesOutputProgress.find((item) => item.projectId === 'project-sales');
assert(ownedOutputProgress?.approvedCount === 1 && ownedOutputProgress.selectedCount === 2, 'Test 15: SALES sees approved/selected aggregate only');
assert(!salesOutputProgress.some((item) => item.projectId === 'project-sa'), 'Test 15: SALES must not receive another project output aggregate');
assert(!JSON.stringify(salesOutputProgress).includes('IN_REVIEW') && !JSON.stringify(salesOutputProgress).includes('REVISION_REQUIRED'), 'Test 15: SALES aggregate must not expose non-final statuses');
console.log('Test 15 - SALES output progress is owner-scoped and contains aggregate counts only: passed');

const workloadRows: DashboardSourceRows = {
  ...rows,
  milestones: [
    ...rows.milestones,
    { id: 'milestone-sa-revision', project_id: 'project-sa', status: 'REJECTED', due_date: '2026-09-05' },
    { id: 'milestone-sa-revision-started', project_id: 'project-sa', status: 'IN_PROGRESS', due_date: '2026-09-06' },
    { id: 'milestone-sa-history-pending', project_id: 'project-sa', status: 'IN_PROGRESS', due_date: '2026-09-07' },
    { id: 'milestone-sa-history-approved', project_id: 'project-sa', status: 'IN_PROGRESS', due_date: '2026-09-08' },
    { id: 'milestone-sa-completed', project_id: 'project-sa', status: 'COMPLETED', due_date: '2026-08-20' },
    { id: 'milestone-sa-waiting', project_id: 'project-sa', status: 'SUBMITTED', due_date: '2026-08-20' },
  ],
  milestoneApprovals: [
    ...rows.milestoneApprovals,
    { id: 'revision-rejected', milestone_id: 'milestone-sa-revision', status: 'REJECTED', submitted_at: '2026-09-01T08:00:00.000Z' },
    { id: 'revision-started-rejected', milestone_id: 'milestone-sa-revision-started', status: 'REJECTED', submitted_at: '2026-09-02T08:00:00.000Z' },
    { id: 'history-pending-rejected', milestone_id: 'milestone-sa-history-pending', status: 'REJECTED', submitted_at: '2026-09-01T08:00:00.000Z' },
    { id: 'history-pending-current', milestone_id: 'milestone-sa-history-pending', status: 'PENDING', submitted_at: '2026-09-03T08:00:00.000Z' },
    { id: 'history-approved-rejected', milestone_id: 'milestone-sa-history-approved', status: 'REJECTED', submitted_at: '2026-09-01T08:00:00.000Z' },
    { id: 'history-approved-current', milestone_id: 'milestone-sa-history-approved', status: 'APPROVED', submitted_at: '2026-09-04T08:00:00.000Z' },
    { id: 'submission-sa-waiting', milestone_id: 'milestone-sa-waiting', status: 'PENDING' },
  ],
};
const workload = buildDashboardOverviewFromRows(workloadRows, headSa, today).saWorkload;
const saOneWorkload = workload.find((item) => item.saId === 'sa-1');
const saTwoWorkload = workload.find((item) => item.saId === 'sa-2');
const saThreeWorkload = workload.find((item) => item.saId === 'sa-3');
const idleSaWorkload = workload.find((item) => item.saId === 'sa-zero');
assert(workload.length === 4 && !workload.some((item) => item.saId === 'sa-inactive'), 'Test 16: HEAD_SA should receive every active SA and exclude inactive users');
assert(saOneWorkload?.activeProjectCount === 1 && saOneWorkload.activeMilestoneCount === 4, 'Test 16: active SA work must include revision work and exclude completed milestones');
assert(saOneWorkload?.revisionCount === 3, 'Test 16: rejected milestones, active revisions, and output revisions must be attributed to the project PIC without duplication');
assert(saOneWorkload?.waitingReviewCount === 1 && saOneWorkload.overdueCount === 0, 'Test 16: waiting review must not count as actionable overdue work');
assert(saOneWorkload?.nearestDeadline === '2026-09-05', 'Test 16: nearest deadline must use actionable valid date-only work');
const revisionCountForOnlyMilestone = (milestoneId: string) => {
  const scenario: DashboardSourceRows = {
    ...workloadRows,
    milestones: workloadRows.milestones.filter((milestone) => milestone.project_id !== 'project-sa' || milestone.id === milestoneId),
    milestoneApprovals: workloadRows.milestoneApprovals.filter((approval) => approval.milestone_id === milestoneId),
    outputDocuments: [],
  };
  return buildDashboardOverviewFromRows(scenario, headSa, today).saWorkload.find((item) => item.saId === 'sa-1')?.revisionCount;
};
assert(revisionCountForOnlyMilestone('milestone-sa-revision') === 1, 'Test 16: a REJECTED milestone must count once even when its latest approval is REJECTED');
assert(revisionCountForOnlyMilestone('milestone-sa-revision-started') === 1, 'Test 16: an IN_PROGRESS milestone with latest REJECTED approval must count as revision work');
assert(revisionCountForOnlyMilestone('milestone-sa-history-pending') === 0, 'Test 16: historical REJECTED approval must not count after a latest PENDING decision');
assert(revisionCountForOnlyMilestone('milestone-sa-history-approved') === 0, 'Test 16: historical REJECTED approval must not count after a latest APPROVED decision');
const outputOnlyScenario: DashboardSourceRows = {
  ...workloadRows,
  milestones: workloadRows.milestones.filter((milestone) => milestone.project_id !== 'project-sa'),
  milestoneApprovals: [],
  outputDocuments: workloadRows.outputDocuments?.filter((output) => output.project_id === 'project-sa'),
};
assert(buildDashboardOverviewFromRows(outputOnlyScenario, headSa, today).saWorkload.find((item) => item.saId === 'sa-1')?.revisionCount === 1, 'Test 16: REVISION_REQUIRED output documents must remain attributed to the project PIC');
assert(saTwoWorkload?.activeProjectCount === 1 && saTwoWorkload.activeMilestoneCount === 1 && saTwoWorkload.overdueCount === 1, 'Test 16: active projects must be distinct while actionable overdue milestones remain counted');
assert(saThreeWorkload?.activeProjectCount === 0 && saThreeWorkload.activeMilestoneCount === 0, 'Test 16: postponed projects must not contribute to workload');
assert(idleSaWorkload?.activeProjectCount === 0 && idleSaWorkload.activeMilestoneCount === 0 && idleSaWorkload.nearestDeadline === null, 'Test 16: active SAs without work must remain visible with zero values');
assert(buildDashboardOverviewFromRows(workloadRows, sales, today).saWorkload.length === 0 && buildDashboardOverviewFromRows(workloadRows, sa, today).saWorkload.length === 0 && buildDashboardOverviewFromRows(workloadRows, superAdmin, today).saWorkload.length === 0, 'Test 16: non-HEAD_SA roles must not receive cross-SA workload');
console.log('Test 16 - Head SA SA-workload is role-scoped, actionable, and safely aggregated: passed');
