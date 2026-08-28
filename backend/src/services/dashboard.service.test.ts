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
    {
      id: 'project-sales',
      name: 'Sales Project',
      customer: 'Customer A',
      scenario_id: 'scenario-assessment',
      sales_id: 'sales-1',
      pic_id: 'sa-2',
      status: 'ACTIVE',
      is_postponed: false,
      updated_at: '2026-08-28T04:00:00.000Z',
    },
    {
      id: 'project-sales-completed',
      name: 'Completed Sales Project',
      customer: 'Customer B',
      scenario_id: 'scenario-assessment',
      sales_id: 'sales-1',
      pic_id: 'sa-2',
      status: 'COMPLETED',
      is_postponed: false,
      updated_at: '2026-08-27T04:00:00.000Z',
    },
    {
      id: 'project-sa',
      name: 'SA Project',
      customer: 'Customer C',
      scenario_id: 'scenario-tor',
      sales_id: 'sales-2',
      pic_id: 'sa-1',
      status: 'ACTIVE',
      is_postponed: false,
      updated_at: '2026-08-26T04:00:00.000Z',
    },
    {
      id: 'project-postponed',
      name: 'Postponed Project',
      customer: 'Customer D',
      scenario_id: 'scenario-tor',
      sales_id: 'sales-3',
      pic_id: 'sa-3',
      status: 'POSTPONED',
      is_postponed: true,
      updated_at: '2026-08-25T04:00:00.000Z',
    },
    {
      id: 'project-cancelled',
      name: 'Cancelled Project',
      customer: 'Customer E',
      scenario_id: null,
      sales_id: 'sales-3',
      pic_id: 'sa-3',
      status: 'CANCELLED',
      is_postponed: false,
      updated_at: '2026-08-24T04:00:00.000Z',
    },
  ],
  milestones: [
    { id: 'milestone-overdue', project_id: 'project-sales', status: 'IN_PROGRESS', due_date: '2026-08-20' },
    { id: 'milestone-completed', project_id: 'project-sales', status: 'COMPLETED', due_date: '2026-08-20' },
    { id: 'milestone-historical-approved', project_id: 'project-sales', status: 'APPROVED', due_date: '2026-08-21' },
    { id: 'milestone-completed-project-open', project_id: 'project-sales-completed', status: 'CREATED', due_date: '2026-08-20' },
    { id: 'milestone-sa', project_id: 'project-sa', status: 'CREATED', due_date: '2026-08-29' },
    { id: 'milestone-postponed', project_id: 'project-postponed', status: 'IN_PROGRESS', due_date: '2026-08-20' },
    { id: 'milestone-cancelled', project_id: 'project-cancelled', status: 'IN_PROGRESS', due_date: '2026-08-20' },
  ],
  scenarios: [
    { id: 'scenario-assessment', name: 'Assessment' },
    { id: 'scenario-tor', name: 'Existing TOR' },
  ],
  deadlineApprovals: [
    { id: 'deadline-1', milestone_id: 'milestone-overdue', status: 'PENDING' },
    { id: 'deadline-ignored', milestone_id: 'milestone-sa', status: 'APPROVED' },
  ],
  initiationApprovals: [
    { id: 'initiation-1', milestone_id: 'milestone-historical-approved', status: 'PENDING' },
  ],
  milestoneApprovals: [
    { id: 'submission-1', milestone_id: 'milestone-postponed', status: 'PENDING' },
  ],
  activityLogs: [
    {
      id: 'activity-1',
      project_id: 'project-sales',
      user_id: 'sales-1',
      action: 'MILESTONE_INITIATED',
      description: "Sales Test initiated milestone 'Assessment'",
      created_at: '2026-08-28T06:00:00.000Z',
    },
    {
      id: 'activity-2',
      project_id: 'project-cancelled',
      user_id: 'sales-3',
      action: 'UNKNOWN_RUNTIME_ACTION',
      description: null,
      created_at: '2026-08-28T05:00:00.000Z',
    },
  ],
  users: [
    { id: 'sales-1', full_name: 'Sales Test', role: 'SALES' },
    { id: 'sales-3', full_name: 'Other Sales', role: 'SALES' },
  ],
};

const superAdmin = { userId: 'admin-1', role: 'SUPER_ADMIN' };
const sales = { userId: 'sales-1', role: 'SALES' };
const sa = { userId: 'sa-1', role: 'SA' };
const headSa = { userId: 'head-sa-1', role: 'HEAD_SA' };
const today = '2026-08-28';

const superDashboard = buildDashboardOverviewFromRows(rows, superAdmin, today);
assert(superDashboard.summary.totalProjects === 5, 'Test 1: SUPER_ADMIN should see all projects');
console.log('Test 1 - SUPER_ADMIN scope returns all projects: passed');

const salesDashboard = buildDashboardOverviewFromRows(rows, sales, today);
assert(salesDashboard.summary.totalProjects === 2, 'Test 2: SALES should see only owned projects');
assert(salesDashboard.projectProgress.every((project) => ['project-sales', 'project-sales-completed'].includes(project.id)), 'Test 2: SALES progress should be scoped');
console.log('Test 2 - SALES sees only own sales_id projects: passed');

const saDashboard = buildDashboardOverviewFromRows(rows, sa, today);
assert(saDashboard.summary.totalProjects === 1 && saDashboard.projectProgress[0]?.id === 'project-sa', 'Test 3: SA should see only projects where project.pic_id matches actor');
console.log('Test 3 - SA sees only projects where project.pic_id = actor.userId: passed');

assert(isProjectVisibleToActor(rows.projects[0], headSa) && buildDashboardOverviewFromRows(rows, headSa, today).summary.totalProjects === 5, 'Test 4: HEAD_SA should access workflow dashboard scope');
console.log('Test 4 - HEAD_SA access semantics works: passed');

assert(superDashboard.summary.activeProjects === 2, 'Test 5: ACTIVE projects should be counted as active');
console.log('Test 5 - ACTIVE project counted active: passed');

assert(superDashboard.summary.postponedProjects === 1 && superDashboard.summary.onHoldProjects === 1, 'Test 6: POSTPONED should map to postponed and legacy onHold alias');
assert(!superDashboard.statusDistribution.some((item) => String(item.status) === 'ON_HOLD'), 'Test 6: status distribution should not depend on ON_HOLD');
console.log('Test 6 - POSTPONED handled correctly, no ON_HOLD dependency: passed');

assert(countOverdueMilestones(rows.milestones, rows.projects, today) === 1, 'Test 7: overdue should use due_date and exclude completed/postponed/cancelled');
console.log('Test 7 - Overdue uses due_date and excludes COMPLETED/APPROVED milestones: passed');

assert(superDashboard.summary.waitingApproval === 3, 'Test 8: waiting approval should combine three approval tables');
assert(countWaitingApprovals(new Set(['milestone-overdue']), rows.deadlineApprovals, rows.initiationApprovals, rows.milestoneApprovals) === 1, 'Test 8: approval count should be scoped by milestone id');
console.log('Test 8 - Waiting approval combines three Supabase approval types: passed');

const assessmentDistribution = salesDashboard.scenarioDistribution.find((item) => item.scenarioName === 'Assessment');
assert(assessmentDistribution?.count === 2, 'Test 9: scenario distribution should count scoped projects per scenario');
console.log('Test 9 - Scenario distribution correct: passed');

const salesProgress = salesDashboard.projectProgress.find((project) => project.id === 'project-sales');
const completedProjectProgress = salesDashboard.projectProgress.find((project) => project.id === 'project-sales-completed');
assert(salesProgress?.completedMilestones === 2 && salesProgress.percentage === 67, 'Test 10: COMPLETED and historical APPROVED milestones should be completed-equivalent');
assert(completedProjectProgress?.percentage === 100, 'Test 10: COMPLETED project should show 100%');
console.log('Test 10 - Project progress uses completed-equivalent statuses and completed project 100%: passed');

assert(salesDashboard.recentActivity[0]?.details === "Sales Test initiated milestone 'Assessment'", 'Test 11: recent activity should use live description');
assert(salesDashboard.recentActivity[0]?.action === 'MILESTONE_INITIATED', 'Test 11: recent activity should preserve action');
console.log('Test 11 - Recent activity uses live schema description/action: passed');

const emptyDashboard = buildDashboardOverviewFromRows(rows, { userId: 'sa-empty', role: 'SA' }, today);
assert(emptyDashboard.summary.totalProjects === 0 && emptyDashboard.projectProgress.length === 0 && emptyDashboard.recentActivity.length === 0, 'Test 12: zero project role should return empty dashboard');
console.log('Test 12 - Role with zero project returns valid empty dashboard: passed');

try {
  throw toSafeDashboardError(new Error('service role key leaked detail'), 'projects');
} catch (error: any) {
  assert(error.message === 'Failed to load dashboard data.', 'Test 13: Supabase error should be safe');
  assert(!error.message.includes('service role'), 'Test 13: safe error should not expose internal detail');
  console.log('Test 13 - Supabase error handled safely: passed');
}

const serviceSource = readFileSync(join(__dirname, 'dashboard.service.ts'), 'utf8');
assert(!serviceSource.includes('../config/prisma') && !serviceSource.includes('prisma.'), 'Test 14: DashboardService should contain no Prisma runtime query');
console.log('Test 14 - DashboardService contains no runtime Prisma query: passed');
