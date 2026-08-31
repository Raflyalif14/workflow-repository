import { supabaseAdmin } from '../config/supabase';
import {
  ApproveProjectPlanInput,
  RejectProjectPlanInput,
  SaveProjectTimelineInput,
  SubmitProjectPlanInput,
} from '../validators/project-plan.validator';
import { DeadlineService } from './deadline.service';
import { advanceToNextMilestone } from './workflow-progression.service';

type Actor = { userId: string; role: string; fullName: string };
type ProjectPlanStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type ProjectRow = {
  id: string;
  name: string;
  customer: string;
  sales_id: string;
  pic_id: string | null;
  status: string;
  is_postponed: boolean | null;
};

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
const timelineSelect = 'id,project_id,name,step_order,status,start_date,duration_working_days,due_date';
const approvalSelect = 'id,project_id,requested_by,status,request_note,reviewed_by,review_note,submitted_at,reviewed_at,created_at,updated_at';

const normalizeDateKey = (value: string) => value.slice(0, 10);

function getExecutableMilestones(milestones: TimelineMilestone[]) {
  return milestones.filter((milestone) => milestone.step_order > TIMELINE_PLANNING_STEP_ORDER);
}

function assertSalesOwner(project: ProjectRow, actor: Actor) {
  if (actor.role !== 'SALES' || project.sales_id !== actor.userId) {
    throw new Error('Only the project owner can manage this project plan.');
  }
}

function assertDraftProject(project: ProjectRow) {
  if (project.status === 'POSTPONED' || project.is_postponed) throw new Error('Project is postponed.');
  if (project.status !== 'DRAFT') throw new Error('Project plan can only be changed while the project is DRAFT.');
}

function mapUser(user: any) {
  return user ? { id: user.id, full_name: user.full_name, email: user.email } : null;
}

function mapApproval(row: ProjectPlanApprovalRow, projects: Map<string, ProjectRow>, users: Map<string, any>) {
  const project = projects.get(row.project_id);
  return {
    id: row.id,
    project_id: row.project_id,
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
  calculated: { start_date: string; duration_working_days: number; due_date: string }
) {
  if (milestone.step_order <= TIMELINE_PLANNING_STEP_ORDER) {
    throw new Error('Planning milestones cannot be edited through the project timeline.');
  }

  return {
    id: milestone.id,
    start_date: calculated.start_date,
    duration_working_days: calculated.duration_working_days,
    due_date: calculated.due_date,
  };
}

export function hasValidInitialTimeline(milestones: TimelineMilestone[]) {
  const executableMilestones = getExecutableMilestones(milestones);
  return executableMilestones.length > 0 && executableMilestones.every((milestone) =>
    Boolean(milestone.start_date) &&
    Number.isInteger(milestone.duration_working_days) &&
    Boolean(milestone.due_date) &&
    (milestone.duration_working_days || 0) > 0
  );
}

async function logActivity(actor: Actor, projectId: string, action: string, description: string) {
  const { error } = await supabaseAdmin.from('activity_logs').insert({
    project_id: projectId,
    user_id: actor.userId,
    action,
    description,
  });

  if (error) throw new Error(error.message);
}

export class ProjectPlanApprovalService {
  private static async getProject(projectId: string): Promise<ProjectRow> {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('id,name,customer,sales_id,pic_id,status,is_postponed')
      .eq('id', projectId)
      .single();

    if (error || !data) throw new Error('Project not found');
    return data as ProjectRow;
  }

  private static async getTimelineMilestones(projectId: string): Promise<TimelineMilestone[]> {
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .select(timelineSelect)
      .eq('project_id', projectId)
      .order('step_order', { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []) as TimelineMilestone[];
  }

  private static async getPendingApproval(projectId: string): Promise<ProjectPlanApprovalRow | null> {
    const { data, error } = await supabaseAdmin
      .from('project_plan_approvals')
      .select(approvalSelect)
      .eq('project_id', projectId)
      .eq('status', 'PENDING')
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as ProjectPlanApprovalRow | null;
  }

  private static async assertTimelineValid(projectId: string) {
    const milestones = await this.getTimelineMilestones(projectId);
    if (!hasValidInitialTimeline(milestones)) {
      throw new Error('A complete initial timeline is required before submitting the project plan.');
    }

    const executableMilestones = getExecutableMilestones(milestones);
    for (const milestone of executableMilestones) {
      const calculated = await DeadlineService.calculateDeadline(
        milestone.start_date!,
        milestone.duration_working_days!
      );
      if (normalizeDateKey(milestone.due_date!) !== calculated.due_date) {
        throw new Error(`Timeline deadline is invalid for milestone '${milestone.name}'.`);
      }
    }

    return milestones;
  }

  static async saveTimeline(projectId: string, input: SaveProjectTimelineInput, actor: Actor) {
    const project = await this.getProject(projectId);
    assertSalesOwner(project, actor);
    assertDraftProject(project);

    if (await this.getPendingApproval(projectId)) {
      throw new Error('Project plan is pending review.');
    }

    const milestones = await this.getTimelineMilestones(projectId);
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
      const update = buildInitialTimelineUpdate(milestone, calculated);
      updates.push({ milestone, ...update });
    }

    const appliedUpdates: typeof updates = [];
    try {
      for (const update of updates) {
        const { error } = await supabaseAdmin
          .from('project_milestones')
          .update({
            start_date: update.start_date,
            duration_working_days: update.duration_working_days,
            due_date: update.due_date,
            updated_at: new Date().toISOString(),
          })
          .eq('id', update.milestone.id)
          .eq('project_id', projectId);

        if (error) throw new Error(error.message);
        appliedUpdates.push(update);
      }
    } catch (error) {
      const rollbackResults = await Promise.all(
        appliedUpdates.map((update) =>
          supabaseAdmin
            .from('project_milestones')
            .update({
              start_date: update.milestone.start_date,
              duration_working_days: update.milestone.duration_working_days,
              due_date: update.milestone.due_date,
              updated_at: new Date().toISOString(),
            })
            .eq('id', update.milestone.id)
            .eq('project_id', projectId)
        )
      );

      const rollbackError = rollbackResults.find((result) => result.error)?.error;
      if (rollbackError) {
        const originalMessage = error instanceof Error ? error.message : 'Failed to save project timeline.';
        throw new Error(originalMessage + '; timeline rollback failed: ' + rollbackError.message);
      }

      throw error;
    }

    await logActivity(actor, projectId, 'PROJECT_TIMELINE_UPDATED', `${actor.fullName} updated the initial project timeline for '${project.name}'`);

    return updates.map((update) => ({
      milestone_id: update.milestone.id,
      name: update.milestone.name,
      step_order: update.milestone.step_order,
      start_date: update.start_date,
      duration_working_days: update.duration_working_days,
      due_date: update.due_date,
    }));
  }

  static async submit(projectId: string, input: SubmitProjectPlanInput, actor: Actor) {
    const project = await this.getProject(projectId);
    assertSalesOwner(project, actor);
    assertDraftProject(project);
    await this.assertTimelineValid(projectId);

    if (await this.getPendingApproval(projectId)) {
      throw new Error('A project plan approval is already pending.');
    }

    const { data, error } = await supabaseAdmin
      .from('project_plan_approvals')
      .insert({
        project_id: projectId,
        requested_by: actor.userId,
        status: 'PENDING',
        request_note: input.request_note?.trim() || null,
        reviewed_by: null,
        review_note: null,
        reviewed_at: null,
      })
      .select(approvalSelect)
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to submit project plan approval.');
    await logActivity(actor, projectId, 'PROJECT_PLAN_SUBMITTED', `${actor.fullName} submitted the project plan for '${project.name}'`);

    return {
      id: data.id,
      project_id: projectId,
      status: data.status,
      request_note: data.request_note,
      submitted_at: data.submitted_at,
    };
  }

  private static async review(projectId: string, decision: 'APPROVED' | 'REJECTED', note: string | undefined, actor: Actor) {
    if (actor.role !== 'HEAD_SA') throw new Error('Forbidden');

    const project = await this.getProject(projectId);
    assertDraftProject(project);
    const pendingApproval = await this.getPendingApproval(projectId);
    if (!pendingApproval) throw new Error('Project plan approval is no longer pending.');

    if (decision === 'APPROVED') {
      await this.assertTimelineValid(projectId);
    }

    const reviewedAt = new Date().toISOString();
    const { data: updatedApproval, error: approvalError } = await supabaseAdmin
      .from('project_plan_approvals')
      .update({
        status: decision,
        reviewed_by: actor.userId,
        review_note: note?.trim() || null,
        reviewed_at: reviewedAt,
        updated_at: reviewedAt,
      })
      .eq('id', pendingApproval.id)
      .eq('status', 'PENDING')
      .select(approvalSelect)
      .maybeSingle();

    if (approvalError) throw new Error(approvalError.message);
    if (!updatedApproval) throw new Error('Project plan approval is no longer pending.');

    if (decision === 'REJECTED') {
      await logActivity(actor, projectId, 'PROJECT_PLAN_REJECTED', `${actor.fullName} rejected the project plan for '${project.name}'`);
      return { ...updatedApproval, project_status: project.status, next_milestone: null };
    }

    const milestones = await this.getTimelineMilestones(projectId);
    const timelineMilestone = milestones.find((milestone) => milestone.step_order === TIMELINE_PLANNING_STEP_ORDER);
    if (!timelineMilestone || timelineMilestone.status !== 'IN_PROGRESS') {
      const { error: rollbackError } = await supabaseAdmin
        .from('project_plan_approvals')
        .update({ status: 'PENDING', reviewed_by: null, review_note: null, reviewed_at: null, updated_at: new Date().toISOString() })
        .eq('id', pendingApproval.id);

      if (rollbackError) {
        throw new Error('Set Deadline milestone is no longer ready for project plan approval.; rollback failed: ' + rollbackError.message);
      }

      throw new Error('Set Deadline milestone is no longer ready for project plan approval.');
    }

    const { data: completedTimelineMilestone, error: milestoneError } = await supabaseAdmin
      .from('project_milestones')
      .update({ status: 'COMPLETED', completed_at: reviewedAt, updated_at: reviewedAt })
      .eq('id', timelineMilestone.id)
      .eq('status', 'IN_PROGRESS')
      .select('id,name,status,completed_at')
      .maybeSingle();

    if (milestoneError || !completedTimelineMilestone) {
      const { error: rollbackError } = await supabaseAdmin
        .from('project_plan_approvals')
        .update({ status: 'PENDING', reviewed_by: null, review_note: null, reviewed_at: null, updated_at: new Date().toISOString() })
        .eq('id', pendingApproval.id);

      if (rollbackError) {
        throw new Error((milestoneError?.message || 'Set Deadline milestone is no longer ready for project plan approval.') + '; rollback failed: ' + rollbackError.message);
      }

      throw new Error(milestoneError?.message || 'Set Deadline milestone is no longer ready for project plan approval.');
    }

    const { data: activatedProject, error: projectError } = await supabaseAdmin
      .from('projects')
      .update({ status: 'ACTIVE', is_postponed: false, updated_at: reviewedAt })
      .eq('id', projectId)
      .eq('status', 'DRAFT')
      .select('id,status')
      .maybeSingle();

    if (projectError || !activatedProject) {
      const rollbackMessages: string[] = [];
      const { error: milestoneRollbackError } = await supabaseAdmin
        .from('project_milestones')
        .update({ status: 'IN_PROGRESS', completed_at: null, updated_at: new Date().toISOString() })
        .eq('id', timelineMilestone.id)
        .eq('status', 'COMPLETED');

      if (milestoneRollbackError) {
        rollbackMessages.push('milestone rollback failed: ' + milestoneRollbackError.message);
      }

      const { error: approvalRollbackError } = await supabaseAdmin
        .from('project_plan_approvals')
        .update({ status: 'PENDING', reviewed_by: null, review_note: null, reviewed_at: null, updated_at: new Date().toISOString() })
        .eq('id', pendingApproval.id);

      if (approvalRollbackError) {
        rollbackMessages.push('approval rollback failed: ' + approvalRollbackError.message);
      }

      if (rollbackMessages.length) {
        throw new Error((projectError?.message || 'Project is no longer DRAFT.') + '; ' + rollbackMessages.join('; '));
      }

      throw new Error(projectError?.message || 'Project is no longer DRAFT.');
    }

    await logActivity(actor, projectId, 'PROJECT_PLAN_APPROVED', `${actor.fullName} approved the project plan for '${project.name}'`);
    const progression = await advanceToNextMilestone(projectId, completedTimelineMilestone.id, actor);

    return {
      ...updatedApproval,
      project_status: activatedProject.status,
      set_deadline_milestone: completedTimelineMilestone,
      ...progression,
    };
  }

  static approve(projectId: string, input: ApproveProjectPlanInput, actor: Actor) {
    return this.review(projectId, 'APPROVED', input.note, actor);
  }

  static reject(projectId: string, input: RejectProjectPlanInput, actor: Actor) {
    return this.review(projectId, 'REJECTED', input.note, actor);
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
      supabaseAdmin.from('projects').select('id,name,customer,sales_id,pic_id,status,is_postponed').in('id', projectIds),
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
    return data.approvals[0] ? mapApproval(data.approvals[0], data.projects, data.users) : null;
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
