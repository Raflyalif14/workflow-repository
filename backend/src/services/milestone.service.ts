import { supabaseAdmin } from '../config/supabase';

type Actor = { userId: string; role: string; fullName: string };
type MilestoneInput = { project_id: string; workflow_stage_id: string; name: string; description: string | null; step_order: number; status: typeof INITIAL_MILESTONE_STATUS };
type WorkflowStageMilestoneSource = { id: string; name: string; description: string | null; step_order: number };
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

const selectMilestones = 'id, project_id, workflow_stage_id, name, description, step_order, status, pic_id, pic:users!project_milestones_pic_id_fkey(id,full_name,email,role), workflow_stage:workflow_stages!project_milestones_workflow_stage_id_fkey(id,default_role), created_at, updated_at';
export const INITIAL_MILESTONE_STATUS = 'CREATED' as const;

async function logMilestone(actor: Actor, projectId: string, details: string) {
  try {
    await supabaseAdmin.from('activity_logs').insert({ user_id: actor.userId, project_id: projectId, action: 'UPDATE', entity_type: 'PROJECT_MILESTONE', entity_id: projectId, details });
  } catch { return; }
}

const normalizeRelatedOne = <T>(value: T | T[] | null): T | null => {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
};

export function validateMilestoneSubmissionState(milestone: SubmissionMilestoneState, actor: Actor) {
  if (actor.role !== 'SA') throw new Error('Forbidden');
  if (!milestone.project) throw new Error('Project not found');
  if (milestone.pic_id !== actor.userId) throw new Error('Forbidden');
  if (milestone.project.status === 'POSTPONED' || milestone.project.is_postponed) throw new Error('Project is postponed.');
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
  if (actor.role !== 'SA') throw new Error('Forbidden');
  if (!milestone.project) throw new Error('Project not found');
  if (milestone.pic_id !== actor.userId) throw new Error('Only the assigned PIC can revise this milestone.');
  if (milestone.project.status === 'POSTPONED' || milestone.project.is_postponed) throw new Error('Project is postponed.');
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

export function buildInitialMilestoneRows(projectId: string, stages: WorkflowStageMilestoneSource[]): MilestoneInput[] {
  return stages.map((stage) => ({
    project_id: projectId,
    workflow_stage_id: stage.id,
    name: stage.name,
    description: stage.description,
    step_order: stage.step_order,
    status: INITIAL_MILESTONE_STATUS,
  }));
}

export function calculateMilestoneProgress(milestones: Array<{ status: string }>) {
  const completed = milestones.filter((item) => item.status === 'COMPLETED').length;
  return {
    completed,
    total: milestones.length,
    percentage: milestones.length ? Math.round((completed / milestones.length) * 100) : 0,
  };
}

async function logMilestoneSubmitted(actor: Actor, projectId: string, milestoneName: string, note?: string) {
  const description = `${actor.fullName} submitted milestone '${milestoneName}'${note ? `. Note: ${note}` : ''}`;
  const { error } = await supabaseAdmin.from('activity_logs').insert({
    project_id: projectId,
    user_id: actor.userId,
    action: 'MILESTONE_SUBMITTED',
    description,
  });

  if (error) throw error;
}

async function logMilestoneRevisionStarted(actor: Actor, projectId: string, milestoneName: string) {
  const { error } = await supabaseAdmin.from('activity_logs').insert({
    project_id: projectId,
    user_id: actor.userId,
    action: 'MILESTONE_REVISION_STARTED',
    description: `${actor.fullName} started revision for milestone '${milestoneName}'`,
  });

  if (error) throw error;
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

    const { data: stages, error: stageError } = await supabaseAdmin.from('workflow_stages').select('id, name, description, step_order').eq('scenario_id', project.scenario_id).eq('is_active', true).order('step_order', { ascending: true });
    if (stageError) throw new Error(stageError.message);
    if (!stages?.length) throw new Error('No active workflow stages found for this scenario.');
    const rows = buildInitialMilestoneRows(projectId, stages);
    const { data, error } = await supabaseAdmin.from('project_milestones').insert(rows).select(selectMilestones).order('step_order', { ascending: true });
    if (error || !data || data.length !== rows.length) {
      await supabaseAdmin.from('project_milestones').delete().eq('project_id', projectId);
      throw new Error(error?.message || 'Workflow initialization failed; no milestones were retained.');
    }
    await logMilestone(actor, projectId, `${actor.fullName} initialized workflow for project '${project.name}'`);
    return data;
  }

  static async trigger(projectId: string, milestoneId: string, actor: Actor) {
    await this.getProject(projectId, actor);
    const { data: milestone, error } = await supabaseAdmin.from('project_milestones').select('*').eq('id', milestoneId).eq('project_id', projectId).single();
    if (error || !milestone) throw new Error('Milestone not found');
    if (milestone.status !== 'PENDING') throw new Error('Only PENDING milestones can be triggered.');
    if (milestone.step_order > 1) {
      const { data: previous } = await supabaseAdmin.from('project_milestones').select('status').eq('project_id', projectId).eq('step_order', milestone.step_order - 1).single();
      if (!previous || previous.status !== 'COMPLETED') throw new Error('Previous milestone must be completed first.');
    }
    const { data, error: updateError } = await supabaseAdmin.from('project_milestones').update({ status: 'TRIGGERED' }).eq('id', milestoneId).select(selectMilestones).single();
    if (updateError || !data) throw new Error(updateError?.message || 'Milestone update failed');
    await logMilestone(actor, projectId, `${actor.fullName} triggered milestone '${data.name}'`);
    return data;
  }

  static async start(projectId: string, milestoneId: string, actor: Actor) {
    await this.getProject(projectId, actor);
    const { data, error } = await supabaseAdmin.from('project_milestones').update({ status: 'IN_PROGRESS' }).eq('id', milestoneId).eq('project_id', projectId).eq('status', 'TRIGGERED').select(selectMilestones).single();
    if (error || !data) throw new Error('Only TRIGGERED milestones can be started.');
    await logMilestone(actor, projectId, `${actor.fullName} started milestone '${data.name}'`);
    return data;
  }

  static async complete(projectId: string, milestoneId: string, actor: Actor) {
    await this.getProject(projectId, actor);
    const { data, error } = await supabaseAdmin.from('project_milestones').update({ status: 'COMPLETED' }).eq('id', milestoneId).eq('project_id', projectId).eq('status', 'IN_PROGRESS').select(selectMilestones).single();
    if (error || !data) throw new Error('Only IN_PROGRESS milestones can be completed.');
    await logMilestone(actor, projectId, `${actor.fullName} completed milestone '${data.name}'`);
    return data;
  }

  static async submitMilestone(milestoneId: string, actor: Actor, note?: string) {
    const { data: milestone, error } = await supabaseAdmin
      .from('project_milestones')
      .select('id, project_id, name, status, pic_id, project:projects!project_milestones_project_id_fkey(id,status,is_postponed)')
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
