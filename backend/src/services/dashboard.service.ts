import { supabaseAdmin } from '../config/supabase';
import { getDateOnlyKeyInTimeZone } from '../utils/dates';
import { UserRole } from '../validators/auth.validator';

export type DashboardActor = {
  userId: string;
  role: UserRole | string;
  fullName?: string;
};

export type DashboardProjectRow = {
  id: string;
  name: string;
  customer: string | null;
  scenario_id: string | null;
  sales_id: string | null;
  pic_id: string | null;
  status: string;
  is_postponed?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  estimated_revenue?: number | string | null;
};

export type DashboardMilestoneRow = {
  id: string;
  project_id: string;
  pic_id?: string | null;
  status: string;
  due_date: string | null;
};

export type DashboardScenarioRow = {
  id: string;
  name: string;
};

export type DashboardApprovalRow = {
  id?: string;
  milestone_id: string;
  status: string;
  submitted_at?: string | null;
};

export type DashboardProjectPlanApprovalRow = {
  id?: string;
  project_id: string;
  status: string;
};

export type DashboardActivityRow = {
  id: string;
  project_id: string | null;
  user_id: string | null;
  action: string;
  description: string | null;
  created_at: string;
};

export type DashboardUserRow = {
  id: string;
  full_name: string | null;
  role: string | null;
};

export type DashboardOutputDocumentRow = {
  project_id: string;
  status: string;
  is_required: boolean;
  is_selected: boolean;
};

export type DashboardOutputDocuments = {
  reviewQueue: Array<{ projectId: string; projectName: string; count: number }>;
  revisionQueue: Array<{ projectId: string; projectName: string; count: number }>;
  salesProgress: Array<{ projectId: string; approvedCount: number; selectedCount: number }>;
};

export type DashboardSaUserRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  is_active: boolean | null;
};

export type DashboardSaWorkload = {
  saId: string;
  saName: string;
  activeProjectCount: number;
  activeMilestoneCount: number;
  overdueCount: number;
  revisionCount: number;
  waitingReviewCount: number;
  nearestDeadline: string | null;
};

export type DashboardSourceRows = {
  projects: DashboardProjectRow[];
  milestones: DashboardMilestoneRow[];
  scenarios: DashboardScenarioRow[];
  deadlineApprovals: DashboardApprovalRow[];
  projectPlanApprovals: DashboardProjectPlanApprovalRow[];
  milestoneApprovals: DashboardApprovalRow[];
  activityLogs: DashboardActivityRow[];
  users: DashboardUserRow[];
  outputDocuments?: DashboardOutputDocumentRow[];
  saUsers?: DashboardSaUserRow[];
};

const LIVE_PROJECT_STATUSES = ['DRAFT', 'ACTIVE', 'POSTPONED', 'WAITING_RESULT', 'WON', 'LOST', 'COMPLETED', 'CANCELLED'] as const;
const COMPLETED_MILESTONE_STATUSES = new Set(['COMPLETED', 'APPROVED']);
const SA_ACTIONABLE_MILESTONE_STATUSES = new Set(['IN_PROGRESS', 'REJECTED']);
const PROJECT_STATUS_COLORS: Record<string, string> = {
  DRAFT: '#64748b',
  ACTIVE: '#3b82f6',
  POSTPONED: '#f59e0b',
  COMPLETED: '#22c55e',
  WAITING_RESULT: '#f59e0b',
  WON: '#22c55e',
  LOST: '#ef4444',
  CANCELLED: '#ef4444',
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const dateOnly = (value: string) => value.slice(0, 10);

const getValidDateOnly = (value?: string | null): string | null => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
};

export function isProjectVisibleToActor(project: DashboardProjectRow, actor: DashboardActor) {
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'HEAD_SA') return true;
  if (actor.role === 'SALES') return project.sales_id === actor.userId;
  if (actor.role === 'SA') return project.pic_id === actor.userId;
  return false;
}

export function isMilestoneCompletedLike(status: string) {
  return COMPLETED_MILESTONE_STATUSES.has(status);
}

export function countOverdueMilestones(
  milestones: DashboardMilestoneRow[],
  projects: DashboardProjectRow[],
  today = todayKey()
) {
  const projectMap = new Map(projects.map((project) => [project.id, project]));

  return milestones.filter((milestone) => {
    const project = projectMap.get(milestone.project_id);
    if (
      !project ||
      project.status === 'DRAFT' ||
      project.status === 'CANCELLED' ||
      project.status === 'POSTPONED' ||
      ['COMPLETED', 'WAITING_RESULT', 'WON', 'LOST'].includes(project.status) ||
      project.is_postponed
    ) {
      return false;
    }
    if (!milestone.due_date || isMilestoneCompletedLike(milestone.status)) return false;
    return dateOnly(milestone.due_date) < today;
  }).length;
}

export function countWaitingApprovals(
  milestoneIds: Set<string>,
  ...approvalGroups: DashboardApprovalRow[][]
) {
  return approvalGroups.flat().filter(
    (approval) => approval.status === 'PENDING' && milestoneIds.has(approval.milestone_id)
  ).length;
}

function buildSaWorkload(
  rows: DashboardSourceRows,
  projects: DashboardProjectRow[],
  milestones: DashboardMilestoneRow[],
  today: string
): DashboardSaWorkload[] {
  const activeProjects = projects.filter((project) => project.status === 'ACTIVE' && !project.is_postponed);
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));
  const activeProjectById = new Map(activeProjects.map((project) => [project.id, project]));
  const pendingMilestoneIds = new Set(
    rows.milestoneApprovals
      .filter((approval) => approval.status === 'PENDING')
      .map((approval) => approval.milestone_id)
  );
  const latestApprovalByMilestone = new Map<string, DashboardApprovalRow>();
  const compareApprovalRecency = (left: DashboardApprovalRow, right: DashboardApprovalRow) => {
    const leftTimestamp = left.submitted_at ? Date.parse(left.submitted_at) : Number.NaN;
    const rightTimestamp = right.submitted_at ? Date.parse(right.submitted_at) : Number.NaN;
    if (!Number.isNaN(leftTimestamp) && !Number.isNaN(rightTimestamp) && leftTimestamp !== rightTimestamp) {
      return leftTimestamp - rightTimestamp;
    }
    if (!Number.isNaN(leftTimestamp) && Number.isNaN(rightTimestamp)) return 1;
    if (Number.isNaN(leftTimestamp) && !Number.isNaN(rightTimestamp)) return -1;
    return (left.id || '').localeCompare(right.id || '');
  };
  for (const approval of rows.milestoneApprovals) {
    const current = latestApprovalByMilestone.get(approval.milestone_id);
    if (!current || compareApprovalRecency(approval, current) > 0) {
      latestApprovalByMilestone.set(approval.milestone_id, approval);
    }
  }
  const outputRows = (rows.outputDocuments || []).filter((output) =>
    activeProjectIds.has(output.project_id) && (output.is_required || output.is_selected)
  );

  return (rows.saUsers || [])
    .filter((user) => user.role === 'SA' && user.is_active === true)
    .map((sa) => {
      const saProjects = activeProjects.filter((project) => project.pic_id === sa.id);
      const saProjectIds = new Set(saProjects.map((project) => project.id));
      const saMilestones = milestones.filter((milestone) => {
        const project = activeProjectById.get(milestone.project_id);
        return Boolean(project && (milestone.pic_id || project.pic_id) === sa.id);
      });
      const actionableMilestones = saMilestones.filter((milestone) =>
        SA_ACTIONABLE_MILESTONE_STATUSES.has(milestone.status)
      );
      const revisionCount = saMilestones.filter((milestone) =>
        milestone.status === 'REJECTED'
        || (milestone.status === 'IN_PROGRESS' && latestApprovalByMilestone.get(milestone.id)?.status === 'REJECTED')
      ).length
        + outputRows.filter((output) => output.project_id && saProjectIds.has(output.project_id) && output.status === 'REVISION_REQUIRED').length;
      const waitingReviewCount = saMilestones.filter((milestone) =>
        milestone.status === 'SUBMITTED' && pendingMilestoneIds.has(milestone.id)
      ).length + outputRows.filter((output) =>
        saProjectIds.has(output.project_id) && output.status === 'IN_REVIEW'
      ).length;
      const actionableDueDates = actionableMilestones
        .map((milestone) => getValidDateOnly(milestone.due_date))
        .filter((dueDate): dueDate is string => Boolean(dueDate));

      return {
        saId: sa.id,
        saName: sa.full_name || 'Solution Architect',
        activeProjectCount: saProjects.length,
        activeMilestoneCount: actionableMilestones.length,
        overdueCount: actionableDueDates.filter((dueDate) => dueDate < today).length,
        revisionCount,
        waitingReviewCount,
        nearestDeadline: actionableDueDates.sort((left, right) => left.localeCompare(right))[0] || null,
      };
    });
}

function sortNewestFirst<T extends { created_at?: string | null; updated_at?: string | null }>(items: T[]) {
  return [...items].sort((a, b) =>
    (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')
  );
}

function calculateProjectProgress(project: DashboardProjectRow, milestones: DashboardMilestoneRow[], today: string) {
  const total = milestones.length;
  const deliveryCompleted = ['COMPLETED', 'WAITING_RESULT', 'WON', 'LOST'].includes(project.status);
  const completed = deliveryCompleted
    ? total
    : milestones.filter((milestone) => isMilestoneCompletedLike(milestone.status)).length;
  const percentage = deliveryCompleted
    ? 100
    : total > 0
      ? Math.round((completed / total) * 100)
      : 0;
  const overdue = countOverdueMilestones(milestones, [project], today);

  return {
    id: project.id,
    name: project.name,
    projectCode: project.id.slice(0, 8),
    clientName: project.customer || '-',
    status: project.status,
    progress: percentage,
    targetEndDate: null,
    totalMilestones: total,
    completedMilestones: completed,
    overdueMilestones: overdue,
    percentage,
  };
}

export function buildDashboardOverviewFromRows(
  rows: DashboardSourceRows,
  actor: DashboardActor,
  today = todayKey()
) {
  const projects = rows.projects.filter((project) => isProjectVisibleToActor(project, actor));
  const projectIds = new Set(projects.map((project) => project.id));
  const milestones = rows.milestones.filter((milestone) => projectIds.has(milestone.project_id));
  const milestoneIds = new Set(milestones.map((milestone) => milestone.id));
  const scenarioMap = new Map(rows.scenarios.map((scenario) => [scenario.id, scenario.name]));
  const userMap = new Map(rows.users.map((user) => [user.id, user]));
  const projectMap = new Map(projects.map((project) => [project.id, project]));

  const statusCounts = new Map<string, number>();
  for (const project of projects) {
    statusCounts.set(project.status, (statusCounts.get(project.status) || 0) + 1);
  }

  const scenarioCounts = new Map<string, { scenarioId: string; scenarioName: string; count: number }>();
  for (const project of projects) {
    const scenarioId = project.scenario_id || 'unknown';
    const current = scenarioCounts.get(scenarioId) || {
      scenarioId,
      scenarioName: project.scenario_id ? scenarioMap.get(project.scenario_id) || 'Unknown' : 'Unknown',
      count: 0,
    };
    current.count += 1;
    scenarioCounts.set(scenarioId, current);
  }

  const projectProgress = sortNewestFirst(
    projects.filter((project) => ['ACTIVE', 'POSTPONED', 'WAITING_RESULT', 'WON', 'LOST', 'COMPLETED'].includes(project.status))
  )
    .slice(0, 10)
    .map((project) =>
      calculateProjectProgress(
        project,
        milestones.filter((milestone) => milestone.project_id === project.id),
        today
      )
    );

  const recentActivity = rows.activityLogs
    .filter((activity) => activity.project_id && projectIds.has(activity.project_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8)
    .map((activity) => {
      const user = activity.user_id ? userMap.get(activity.user_id) : null;
      const project = activity.project_id ? projectMap.get(activity.project_id) : null;

      return {
        id: activity.id,
        action: activity.action,
        entityType: 'ACTIVITY_LOG',
        details: activity.description || activity.action,
        createdAt: activity.created_at,
        user: {
          id: user?.id || activity.user_id || 'unknown',
          fullName: user?.full_name || 'Unknown User',
          role: user?.role || 'UNKNOWN',
        },
        project: project
          ? {
              id: project.id,
              name: project.name,
              projectCode: project.id.slice(0, 8),
            }
          : null,
      };
    });

  const postponedProjects = projects.filter((project) => project.status === 'POSTPONED' || project.is_postponed).length;
  const cancelledProjects = statusCounts.get('CANCELLED') || 0;
  const activeMilestoneIds = new Set(
    milestones
      .filter((milestone) => projectMap.get(milestone.project_id)?.status === 'ACTIVE')
      .map((milestone) => milestone.id)
  );
  const pendingProjectPlans = rows.projectPlanApprovals.filter(
    (approval) => approval.status === 'PENDING' && projectIds.has(approval.project_id)
  ).length;
  const activeProjects = new Set(
    projects
      .filter((project) => project.status === 'ACTIVE' && !project.is_postponed)
      .map((project) => project.id)
  );
  const outputRows = (rows.outputDocuments || []).filter((output) => projectIds.has(output.project_id));
  const projectNameFor = (projectId: string) => projectMap.get(projectId)?.name || 'Project';
  const countByProject = (status: string) => Array.from(activeProjects)
    .map((projectId) => ({
      projectId,
      projectName: projectNameFor(projectId),
      count: outputRows.filter((output) => output.project_id === projectId && output.status === status).length,
    }))
    .filter((item) => item.count > 0);
  const salesProgress = actor.role === 'SALES'
    ? projects.map((project) => {
        const selected = outputRows.filter((output) =>
          output.project_id === project.id && (output.is_required || output.is_selected)
        );
        return {
          projectId: project.id,
          approvedCount: selected.filter((output) => output.status === 'APPROVED').length,
          selectedCount: selected.length,
        };
      }).filter((item) => item.selectedCount > 0)
    : [];
  const saWorkload = actor.role === 'HEAD_SA'
    ? buildSaWorkload(rows, projects, milestones, today)
    : [];

  return {
    summary: {
      totalProjects: projects.length,
      activeProjects: statusCounts.get('ACTIVE') || 0,
      completedProjects: (statusCounts.get('COMPLETED') || 0)
        + (statusCounts.get('WAITING_RESULT') || 0)
        + (statusCounts.get('WON') || 0)
        + (statusCounts.get('LOST') || 0),
      postponedProjects,
      onHoldProjects: postponedProjects,
      cancelledProjects,
      overdueMilestones: countOverdueMilestones(milestones, projects, today),
      waitingApproval: countWaitingApprovals(
        activeMilestoneIds,
        rows.deadlineApprovals,
        rows.milestoneApprovals
      ) + pendingProjectPlans,
    },
    scenarioDistribution: Array.from(scenarioCounts.values()).sort((a, b) => b.count - a.count),
    statusDistribution: LIVE_PROJECT_STATUSES.map((status) => ({
      status,
      count: statusCounts.get(status) || 0,
      color: PROJECT_STATUS_COLORS[status],
    })).filter((status) => status.count > 0),
    projectProgress,
    recentActivity,
    outputDocuments: {
      reviewQueue: actor.role === 'HEAD_SA' ? countByProject('IN_REVIEW') : [],
      revisionQueue: actor.role === 'SA' ? countByProject('REVISION_REQUIRED') : [],
      salesProgress,
    } satisfies DashboardOutputDocuments,
    saWorkload,
  };
}

export function toSafeDashboardError(error: unknown, context: string) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[DashboardService] ${context}: ${message}`);
  return new Error('Failed to load dashboard data.');
}

async function getScopedProjects(actor: DashboardActor) {
  let query = supabaseAdmin
    .from('projects')
    .select('id,name,customer,scenario_id,sales_id,pic_id,status,is_postponed,estimated_revenue,created_at,updated_at')
    .order('updated_at', { ascending: false });

  if (actor.role === 'SALES') query = query.eq('sales_id', actor.userId);
  if (actor.role === 'SA') query = query.eq('pic_id', actor.userId);

  const { data, error } = await query;
  if (error) throw toSafeDashboardError(error, 'projects');
  return (data || []) as DashboardProjectRow[];
}

async function getActiveSolutionArchitects() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id,full_name,role,is_active')
    .eq('role', 'SA')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error) throw toSafeDashboardError(error, 'solution_architects');
  return (data || []) as DashboardSaUserRow[];
}

async function getRowsByProjectIds(projectIds: string[]) {
  if (!projectIds.length) {
    return {
      milestones: [],
      scenarios: [],
      activityLogs: [],
      users: [],
      deadlineApprovals: [],
      projectPlanApprovals: [],
      milestoneApprovals: [],
      outputDocuments: [],
    };
  }

  const [milestoneResult, scenarioResult, activityResult, outputDocumentResult] = await Promise.all([
    supabaseAdmin
      .from('project_milestones')
      .select('id,project_id,pic_id,status,due_date')
      .in('project_id', projectIds),
    supabaseAdmin
      .from('scenarios')
      .select('id,name'),
    supabaseAdmin
      .from('activity_logs')
      .select('id,project_id,user_id,action,description,created_at')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false })
      .limit(8),
    supabaseAdmin
      .from('project_output_documents')
      .select('project_id,status,is_required,is_selected')
      .in('project_id', projectIds),
  ]);

  if (milestoneResult.error) throw toSafeDashboardError(milestoneResult.error, 'project_milestones');
  if (scenarioResult.error) throw toSafeDashboardError(scenarioResult.error, 'scenarios');
  if (activityResult.error) throw toSafeDashboardError(activityResult.error, 'activity_logs');
  if (outputDocumentResult.error) throw toSafeDashboardError(outputDocumentResult.error, 'project_output_documents');

  const milestones = (milestoneResult.data || []) as DashboardMilestoneRow[];
  const milestoneIds = milestones.map((milestone) => milestone.id);
  const userIds = [
    ...new Set(
      ((activityResult.data || []) as DashboardActivityRow[])
        .map((activity) => activity.user_id)
        .filter((userId): userId is string => Boolean(userId))
    ),
  ];

  const [deadlineResult, projectPlanResult, submissionResult, userResult] = await Promise.all([
    milestoneIds.length
      ? supabaseAdmin
          .from('milestone_deadline_approvals')
          .select('id,milestone_id,status')
          .eq('status', 'PENDING')
          .in('milestone_id', milestoneIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from('project_plan_approvals')
      .select('id,project_id,status')
      .eq('status', 'PENDING')
      .in('project_id', projectIds),
    milestoneIds.length
      ? supabaseAdmin
          .from('milestone_approvals')
          .select('id,milestone_id,status,submitted_at')
          .in('milestone_id', milestoneIds)
          .order('submitted_at', { ascending: false })
          .order('id', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabaseAdmin
          .from('users')
          .select('id,full_name,role')
          .in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (deadlineResult.error) throw toSafeDashboardError(deadlineResult.error, 'milestone_deadline_approvals');
  if (projectPlanResult.error) throw toSafeDashboardError(projectPlanResult.error, 'project_plan_approvals');
  if (submissionResult.error) throw toSafeDashboardError(submissionResult.error, 'milestone_approvals');
  if (userResult.error) throw toSafeDashboardError(userResult.error, 'users');

  return {
    milestones,
    scenarios: (scenarioResult.data || []) as DashboardScenarioRow[],
    activityLogs: (activityResult.data || []) as DashboardActivityRow[],
    users: (userResult.data || []) as DashboardUserRow[],
    deadlineApprovals: (deadlineResult.data || []) as DashboardApprovalRow[],
    projectPlanApprovals: (projectPlanResult.data || []) as DashboardProjectPlanApprovalRow[],
    milestoneApprovals: (submissionResult.data || []) as DashboardApprovalRow[],
    outputDocuments: (outputDocumentResult.data || []) as DashboardOutputDocumentRow[],
  };
}

export class DashboardService {
  static async getOverview(actor: DashboardActor) {
    const projects = await getScopedProjects(actor);
    const [scopedRows, saUsers] = await Promise.all([
      getRowsByProjectIds(projects.map((project) => project.id)),
      actor.role === 'HEAD_SA' ? getActiveSolutionArchitects() : Promise.resolve([]),
    ]);

    return buildDashboardOverviewFromRows(
      {
        projects,
        ...scopedRows,
        saUsers,
      },
      actor,
      actor.role === 'HEAD_SA' ? getDateOnlyKeyInTimeZone() : undefined
    );
  }
}
