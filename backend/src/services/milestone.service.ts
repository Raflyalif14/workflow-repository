import { supabaseAdmin } from '../config/supabase';
import {
  completeMilestoneStage,
  isMilestoneCompletedLike,
  logWorkflowActivityBestEffort,
  startMilestoneStage,
} from './workflow-progression.service';
import { notifyMilestoneSubmitted } from './milestone-notification.service';

type Actor = { userId: string; role: string; fullName: string };
type MilestoneInput = {
  project_id: string;
  workflow_stage_id: string;
  name: string;
  description: string | null;
  step_order: number;
  status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED';
  completed_at?: string | null;
};
type WorkflowStageMilestoneSource = { id: string; name: string; description: string | null; step_order: number };
export type ScenarioWorkflowConfiguration = {
  workflow_model: string;
  workflow_version: number;
};
type SupportedWorkflowInitializationMode = 'LEGACY' | 'OPERATIONAL_V2';
type SubmissionMilestoneState = {
  id?: string;
  status: string;
  pic_id: string | null;
  project: {
    status: string;
    is_postponed: boolean;
  } | null;
};
type RevisionMilestoneState = SubmissionMilestoneState & {
  id: string;
  name: string;
  project_id: string;
};

export const selectMilestones = 'id, project_id, workflow_stage_id, name, description, step_order, status, pic_id, start_date, duration_working_days, due_date, completed_at, pic:users!project_milestones_pic_id_fkey(id,full_name,email,role), workflow_stage:workflow_stages!project_milestones_workflow_stage_id_fkey(id,default_role), created_at, updated_at';
export const INITIAL_MILESTONE_STATUS = 'CREATED' as const;

export class MilestoneInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MilestoneInitializationError';
  }
}

export function resolveWorkflowInitializationMode(
  scenario: ScenarioWorkflowConfiguration
): SupportedWorkflowInitializationMode {
  if (scenario.workflow_model === 'LEGACY' && scenario.workflow_version === 1) {
    return 'LEGACY';
  }
  if (scenario.workflow_model === 'OPERATIONAL_V2' && scenario.workflow_version === 2) {
    return 'OPERATIONAL_V2';
  }

  throw new MilestoneInitializationError('Unsupported scenario workflow model/version.');
}

const normalizeRelatedOne = <T>(value: T | T[] | null): T | null => {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
};

export function validateMilestoneSubmissionState(milestone: SubmissionMilestoneState, actor: Actor) {
  if (!['SA', 'HEAD_SA'].includes(actor.role)) throw new Error('Forbidden');
  if (!milestone.project) throw new Error('Project not found');
  if (milestone.pic_id !== actor.userId) throw new Error('Forbidden');
  if (milestone.project.status === 'POSTPONED' || milestone.project.is_postponed) throw new Error('Project is postponed.');
  if (milestone.project.status !== 'ACTIVE') throw new Error('Project is not active.');
  if (milestone.status !== 'IN_PROGRESS') throw new Error('Only an IN_PROGRESS milestone can be submitted.');
}

export function buildMilestoneSubmissionResult(
  milestone: SubmissionMilestoneState & { id: string; name: string },
  actor: Actor,
  hasPendingApproval: boolean,
  note?: string
) {
  validateMilestoneSubmissionState(milestone, actor);
  if (hasPendingApproval) throw new Error('This milestone already has a pending approval.');

  return {
    milestone_id: milestone.id,
    name: milestone.name,
    status: 'SUBMITTED',
    submitted_by: {
      id: actor.userId,
      full_name: actor.fullName,
    },
    approval: {
      status: 'PENDING',
      submitted_by: actor.userId,
      submission_note: note?.trim() || null,
    },
  };
}

export function buildMilestoneRevisionStartResult(
  milestone: RevisionMilestoneState,
  actor: Actor,
  hasRejectedApproval: boolean,
  hasPendingApproval: boolean
) {
  if (!['SA', 'HEAD_SA'].includes(actor.role)) throw new Error('Forbidden');
  if (!milestone.project) throw new Error('Project not found');
  if (milestone.pic_id !== actor.userId) throw new Error('Only the assigned PIC can revise this milestone.');
  if (milestone.project.status === 'POSTPONED' || milestone.project.is_postponed) throw new Error('Project is postponed.');
  if (milestone.project.status !== 'ACTIVE') throw new Error('Project is not active.');
  if (milestone.status !== 'REJECTED') throw new Error('Only rejected milestones can start revision.');
  if (!hasRejectedApproval) throw new Error('Milestone does not have a rejected approval.');
  if (hasPendingApproval) throw new Error('This milestone already has a pending approval.');

  return {
    milestone_id: milestone.id,
    name: milestone.name,
    status: 'IN_PROGRESS',
    revised_by: {
      id: actor.userId,
      full_name: actor.fullName,
    },
  };
}

export function buildInitialMilestoneRows(
  projectId: string,
  stages: WorkflowStageMilestoneSource[],
  createdAt = new Date().toISOString(),
  scenario: ScenarioWorkflowConfiguration = { workflow_model: 'LEGACY', workflow_version: 1 }
): MilestoneInput[] {
  const initializationMode = resolveWorkflowInitializationMode(scenario);

  return stages.map((stage) => {
    const status = initializationMode === 'OPERATIONAL_V2'
      ? INITIAL_MILESTONE_STATUS
      : stage.step_order === 1
        ? 'COMPLETED'
        : stage.step_order === 2
          ? 'IN_PROGRESS'
          : INITIAL_MILESTONE_STATUS;

    return {
      project_id: projectId,
      workflow_stage_id: stage.id,
      name: stage.name,
      description: stage.description,
      step_order: stage.step_order,
      status,
      ...(status === 'COMPLETED' ? { completed_at: createdAt } : {}),
    };
  });
}

export function calculateMilestoneProgress(milestones: Array<{ status: string }>) {
  const completed = milestones.filter((item) => isMilestoneCompletedLike(item.status)).length;
  return {
    completed,
    total: milestones.length,
    percentage: milestones.length ? Math.round((completed / milestones.length) * 100) : 0,
  };
}

async function logMilestoneSubmitted(actor: Actor, projectId: string, milestoneName: string, note?: string) {
  const description = `${actor.fullName} submitted milestone '${milestoneName}'${note ? `. Note: ${note}` : ''}`;
  await logWorkflowActivityBestEffort(actor, projectId, 'MILESTONE_SUBMITTED', description);
}

async function logMilestoneRevisionStarted(actor: Actor, projectId: string, milestoneName: string) {
  await logWorkflowActivityBestEffort(
    actor,
    projectId,
    'MILESTONE_REVISION_STARTED',
    `${actor.fullName} started revision for milestone '${milestoneName}'`
  );
}

export class MilestoneService {
  static async getProject(projectId: string, actor: Actor) {
    const { data, error } = await supabaseAdmin.from('projects').select('id, name, sales_id, pic_id, scenario_id').eq('id', projectId).single();
    if (error || !data || (actor.role === 'SALES' && data.sales_id !== actor.userId) || (actor.role === 'SA' && data.pic_id !== actor.userId)) throw new Error('Project not found');
    return data;
  }

  static async list(projectId: string, actor: Actor) {
    await this.getProject(projectId, actor);
    const { data, error } = await supabaseAdmin.from('project_milestones').select(selectMilestones).eq('project_id', projectId).order('step_order', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  static async progress(projectId: string, actor: Actor) {
    const milestones = await this.list(projectId, actor);
    return calculateMilestoneProgress(milestones);
  }

  static async initialize(projectId: string, actor: Actor) {
    const project = await this.getProject(projectId, actor);
    const { count, error: countError } = await supabaseAdmin.from('project_milestones').select('id', { count: 'exact', head: true }).eq('project_id', projectId);
    if (countError) throw new Error(countError.message);
    if ((count || 0) > 0) throw new Error('Workflow has already been initialized for this project.');

    const { data: scenario, error: scenarioError } = await supabaseAdmin
      .from('scenarios')
      .select('workflow_model, workflow_version')
      .eq('id', project.scenario_id)
      .single();
    if (scenarioError || !scenario) throw new MilestoneInitializationError('Project scenario not found.');

    const { data: stages, error: stageError } = await supabaseAdmin.from('workflow_stages').select('id, name, description, step_order').eq('scenario_id', project.scenario_id).eq('is_active', true).order('step_order', { ascending: true });
    if (stageError) throw new Error(stageError.message);
    if (!stages?.length) throw new Error('No active workflow stages found for this scenario.');
    const rows = buildInitialMilestoneRows(projectId, stages, new Date().toISOString(), scenario);
    const { data, error } = await supabaseAdmin.from('project_milestones').insert(rows).select(selectMilestones).order('step_order', { ascending: true });
    if (error || !data || data.length !== rows.length) {
      await supabaseAdmin.from('project_milestones').delete().eq('project_id', projectId);
      throw new Error(error?.message || 'Workflow initialization failed; no milestones were retained.');
    }
    return data;
  }

  static startStage(milestoneId: string, actor: Actor) {
    return startMilestoneStage(milestoneId, actor);
  }

  static completeStage(milestoneId: string, actor: Actor) {
    return completeMilestoneStage(milestoneId, actor);
  }

  static async submitMilestone(milestoneId: string, actor: Actor, note?: string) {
    const { data: milestone, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id, project_id, name, status, pic_id, project:projects!project_milestones_project_id_fkey(id,name,status,is_postponed)')
      .eq('id', milestoneId)
      .single();

    if (error || !milestone) throw new Error('Milestone not found');

    const project = normalizeRelatedOne(milestone.project);
    validateMilestoneSubmissionState({ ...milestone, project }, actor);

    const { data: pendingApproval, error: pendingApprovalError } = await supabaseAdmin
      .from('milestone_approvals')
      .select('id')
      .eq('milestone_id', milestoneId)
      .eq('status', 'PENDING')
      .maybeSingle();

    if (pendingApprovalError) throw new Error(pendingApprovalError.message);
    if (pendingApproval) throw new Error('This milestone already has a pending approval.');

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('project_milestones')
      .update({
        status: 'SUBMITTED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', milestoneId)
      .eq('status', 'IN_PROGRESS')
      .select('id, name, status, project_id')
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error('Only an IN_PROGRESS milestone can be submitted.');

    const submissionNote = note?.trim() || null;
    const { data: approval, error: approvalError } = await supabaseAdmin
      .from('milestone_approvals')
      .insert({
        milestone_id: updated.id,
        submitted_by: actor.userId,
        submission_note: submissionNote,
        status: 'PENDING',
        reviewed_by: null,
        review_note: null,
        reviewed_at: null,
      })
      .select('id, status, submitted_by, submission_note')
      .single();

    if (approvalError || !approval) {
      await supabaseAdmin
        .from('project_milestones')
        .update({ status: 'IN_PROGRESS', updated_at: new Date().toISOString() })
        .eq('id', milestoneId);
      throw new Error(approvalError?.message || 'Failed to create milestone approval.');
    }

    await logMilestoneSubmitted(actor, updated.project_id, updated.name, note?.trim());
    if (project?.name) {
      await notifyMilestoneSubmitted({
        projectId: updated.project_id,
        projectName: project.name,
        milestoneId: updated.id,
        milestoneName: updated.name,
        picId: milestone.pic_id,
      });
    }

    return {
      milestone_id: updated.id,
      name: updated.name,
      status: updated.status,
      submitted_by: {
        id: actor.userId,
        full_name: actor.fullName,
      },
      approval: {
        id: approval.id,
        status: approval.status,
      },
    };
  }

  static async startRevision(milestoneId: string, actor: Actor) {
    const { data: milestone, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id, project_id, name, status, pic_id, project:projects!project_milestones_project_id_fkey(id,status,is_postponed)')
      .eq('id', milestoneId)
      .single();

    if (error || !milestone) throw new Error('Milestone not found');

    const project = normalizeRelatedOne(milestone.project);
    const { data: approvals, error: approvalError } = await supabaseAdmin
      .from('milestone_approvals')
      .select('id, status')
      .eq('milestone_id', milestoneId)
      .in('status', ['PENDING', 'REJECTED']);

    if (approvalError) throw new Error(approvalError.message);

    const hasRejectedApproval = Boolean((approvals || []).some((approval) => approval.status === 'REJECTED'));
    const hasPendingApproval = Boolean((approvals || []).some((approval) => approval.status === 'PENDING'));
    buildMilestoneRevisionStartResult({ ...milestone, project } as RevisionMilestoneState, actor, hasRejectedApproval, hasPendingApproval);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('project_milestones')
      .update({
        status: 'IN_PROGRESS',
        updated_at: new Date().toISOString(),
      })
      .eq('id', milestoneId)
      .eq('status', 'REJECTED')
      .select('id, project_id, name, status')
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error('Only rejected milestones can start revision.');

    await logMilestoneRevisionStarted(actor, updated.project_id, updated.name);

    return {
      milestone_id: updated.id,
      name: updated.name,
      status: updated.status,
      revised_by: {
        id: actor.userId,
        full_name: actor.fullName,
      },
    };
  }
}
