import { supabaseAdmin } from '../config/supabase';

export type WorkflowActor = {
  userId: string;
  role: string;
  fullName: string;
};

type WorkflowProject = {
  id: string;
  name: string;
  sales_id: string;
  pic_id: string | null;
  status: string;
  is_postponed: boolean | null;
};

type WorkflowMilestone = {
  id: string;
  project_id: string;
  name: string;
  step_order: number;
  status: string;
  pic_id: string | null;
  completed_at: string | null;
  workflow_stage: { default_role: string } | { default_role: string }[] | null;
};

const milestoneSelect = 'id,project_id,name,step_order,status,pic_id,completed_at,workflow_stage:workflow_stages!project_milestones_workflow_stage_id_fkey(default_role)';

const normalizeRelatedOne = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? value[0] || null : value || null;

const stageRoleOf = (milestone: WorkflowMilestone): string | null =>
  normalizeRelatedOne(milestone.workflow_stage)?.default_role || null;

const nowIso = () => new Date().toISOString();

export const isMilestoneCompletedLike = (status: string): boolean =>
  status === 'COMPLETED' || status === 'APPROVED';

export function getAutoStartBlockReason(stageRole: string | null, picId: string | null) {
  if (stageRole === 'SALES' || stageRole === 'HEAD_SA') return null;
  if (stageRole === 'SA') return picId ? null : 'PIC_REQUIRED';
  return 'UNSUPPORTED_ROLE';
}

function assertProjectIsActive(project: WorkflowProject) {
  if (project.status === 'POSTPONED' || project.is_postponed) {
    throw new Error('Project is postponed.');
  }

  if (project.status !== 'ACTIVE') {
    throw new Error('Project is not active.');
  }
}

function assertPreviousMilestonesCompleted(milestone: WorkflowMilestone, milestones: WorkflowMilestone[]) {
  const hasIncompletePreviousMilestone = milestones.some(
    (candidate) => candidate.step_order < milestone.step_order && !isMilestoneCompletedLike(candidate.status)
  );

  if (hasIncompletePreviousMilestone) {
    throw new Error('Previous milestone must be completed before this stage can start.');
  }
}

function assertActorCanStart(milestone: WorkflowMilestone, project: WorkflowProject, actor: WorkflowActor) {
  const stageRole = stageRoleOf(milestone);

  if (stageRole === 'SALES') {
    if (actor.role !== 'SALES' || project.sales_id !== actor.userId) {
      throw new Error('Only the project owner can start this milestone.');
    }
    return;
  }

  if (stageRole === 'HEAD_SA') {
    if (actor.role !== 'HEAD_SA') {
      throw new Error('Only HEAD_SA can start this milestone.');
    }
    return;
  }

  if (stageRole === 'SA') {
    if (!milestone.pic_id) {
      throw new Error('Milestone must have an assigned SA PIC before it can be started.');
    }
    if (actor.role !== 'SA' || milestone.pic_id !== actor.userId) {
      throw new Error('Only the assigned SA PIC can start this milestone.');
    }
    return;
  }

  throw new Error('Milestone has an unsupported responsible role.');
}

function assertActorCanComplete(milestone: WorkflowMilestone, project: WorkflowProject, actor: WorkflowActor) {
  const stageRole = stageRoleOf(milestone);

  if (stageRole === 'SALES') {
    if (actor.role !== 'SALES' || project.sales_id !== actor.userId) {
      throw new Error('Only the project owner can complete this milestone.');
    }
    return;
  }

  if (stageRole === 'HEAD_SA') {
    if (actor.role !== 'HEAD_SA') {
      throw new Error('Only HEAD_SA can complete this milestone.');
    }
    return;
  }

  if (stageRole === 'SA') {
    throw new Error('SA milestones must be submitted for HEAD_SA review.');
  }

  throw new Error('Milestone has an unsupported responsible role.');
}

async function logActivity(actor: WorkflowActor, projectId: string, action: string, description: string) {
  const { error } = await supabaseAdmin.from('activity_logs').insert({
    project_id: projectId,
    user_id: actor.userId,
    action,
    description,
  });

  if (error) throw new Error(error.message);
}

async function getProject(projectId: string): Promise<WorkflowProject> {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id,name,sales_id,pic_id,status,is_postponed')
    .eq('id', projectId)
    .single();

  if (error || !data) throw new Error('Project not found');
  return data as WorkflowProject;
}

async function getProjectMilestones(projectId: string): Promise<WorkflowMilestone[]> {
  const { data, error } = await supabaseAdmin
    .from('project_milestones')
    .select(milestoneSelect)
    .eq('project_id', projectId)
    .order('step_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as WorkflowMilestone[];
}

async function getMilestoneWithProject(milestoneId: string) {
  const { data, error } = await supabaseAdmin
    .from('project_milestones')
    .select(`${milestoneSelect},project:projects!project_milestones_project_id_fkey(id,name,sales_id,pic_id,status,is_postponed)`)
    .eq('id', milestoneId)
    .single();

  if (error || !data) throw new Error('Milestone not found');

  const project = normalizeRelatedOne(data.project as WorkflowProject | WorkflowProject[] | null);
  if (!project) throw new Error('Project not found');

  return { milestone: data as WorkflowMilestone, project };
}

export async function startMilestoneStage(milestoneId: string, actor: WorkflowActor) {
  const { milestone, project } = await getMilestoneWithProject(milestoneId);
  assertProjectIsActive(project);

  if (milestone.status !== 'CREATED') {
    throw new Error('Only CREATED milestones can be started.');
  }

  const milestones = await getProjectMilestones(project.id);
  assertPreviousMilestonesCompleted(milestone, milestones);
  assertActorCanStart(milestone, project, actor);

  const { data: updated, error } = await supabaseAdmin
    .from('project_milestones')
    .update({ status: 'IN_PROGRESS', updated_at: nowIso() })
    .eq('id', milestone.id)
    .eq('status', 'CREATED')
    .select('id,project_id,name,step_order,status,pic_id,completed_at')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!updated) throw new Error('Only CREATED milestones can be started.');

  await logActivity(actor, project.id, 'MILESTONE_STARTED', `${actor.fullName} started milestone '${updated.name}'`);

  return updated;
}

export async function advanceToNextMilestone(
  projectId: string,
  completedMilestoneId: string,
  actor: WorkflowActor
) {
  const [project, milestones] = await Promise.all([
    getProject(projectId),
    getProjectMilestones(projectId),
  ]);

  if (project.status !== 'ACTIVE' || project.is_postponed) {
    return { next_milestone: null, started: false, project_completed: false, blocked_reason: 'PROJECT_NOT_ACTIVE' as const };
  }

  const current = milestones.find((milestone) => milestone.id === completedMilestoneId);
  if (!current || !isMilestoneCompletedLike(current.status)) {
    return { next_milestone: null, started: false, project_completed: false, blocked_reason: 'CURRENT_NOT_COMPLETED' as const };
  }

  const next = milestones.find((milestone) => milestone.step_order > current.step_order) || null;

  if (!next) {
    const allCompleted = milestones.length > 0 && milestones.every((milestone) => isMilestoneCompletedLike(milestone.status));
    if (!allCompleted) {
      return { next_milestone: null, started: false, project_completed: false, blocked_reason: 'REMAINING_MILESTONES' as const };
    }

    const { data: completedProject, error } = await supabaseAdmin
      .from('projects')
      .update({ status: 'COMPLETED', updated_at: nowIso() })
      .eq('id', project.id)
      .eq('status', 'ACTIVE')
      .select('id,status')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (completedProject) {
      await logActivity(
        actor,
        project.id,
        'PROJECT_COMPLETED',
        `${actor.fullName} completed project '${project.name}' after milestone '${current.name}'`
      );
    }

    return { next_milestone: null, started: false, project_completed: Boolean(completedProject), blocked_reason: null };
  }

  if (next.status !== 'CREATED') {
    return {
      next_milestone: { id: next.id, name: next.name, step_order: next.step_order, status: next.status },
      started: false,
      project_completed: false,
      blocked_reason: 'NEXT_NOT_CREATED' as const,
    };
  }

  const stageRole = stageRoleOf(next);
  const picId = next.pic_id || (stageRole === 'SA' ? project.pic_id : null);
  const autoStartBlockReason = getAutoStartBlockReason(stageRole, picId);
  if (autoStartBlockReason) {
    return {
      next_milestone: { id: next.id, name: next.name, step_order: next.step_order, status: next.status },
      started: false,
      project_completed: false,
      blocked_reason: autoStartBlockReason,
    };
  }

  const { data: startedMilestone, error } = await supabaseAdmin
    .from('project_milestones')
    .update({
      status: 'IN_PROGRESS',
      ...(stageRole === 'SA' && !next.pic_id && picId ? { pic_id: picId } : {}),
      updated_at: nowIso(),
    })
    .eq('id', next.id)
    .eq('status', 'CREATED')
    .select('id,name,step_order,status,pic_id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!startedMilestone) {
    return {
      next_milestone: { id: next.id, name: next.name, step_order: next.step_order, status: next.status },
      started: false,
      project_completed: false,
      blocked_reason: 'STALE_NEXT_MILESTONE' as const,
    };
  }

  await logActivity(actor, project.id, 'MILESTONE_STARTED', `${actor.fullName} started milestone '${startedMilestone.name}'`);

  return {
    next_milestone: startedMilestone,
    started: true,
    project_completed: false,
    blocked_reason: null,
  };
}

export async function completeMilestoneStage(milestoneId: string, actor: WorkflowActor) {
  const { milestone, project } = await getMilestoneWithProject(milestoneId);
  assertProjectIsActive(project);

  if (milestone.status !== 'IN_PROGRESS') {
    throw new Error('Only IN_PROGRESS milestones can be completed.');
  }

  if (milestone.name.trim().toLocaleLowerCase() === 'assign pic') {
    throw new Error('Assign a PIC to complete this milestone.');
  }

  assertActorCanComplete(milestone, project, actor);
  const completedAt = nowIso();

  const { data: completedMilestone, error } = await supabaseAdmin
    .from('project_milestones')
    .update({ status: 'COMPLETED', completed_at: completedAt, updated_at: completedAt })
    .eq('id', milestone.id)
    .eq('status', 'IN_PROGRESS')
    .select('id,project_id,name,step_order,status,completed_at')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!completedMilestone) throw new Error('Only IN_PROGRESS milestones can be completed.');

  await logActivity(actor, project.id, 'MILESTONE_COMPLETED', `${actor.fullName} completed milestone '${completedMilestone.name}'`);
  const progression = await advanceToNextMilestone(project.id, completedMilestone.id, actor);

  return {
    milestone_id: completedMilestone.id,
    name: completedMilestone.name,
    status: completedMilestone.status,
    completed_at: completedMilestone.completed_at,
    ...progression,
  };
}

export async function completeAssignPicStageIfCurrent(projectId: string, actor: WorkflowActor) {
  const [project, milestones] = await Promise.all([
    getProject(projectId),
    getProjectMilestones(projectId),
  ]);

  if (project.status !== 'ACTIVE' || project.is_postponed) {
    return { completed: false, progression: null };
  }

  const assignPicMilestone = milestones.find(
    (milestone) =>
      milestone.status === 'IN_PROGRESS' &&
      milestone.name.trim().toLocaleLowerCase() === 'assign pic' &&
      stageRoleOf(milestone) === 'HEAD_SA'
  );

  if (!assignPicMilestone) {
    return { completed: false, progression: null };
  }

  const completedAt = nowIso();
  const { data: completedMilestone, error } = await supabaseAdmin
    .from('project_milestones')
    .update({ status: 'COMPLETED', completed_at: completedAt, updated_at: completedAt })
    .eq('id', assignPicMilestone.id)
    .eq('status', 'IN_PROGRESS')
    .select('id,project_id,name,step_order,status,completed_at')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!completedMilestone) return { completed: false, progression: null };

  await logActivity(actor, project.id, 'MILESTONE_COMPLETED', `${actor.fullName} completed milestone '${completedMilestone.name}' by assigning a PIC`);
  const progression = await advanceToNextMilestone(project.id, completedMilestone.id, actor);

  return { completed: true, milestone: completedMilestone, progression };
}
