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
import { assertAssignablePic } from './assignment-phase5.service';
import { notifyPicAssignment } from './pic-assignment-notification.service';
import { advanceToNextMilestone, logWorkflowActivityBestEffort } from './workflow-progression.service';

type Actor = { userId: string; role: string; fullName: string };
type ProjectPlanStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type ProjectRow = {
  id: string;
  name: string;
  customer: string;
  scenario_id: string;
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

type AssignmentPicRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
};

type AssignmentStageRow = {
  id: string;
  default_role: string;
};

type OperationalV2MilestoneSnapshot = {
  id: string;
  workflow_stage_id: string;
  step_order: number;
  status: string;
  pic_id: string | null;
};

type OperationalV2ApprovalContext = {
  pic: AssignmentPicRow;
  firstMilestone: OperationalV2MilestoneSnapshot;
  assignmentMilestones: OperationalV2MilestoneSnapshot[];
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

async function rollbackOperationalV2Approval(input: {
  project: ProjectRow;
  approval: ProjectPlanApprovalRow;
  actor: Actor;
  picId: string;
  reviewedAt: string;
  assignmentMilestones: OperationalV2MilestoneSnapshot[];
  updatedMilestoneIds: Set<string>;
  firstMilestoneId: string;
  firstMilestoneStarted: boolean;
  historyId: string | null;
  projectActivated: boolean;
  approvalUpdated: boolean;
}): Promise<void> {
  const rollbackFailures: string[] = [];

  if (input.projectActivated) {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .update({ status: 'DRAFT', pic_id: input.project.pic_id, updated_at: new Date().toISOString() })
      .eq('id', input.project.id)
      .eq('status', 'ACTIVE')
      .eq('pic_id', input.picId)
      .select('id')
      .maybeSingle();
    if (error || !data) rollbackFailures.push('project');
  }

  for (const milestone of [...input.assignmentMilestones].reverse()) {
    if (!input.updatedMilestoneIds.has(milestone.id)) continue;
    const expectedStatus = milestone.id === input.firstMilestoneId && input.firstMilestoneStarted
      ? 'IN_PROGRESS'
      : milestone.status;
    const { data, error } = await supabaseAdmin
      .from('project_milestones')
      .update({ status: milestone.status, pic_id: milestone.pic_id, updated_at: new Date().toISOString() })
      .eq('id', milestone.id)
      .eq('status', expectedStatus)
      .eq('pic_id', input.picId)
      .select('id')
      .maybeSingle();
    if (error || !data) rollbackFailures.push(`milestone:${milestone.id}`);
  }

  if (input.historyId) {
    const { data, error } = await supabaseAdmin
      .from('project_assignments')
      .delete()
      .eq('id', input.historyId)
      .eq('project_id', input.project.id)
      .eq('pic_id', input.picId)
      .eq('assigned_by', input.actor.userId)
      .select('id')
      .maybeSingle();
    if (error || !data) rollbackFailures.push('assignment-history');
  }

  if (input.approvalUpdated) {
    const { data, error } = await supabaseAdmin
      .from('project_plan_approvals')
      .update({
        status: 'PENDING',
        reviewed_by: null,
        review_note: null,
        reviewed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.approval.id)
      .eq('status', 'APPROVED')
      .eq('reviewed_by', input.actor.userId)
      .eq('reviewed_at', input.reviewedAt)
      .select('id')
      .maybeSingle();
    if (error || !data) rollbackFailures.push('approval');
  }

  if (rollbackFailures.length) {
    console.error('[ProjectPlanApproval] Operational V2 compensation was incomplete.', {
      projectId: input.project.id,
      rollbackFailures,
    });
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

async function logActivity(actor: Actor, projectId: string, action: string, description: string) {
  await logWorkflowActivityBestEffort(actor, projectId, action, description);
}

export class ProjectPlanApprovalService {
  private static async getProject(projectId: string): Promise<ProjectRow> {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('id,name,customer,scenario_id,sales_id,pic_id,status,is_postponed')
      .eq('id', projectId)
      .single();

    if (error || !data) throw new Error('Project not found');
    return data as ProjectRow;
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

  private static async updatePendingApproval(
    pendingApproval: ProjectPlanApprovalRow,
    decision: 'APPROVED' | 'REJECTED',
    note: string | undefined,
    actor: Actor,
    reviewedAt: string
  ): Promise<ProjectPlanApprovalRow> {
    const { data, error } = await supabaseAdmin
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

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Project plan approval is no longer pending.');
    return data as ProjectPlanApprovalRow;
  }

  private static async prepareOperationalV2Approval(
    project: ProjectRow,
    picId: string,
    actor: Actor
  ): Promise<OperationalV2ApprovalContext> {
    if (project.pic_id !== null) {
      throw new Error('Operational V2 project already has a PIC assignment.');
    }

    const { data: pic, error: picError } = await supabaseAdmin
      .from('users')
      .select('id,full_name,email,role,is_active')
      .eq('id', picId)
      .single();
    assertAssignablePic(picError ? null : pic as AssignmentPicRow, actor);

    const { data: stages, error: stagesError } = await supabaseAdmin
      .from('workflow_stages')
      .select('id,default_role')
      .eq('scenario_id', project.scenario_id)
      .eq('is_active', true);
    if (stagesError) throw new Error('Failed to load project workflow stages.');

    const { data: milestones, error: milestonesError } = await supabaseAdmin
      .from('project_milestones')
      .select('id,workflow_stage_id,step_order,status,pic_id')
      .eq('project_id', project.id)
      .order('step_order', { ascending: true });
    if (milestonesError) throw new Error('Failed to load Operational V2 milestones.');

    const milestoneSnapshots = (milestones || []) as OperationalV2MilestoneSnapshot[];
    if (!milestoneSnapshots.length || milestoneSnapshots.some((milestone) => milestone.status !== 'CREATED')) {
      throw new Error('Operational V2 milestones are no longer ready for project activation.');
    }

    const firstMilestones = milestoneSnapshots.filter((milestone) => milestone.step_order === 1);
    if (firstMilestones.length !== 1) throw new Error('Operational V2 first milestone not found.');

    const selectedPic = pic as AssignmentPicRow;
    const assignmentStageIds = new Set(
      ((stages || []) as AssignmentStageRow[])
        .filter((stage) => stage.default_role === 'SA' || (stage.default_role === 'HEAD_SA' && selectedPic.role === 'HEAD_SA'))
        .map((stage) => stage.id)
    );
    const assignmentMilestones = milestoneSnapshots.filter((milestone) => assignmentStageIds.has(milestone.workflow_stage_id));
    if (!assignmentMilestones.some((milestone) => milestone.id === firstMilestones[0].id)) {
      throw new Error('Operational V2 first milestone is not eligible for the selected PIC.');
    }

    return { pic: selectedPic, firstMilestone: firstMilestones[0], assignmentMilestones };
  }

  private static async approveOperationalV2(
    project: ProjectRow,
    pendingApproval: ProjectPlanApprovalRow,
    note: string | undefined,
    picId: string,
    actor: Actor
  ) {
    const context = await this.prepareOperationalV2Approval(project, picId, actor);
    const reviewedAt = new Date().toISOString();
    const updatedMilestoneIds = new Set<string>();
    let updatedApproval: ProjectPlanApprovalRow | null = null;
    let historyId: string | null = null;
    let firstMilestoneStarted = false;
    let projectActivated = false;

    try {
      updatedApproval = await this.updatePendingApproval(pendingApproval, 'APPROVED', note, actor, reviewedAt);

      const { data: history, error: historyError } = await supabaseAdmin
        .from('project_assignments')
        .insert({
          project_id: project.id,
          pic_id: picId,
          assigned_by: actor.userId,
          previous_pic_id: null,
          assignment_type: 'INITIAL_ASSIGNMENT',
          reason: null,
        })
        .select('id,project_id,pic_id,assigned_by,previous_pic_id,assignment_type,reason,created_at')
        .single();
      if (historyError || !history) throw new Error('Failed to record PIC assignment.');
      historyId = history.id;

      const assignmentMilestoneIds = context.assignmentMilestones.map((milestone) => milestone.id);
      const { data: updatedMilestones, error: milestoneError } = await supabaseAdmin
        .from('project_milestones')
        .update({ pic_id: picId, updated_at: reviewedAt })
        .in('id', assignmentMilestoneIds)
        .eq('status', 'CREATED')
        .select('id');
      if (milestoneError) throw new Error('Failed to apply Operational V2 PIC assignment.');
      for (const milestone of updatedMilestones || []) updatedMilestoneIds.add(milestone.id);
      if (updatedMilestoneIds.size !== assignmentMilestoneIds.length) {
        throw new Error('Operational V2 milestones are no longer ready for PIC assignment.');
      }

      const { data: firstMilestone, error: firstMilestoneError } = await supabaseAdmin
        .from('project_milestones')
        .update({ status: 'IN_PROGRESS', pic_id: picId, updated_at: reviewedAt })
        .eq('id', context.firstMilestone.id)
        .eq('status', 'CREATED')
        .eq('pic_id', picId)
        .select('id,status,pic_id,updated_at')
        .maybeSingle();
      if (firstMilestoneError || !firstMilestone) {
        throw new Error('Failed to start the first Operational V2 milestone.');
      }
      firstMilestoneStarted = true;

      const { data: activatedProject, error: projectError } = await supabaseAdmin
        .from('projects')
        .update({ status: 'ACTIVE', pic_id: picId, is_postponed: false, updated_at: reviewedAt })
        .eq('id', project.id)
        .eq('status', 'DRAFT')
        .is('pic_id', null)
        .select('id,status,pic_id')
        .maybeSingle();
      if (projectError || !activatedProject) throw new Error('Project is no longer ready for Operational V2 activation.');
      projectActivated = true;

      await logWorkflowActivityBestEffort(
        actor,
        project.id,
        'PIC_ASSIGNED',
        `${actor.fullName} assigned ${context.pic.full_name} as Solution Architect PIC for '${project.name}'`
      );
      await logWorkflowActivityBestEffort(
        actor,
        project.id,
        'PROJECT_PLAN_APPROVED',
        `${actor.fullName} approved the project plan for '${project.name}'`
      );

      await notifyPicAssignment({
        projectId: project.id,
        projectName: project.name,
        previousPicId: null,
        currentPicId: picId,
      });
      await notifyProjectPlanApproved(project);

      return {
        ...updatedApproval,
        project_status: activatedProject.status,
        project_pic_id: activatedProject.pic_id,
        assignment: history,
        set_deadline_milestone: null,
        next_milestone: firstMilestone,
        started: true,
        project_completed: false,
        blocked_reason: null,
      };
    } catch (error) {
      await rollbackOperationalV2Approval({
        project,
        approval: pendingApproval,
        actor,
        picId,
        reviewedAt,
        assignmentMilestones: context.assignmentMilestones,
        updatedMilestoneIds,
        firstMilestoneId: context.firstMilestone.id,
        firstMilestoneStarted,
        historyId,
        projectActivated,
        approvalUpdated: Boolean(updatedApproval),
      });
      throw error;
    }
  }

  private static async assertTimelineValid(projectId: string, workflowMode: ProjectPlanWorkflowMode) {
    const milestones = await this.getTimelineMilestones(projectId);
    if (!hasValidInitialTimeline(milestones, workflowMode)) {
      throw new Error('A complete initial timeline is required before submitting the project plan.');
    }

    const executableMilestones = getExecutableMilestones(milestones, workflowMode);
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
    const workflowMode = await this.getWorkflowMode(project);

    assertNoPendingProjectPlanApproval(
      Boolean(await this.getPendingApproval(projectId)),
      'Project plan is pending review.'
    );

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
      const update = buildInitialTimelineUpdate(milestone, calculated, workflowMode);
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
    const workflowMode = await this.getWorkflowMode(project);
    await this.assertTimelineValid(projectId, workflowMode);

    assertNoPendingProjectPlanApproval(
      Boolean(await this.getPendingApproval(projectId)),
      'A project plan approval is already pending.'
    );

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
    await notifyProjectPlanSubmitted(project);

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
    actor: Actor
  ) {
    if (actor.role !== 'HEAD_SA') throw new Error('Forbidden');

    const project = await this.getProject(projectId);
    assertDraftProject(project);
    const workflowMode = await this.getWorkflowMode(project);
    const pendingApproval = await this.getPendingApproval(projectId);
    if (!pendingApproval) throw new Error('Project plan approval is no longer pending.');

    if (decision === 'APPROVED') {
      await this.assertTimelineValid(projectId, workflowMode);
      assertOperationalV2ApprovalPic(workflowMode, picId);
    }

    const reviewedAt = new Date().toISOString();

    if (decision === 'REJECTED') {
      const updatedApproval = await this.updatePendingApproval(pendingApproval, decision, note, actor, reviewedAt);
      await logActivity(actor, projectId, 'PROJECT_PLAN_REJECTED', `${actor.fullName} rejected the project plan for '${project.name}'`);
      await notifyProjectPlanRejected(project);
      return { ...updatedApproval, ...buildRejectedProjectPlanReviewResult(project.status) };
    }

    if (workflowMode === 'OPERATIONAL_V2') {
      assertOperationalV2ApprovalPic(workflowMode, picId);
      return this.approveOperationalV2(project, pendingApproval, note, picId, actor);
    }

    const updatedApproval = await this.updatePendingApproval(pendingApproval, decision, note, actor, reviewedAt);

    const milestones = await this.getTimelineMilestones(projectId);
    const timelineMilestone = milestones.find((milestone) => milestone.step_order === TIMELINE_PLANNING_STEP_ORDER);
    try {
      assertProjectPlanApprovalProgressionState(project, timelineMilestone);
    } catch (error) {
      const { error: rollbackError } = await supabaseAdmin
        .from('project_plan_approvals')
        .update({ status: 'PENDING', reviewed_by: null, review_note: null, reviewed_at: null, updated_at: new Date().toISOString() })
        .eq('id', pendingApproval.id);

      if (rollbackError) {
        throw new Error('Set Deadline milestone is no longer ready for project plan approval.; rollback failed: ' + rollbackError.message);
      }

      throw error;
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
    await notifyProjectPlanApproved(project);

    return {
      ...updatedApproval,
      project_status: activatedProject.status,
      set_deadline_milestone: completedTimelineMilestone,
      ...progression,
    };
  }

  static approve(projectId: string, input: ApproveProjectPlanInput, actor: Actor) {
    return this.review(projectId, 'APPROVED', input.note, input.pic_id, actor);
  }

  static reject(projectId: string, input: RejectProjectPlanInput, actor: Actor) {
    return this.review(projectId, 'REJECTED', input.note, undefined, actor);
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
      supabaseAdmin.from('projects').select('id,name,customer,scenario_id,sales_id,pic_id,status,is_postponed').in('id', projectIds),
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
