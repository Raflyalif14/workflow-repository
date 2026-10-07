import { mutateBusiness, BusinessRequestContext } from './business-audit.service';
import { PicMutationError, PicRequestContext, runPicMutation, validatePicContext } from './pic-mutation.service';
import { activePhaseProject, phaseRows } from './project-phase.service';
import { supabaseAdmin } from '../config/supabase';
import {
  ApproveProjectPlanInput,
  RejectProjectPlanInput,
  SaveProjectTimelineInput,
  SubmitProjectPlanInput,
} from '../validators/project-plan.validator';
import { DeadlineService } from './deadline.service';
import {
  notifyProjectPlanApproved,
  notifyProjectPlanRejected,
  notifyProjectPlanSubmitted,
} from './project-plan-notification.service';
import {
  resolveWorkflowInitializationMode,
  ScenarioWorkflowConfiguration,
} from './milestone.service';
import { advanceToNextMilestone } from './workflow-progression.service';

type Actor = { userId: string; role: string; fullName: string };
type ProjectPlanStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type ProjectRow = {
  id: string;
  name: string;
  customer: string;
  scenario_id: string;
  current_scenario_id?: string | null;
  active_phase_id?: string | null;
  sales_id: string | null;
  pic_id: string | null;
  status: string;
  is_postponed: boolean | null;
};
type ProjectPlanWorkflowMode = 'LEGACY' | 'OPERATIONAL_V2';

type TimelineMilestone = {
  id: string;
  project_id: string;
  name: string;
  step_order: number;
  status: string;
  start_date: string | null;
  duration_working_days: number | null;
  due_date: string | null;
};

type ProjectPlanApprovalRow = {
  phase_id?: string | null;
  id: string;
  project_id: string;
  requested_by: string;
  status: ProjectPlanStatus;
  request_note: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

const PROJECT_CREATION_STEP_ORDER = 1;
const TIMELINE_PLANNING_STEP_ORDER = 2;
const timelineSelect = 'id,project_id,phase_id,name,step_order,status,start_date,duration_working_days,due_date';
const approvalSelect = 'id,project_id,phase_id,requested_by,status,request_note,reviewed_by,review_note,submitted_at,reviewed_at,created_at,updated_at';

const normalizeDateKey = (value: string) => value.slice(0, 10);

function getExecutableMilestones(
  milestones: TimelineMilestone[],
  workflowMode: ProjectPlanWorkflowMode
) {
  return workflowMode === 'OPERATIONAL_V2'
    ? milestones
    : milestones.filter((milestone) => milestone.step_order > TIMELINE_PLANNING_STEP_ORDER);
}

export function assertOperationalV2ApprovalPic(
  workflowMode: ProjectPlanWorkflowMode,
  picId?: string
): asserts picId is string {
  if (workflowMode === 'OPERATIONAL_V2' && !picId) {
    throw new Error('A Solution Architect PIC is required to approve an Operational V2 project plan.');
  }
}


export function assertSalesOwner(project: ProjectRow, actor: Actor) {
  if (actor.role !== 'SALES' || project.sales_id !== actor.userId) {
    throw new Error('Only the project owner can manage this project plan.');
  }
}

export function assertDraftProject(project: ProjectRow) {
  if (project.status === 'POSTPONED' || project.is_postponed) throw new Error('Project is postponed.');
  if (project.status !== 'DRAFT') throw new Error('Project plan can only be changed while the project is DRAFT.');
}

export function assertNoPendingProjectPlanApproval(hasPendingApproval: boolean, message: string): void {
  if (hasPendingApproval) throw new Error(message);
}

export function assertSetDeadlineMilestoneReady(milestone: TimelineMilestone | undefined): asserts milestone is TimelineMilestone {
  if (!milestone || milestone.status !== 'IN_PROGRESS') {
    throw new Error('Set Deadline milestone is no longer ready for project plan approval.');
  }
}

export function assertProjectPlanApprovalProgressionState(
  project: ProjectRow,
  timelineMilestone: TimelineMilestone | undefined
): asserts timelineMilestone is TimelineMilestone {
  assertDraftProject(project);
  assertSetDeadlineMilestoneReady(timelineMilestone);
}

export function buildRejectedProjectPlanReviewResult(projectStatus: string) {
  return { project_status: projectStatus, next_milestone: null };
}

function mapUser(user: any) {
  return user ? { id: user.id, full_name: user.full_name, email: user.email } : null;
}

function mapApproval(row: ProjectPlanApprovalRow, projects: Map<string, ProjectRow>, users: Map<string, any>) {
  const project = projects.get(row.project_id);
  return {
    id: row.id,
    project_id: row.project_id,
    phase_id: row.phase_id || null,
    project: project
      ? { id: project.id, name: project.name, customer: project.customer, status: project.status }
      : null,
    status: row.status,
    requested_by: mapUser(users.get(row.requested_by)),
    request_note: row.request_note,
    reviewed_by: mapUser(row.reviewed_by ? users.get(row.reviewed_by) : null),
    review_note: row.review_note,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function buildInitialTimelineUpdate(
  milestone: TimelineMilestone,
  calculated: { start_date: string; duration_working_days: number; due_date: string },
  workflowMode: ProjectPlanWorkflowMode = 'LEGACY'
) {
  if (workflowMode === 'LEGACY' && milestone.step_order <= TIMELINE_PLANNING_STEP_ORDER) {
    throw new Error('Planning milestones cannot be edited through the project timeline.');
  }

  return {
    id: milestone.id,
    start_date: calculated.start_date,
    duration_working_days: calculated.duration_working_days,
    due_date: calculated.due_date,
  };
}

export function hasValidInitialTimeline(
  milestones: TimelineMilestone[],
  workflowMode: ProjectPlanWorkflowMode = 'LEGACY'
) {
  const executableMilestones = getExecutableMilestones(milestones, workflowMode);
  return executableMilestones.length > 0 && executableMilestones.every((milestone) =>
    Boolean(milestone.start_date) &&
    Number.isInteger(milestone.duration_working_days) &&
    Boolean(milestone.due_date) &&
    (milestone.duration_working_days || 0) > 0
  );
}

export class ProjectPlanApprovalService {
  private static async getProject(projectId: string): Promise<ProjectRow> {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('id,name,customer,scenario_id,current_scenario_id,active_phase_id,sales_id,pic_id,status,is_postponed')
      .eq('id', projectId)
      .single();

    if (error || !data) throw new Error('Project not found');
    return activePhaseProject(data as ProjectRow);
  }

  private static async getWorkflowMode(project: ProjectRow): Promise<ProjectPlanWorkflowMode> {
    const { data, error } = await supabaseAdmin
      .from('scenarios')
      .select('workflow_model,workflow_version')
      .eq('id', project.scenario_id)
      .single();

    if (error || !data) throw new Error('Project scenario not found.');
    return resolveWorkflowInitializationMode(data as ScenarioWorkflowConfiguration);
  }

  private static async getTimelineMilestones(projectId: string, phaseId?: string | null): Promise<TimelineMilestone[]> {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select(timelineSelect)
      .eq('project_id', projectId)
      .order('step_order', { ascending: true });

    if (error) throw new Error(error.message);
    return phaseRows((data || []) as (TimelineMilestone & { phase_id?: string })[], phaseId);
  }

  private static async getPendingApproval(projectId: string, phaseId?: string | null): Promise<ProjectPlanApprovalRow | null> {
    let query = supabaseAdmin
      .from('project_plan_approvals')
      .select(approvalSelect)
      .eq('project_id', projectId)
      .eq('status', 'PENDING')
      .order('submitted_at', { ascending: false })
      ;
    if (phaseId) query = query.eq('phase_id', phaseId);
    const { data, error } = await query.limit(1).maybeSingle();

    if (error) throw new Error(error.message);
    return data as ProjectPlanApprovalRow | null;
  }

  private static async assertTimelineValid(projectId: string, workflowMode: ProjectPlanWorkflowMode, phaseId?: string | null) {
    const milestones = await this.getTimelineMilestones(projectId, phaseId);
    if (!hasValidInitialTimeline(milestones, workflowMode)) {
      throw new Error('A complete initial timeline is required before submitting the project plan.');
    }
    for (const milestone of getExecutableMilestones(milestones, workflowMode)) {
      const calculated = await DeadlineService.calculateDeadline(milestone.start_date!, milestone.duration_working_days!);
      if (normalizeDateKey(milestone.due_date!) !== calculated.due_date) {
        throw new Error(`Timeline deadline is invalid for milestone '${milestone.name}'.`);
      }
    }
    return milestones;
  }

  static async saveTimeline(projectId: string, input: SaveProjectTimelineInput, actor: Actor, context?: BusinessRequestContext) {
    const project = await this.getProject(projectId);
    assertSalesOwner(project, actor);
    const workflowMode = await this.getWorkflowMode(project);


    const milestones = await this.getTimelineMilestones(projectId, project.active_phase_id);
    const milestoneMap = new Map(milestones.map((milestone) => [milestone.id, milestone]));
    const updates = [] as Array<{
      milestone: TimelineMilestone;
      start_date: string;
      duration_working_days: number;
      due_date: string;
    }>;

    for (const item of input.milestones) {
      const milestone = milestoneMap.get(item.milestoneId);
      if (!milestone) throw new Error('Milestone not found in this project timeline.');
      const calculated = await DeadlineService.calculateDeadline(item.startDate, item.durationWorkingDays);
      const update = buildInitialTimelineUpdate(milestone, calculated, workflowMode);
      updates.push({ milestone, ...update });
    }

    await mutateBusiness(projectId, actor.userId, 'TIMELINE', { milestones: updates.map(update => ({
      id: update.milestone.id, start_date: update.start_date,
      duration_working_days: update.duration_working_days, due_date: update.due_date,
    })) }, context);

    return updates.map((update) => ({
      milestone_id: update.milestone.id,
      name: update.milestone.name,
      step_order: update.milestone.step_order,
      start_date: update.start_date,
      duration_working_days: update.duration_working_days,
      due_date: update.due_date,
    }));
  }

  static async submit(projectId: string, input: SubmitProjectPlanInput, actor: Actor, context?: BusinessRequestContext) {
    const project = await this.getProject(projectId);
    assertSalesOwner(project, actor);
    const workflowMode = await this.getWorkflowMode(project);
    const timeline = await this.assertTimelineValid(projectId, workflowMode, project.active_phase_id);


    const data = await mutateBusiness(projectId, actor.userId, 'PLAN_SUBMIT', {
      request_note: input.request_note?.trim() || null,
      schedule: timeline.map(m => ({ id: m.id, start_date: m.start_date,
        duration_working_days: m.duration_working_days, due_date: m.due_date })),
    }, context);
    if (!data._businessReplayed) await notifyProjectPlanSubmitted(project);

    return {
      id: data.id,
      project_id: projectId,
      status: data.status,
      request_note: data.request_note,
      submitted_at: data.submitted_at,
    };
  }

  private static async review(
    projectId: string,
    decision: 'APPROVED' | 'REJECTED',
    note: string | undefined,
    picId: string | undefined,
    actor: Actor,
    expectedApprovalId?: string,
    context?: PicRequestContext
  ) {
    if (actor.role !== 'HEAD_SA') throw new PicMutationError(403, 'PIC_FORBIDDEN');

    const project = await this.getProject(projectId);
    const workflowMode = await this.getWorkflowMode(project);
    if (project.active_phase_id || workflowMode === 'OPERATIONAL_V2') {
      const request = validatePicContext(context);
      if (!expectedApprovalId) throw new PicMutationError(422, 'PIC_INVALID');
      if (decision === 'APPROVED' && project.status === 'DRAFT') {
        assertOperationalV2ApprovalPic(workflowMode, picId);
        await this.assertTimelineValid(projectId, workflowMode, project.active_phase_id);
      }
      return runPicMutation('review_project_plan_pic_atomic', {
        p_project_id: projectId, p_approval_id: expectedApprovalId, p_actor_id: actor.userId,
        p_decision: decision, p_note: note?.trim() || null, p_pic_id: picId || null,
        p_expected_revision: request.expected_pic_revision, p_request_id: request.request_id,
      });
    }
    // LEGACY v1 keeps its Set Deadline/activation behavior; all metadata and audit now commit together.
    const pending = expectedApprovalId ? null : await this.getPendingApproval(projectId, project.active_phase_id);
    const approvalId = expectedApprovalId || pending?.id;
    if (!approvalId) throw new Error('Project plan approval is no longer pending.');
    const timeline = decision === 'APPROVED'
      ? await this.assertTimelineValid(projectId, workflowMode, project.active_phase_id) : [];
    const result = await mutateBusiness(projectId, actor.userId, 'LEGACY_PLAN_REVIEW', {
      approval_id: approvalId, decision, note: note?.trim() || null,
      ...(decision === 'APPROVED' ? { schedule: timeline.map(m => ({ id: m.id, start_date: m.start_date,
        duration_working_days: m.duration_working_days, due_date: m.due_date })) } : {}),
    }, { requestId: context?.request_id });
    if (decision === 'REJECTED') {
      if (!result._businessReplayed) await notifyProjectPlanRejected(project);
      return { ...result, ...buildRejectedProjectPlanReviewResult(project.status) };
    }
    const progression = await advanceToNextMilestone(projectId, result.set_deadline_milestone.id, actor);
    if (!result._businessReplayed) await notifyProjectPlanApproved(project);
    return { ...result, ...progression };
  }

  static approve(projectId: string, input: ApproveProjectPlanInput, actor: Actor) {
    return this.review(projectId, 'APPROVED', input.note, input.pic_id, actor, input.expected_approval_id, { expected_pic_revision: input.expected_pic_revision, request_id: input.request_id });
  }

  static reject(projectId: string, input: RejectProjectPlanInput, actor: Actor) {
    return this.review(projectId, 'REJECTED', input.note, undefined, actor, input.expected_approval_id, { expected_pic_revision: input.expected_pic_revision, request_id: input.request_id });
  }

  private static async getReadData(projectId?: string, onlyPending = false) {
    let query: any = supabaseAdmin
      .from('project_plan_approvals')
      .select(approvalSelect)
      .order('submitted_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    if (onlyPending) query = query.eq('status', 'PENDING');

    const { data: approvals, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (approvals || []) as ProjectPlanApprovalRow[];
    if (!rows.length) return { approvals: rows, projects: new Map<string, ProjectRow>(), users: new Map<string, any>() };

    const projectIds = [...new Set(rows.map((approval) => approval.project_id))];
    const userIds = [...new Set(rows.flatMap((approval) => [approval.requested_by, approval.reviewed_by]).filter(Boolean) as string[])];
    const [projectResult, userResult] = await Promise.all([
      supabaseAdmin.from('projects').select('id,name,customer,scenario_id,current_scenario_id,active_phase_id,sales_id,pic_id,status,is_postponed').in('id', projectIds),
      userIds.length
        ? supabaseAdmin.from('users').select('id,full_name,email').in('id', userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (projectResult.error) throw new Error(projectResult.error.message);
    if (userResult.error) throw new Error(userResult.error.message);

    return {
      approvals: rows,
      projects: new Map((projectResult.data || []).map((project) => [project.id, project as ProjectRow])),
      users: new Map((userResult.data || []).map((user) => [user.id, user])),
    };
  }

  static async getCurrent(projectId: string, actor: Actor) {
    const project = await this.getProject(projectId);
    if (actor.role === 'SALES' && project.sales_id !== actor.userId) throw new Error('Project not found');
    if (actor.role === 'SA' && project.pic_id !== actor.userId) throw new Error('Project not found');
    const data = await this.getReadData(projectId);
    const approvals = phaseRows(data.approvals as (ProjectPlanApprovalRow & { phase_id?: string })[], project.active_phase_id);
    return approvals[0] ? mapApproval(approvals[0], data.projects, data.users) : null;
  }

  static async getHistory(projectId: string, actor: Actor) {
    const project = await this.getProject(projectId);
    if (actor.role === 'SALES' && project.sales_id !== actor.userId) throw new Error('Project not found');
    if (actor.role === 'SA' && project.pic_id !== actor.userId) throw new Error('Project not found');
    if (!['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA'].includes(actor.role)) throw new Error('Forbidden');
    const data = await this.getReadData(projectId);
    return data.approvals.map((approval) => mapApproval(approval, data.projects, data.users));
  }

  static async getPending(actor: Actor) {
    if (!['SUPER_ADMIN', 'HEAD_SA'].includes(actor.role)) throw new Error('Forbidden');
    const data = await this.getReadData(undefined, true);
    return data.approvals.map((approval) => mapApproval(approval, data.projects, data.users));
  }
}

export const projectPlanConstants = {
  PROJECT_CREATION_STEP_ORDER,
  TIMELINE_PLANNING_STEP_ORDER,
};
