import { supabaseAdmin } from '../config/supabase';
import { notifySalesMilestoneStarted } from './milestone-notification.service';
import { NotificationService } from './notification.service';
import { runNotificationBestEffort } from './notification-dispatch.service';
import { getMandatoryDocumentKeys, resolveScenarioKey } from '../constants/scenarios';
import { projectOutcomeSchema, ProjectOutcomeInput } from '../validators/project-management.validator';

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
  scenario_id: string;
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
const RESULT_PHASE_STATUSES = new Set(['WAITING_RESULT', 'WON', 'LOST']);

export const areSelectedProjectOutputsApproved = (
  rows: Array<{ is_required: boolean; is_selected: boolean; status: string }>
): boolean => {
  const requiredOrSelected = rows.filter((row) => row.is_required || row.is_selected);
  return requiredOrSelected.length > 0
    && requiredOrSelected.every((row) => row.status === 'APPROVED');
};

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

export async function logWorkflowActivityBestEffort(actor: WorkflowActor, projectId: string, action: string, description: string) {
  try {
    await logActivity(actor, projectId, action, description);
  } catch {
    console.error('[WorkflowProgression] Failed to record activity after a durable transition.', {
      projectId,
      actorId: actor.userId,
      action,
    });
  }
}

function existingNextMilestoneResult(next: WorkflowMilestone) {
  const alreadyStarted = ['IN_PROGRESS', 'SUBMITTED', 'REJECTED', 'COMPLETED', 'APPROVED'].includes(next.status);
  return {
    next_milestone: { id: next.id, name: next.name, step_order: next.step_order, status: next.status },
    started: false,
    project_completed: false,
    blocked_reason: alreadyStarted ? null : 'NEXT_NOT_CREATED' as const,
  };
}

async function getProject(projectId: string): Promise<WorkflowProject> {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id,name,sales_id,pic_id,status,is_postponed,scenario_id')
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
    .select(`${milestoneSelect},project:projects!project_milestones_project_id_fkey(id,name,sales_id,pic_id,status,is_postponed,scenario_id)`)
    .eq('id', milestoneId)
    .single();

  if (error || !data) throw new Error('Milestone not found');

  const project = normalizeRelatedOne(data.project as WorkflowProject | WorkflowProject[] | null);
  if (!project) throw new Error('Project not found');

  return { milestone: data as WorkflowMilestone, project };
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

  const current = milestones.find((milestone) => milestone.id === completedMilestoneId);
  if (!current || !isMilestoneCompletedLike(current.status)) {
    return { next_milestone: null, started: false, project_completed: false, blocked_reason: 'CURRENT_NOT_COMPLETED' as const };
  }

  if ((project.status === 'COMPLETED' || RESULT_PHASE_STATUSES.has(project.status)) && !project.is_postponed) {
    return { next_milestone: null, started: false, project_completed: true, blocked_reason: null };
  }
  if (project.status !== 'ACTIVE' || project.is_postponed) {
    return { next_milestone: null, started: false, project_completed: false, blocked_reason: 'PROJECT_NOT_ACTIVE' as const };
  }

  const next = milestones.find((milestone) => milestone.step_order > current.step_order) || null;

  if (!next) {
    const allCompleted = milestones.length > 0 && milestones.every((milestone) => isMilestoneCompletedLike(milestone.status));
    if (!allCompleted) {
      return { next_milestone: null, started: false, project_completed: false, blocked_reason: 'REMAINING_MILESTONES' as const };
    }

    const { data: outputDocuments, error: outputError } = await supabaseAdmin
      .from('project_output_documents')
      .select('is_required,is_selected,status')
      .eq('project_id', project.id);
    if (outputError) throw new Error('Failed to verify project output documents.');
    if (!areSelectedProjectOutputsApproved(outputDocuments || [])) {
      return { next_milestone: null, started: false, project_completed: false, blocked_reason: 'OUTPUT_DOCUMENTS_PENDING' as const };
    }

    const { data: completedProject, error } = await supabaseAdmin
      .from('projects')
      .update({ status: 'WAITING_RESULT', updated_at: nowIso() })
      .eq('id', project.id)
      .eq('status', 'ACTIVE')
      .eq('is_postponed', false)
      .select('id,status')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (completedProject) {
      await logWorkflowActivityBestEffort(
        actor,
        project.id,
        'PROJECT_WAITING_RESULT',
        `${actor.fullName} completed delivery for project '${project.name}' after milestone '${current.name}'`
      );
      await runNotificationBestEffort('project result notification', () =>
        NotificationService.createNotification({
          userId: project.sales_id,
          type: 'PROJECT_WAITING_RESULT',
          title: 'Project Result Required',
          message: `Delivery for project '${project.name}' is complete. Record the tender result as WON or LOST.`,
          projectId: project.id,
          actionUrl: `/projects/${project.id}`,
        })
      );
    }

    // A concurrent reconciler may have won the CAS. Read its result, not our stale snapshot.
    const latestProject = completedProject ? project : await getProject(project.id);
    const projectCompleted = Boolean(completedProject)
      || ((latestProject.status === 'COMPLETED' || RESULT_PHASE_STATUSES.has(latestProject.status)) && !latestProject.is_postponed);
    return {
      next_milestone: null,
      started: false,
      project_completed: projectCompleted,
      blocked_reason: projectCompleted ? null : 'PROJECT_NOT_ACTIVE' as const,
    };
  }

  if (next.status !== 'CREATED') {
    return existingNextMilestoneResult(next);
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
    const [latestProject, latestMilestones] = await Promise.all([getProject(projectId), getProjectMilestones(projectId)]);
    if ((latestProject.status === 'COMPLETED' || RESULT_PHASE_STATUSES.has(latestProject.status)) && !latestProject.is_postponed) {
      return { next_milestone: null, started: false, project_completed: true, blocked_reason: null };
    }
    if (latestProject.status !== 'ACTIVE' || latestProject.is_postponed) {
      return { next_milestone: null, started: false, project_completed: false, blocked_reason: 'PROJECT_NOT_ACTIVE' as const };
    }
    const latestNext = latestMilestones.find((milestone) => milestone.id === next.id);
    if (latestNext && latestNext.status !== 'CREATED') return existingNextMilestoneResult(latestNext);
    return {
      next_milestone: { id: next.id, name: next.name, step_order: next.step_order, status: next.status },
      started: false,
      project_completed: false,
      blocked_reason: 'STALE_NEXT_MILESTONE' as const,
    };
  }

  await logWorkflowActivityBestEffort(actor, project.id, 'MILESTONE_STARTED', `${actor.fullName} started milestone '${startedMilestone.name}'`);
  if (stageRole === 'SALES') {
    await notifySalesMilestoneStarted({
      projectId: project.id,
      projectName: project.name,
      milestoneId: startedMilestone.id,
      milestoneName: startedMilestone.name,
      salesOwnerId: project.sales_id,
    });
  }

  return {
    next_milestone: startedMilestone,
    started: true,
    project_completed: false,
    blocked_reason: null,
  };
}

function assertCanCompleteOrReconcile(milestone: WorkflowMilestone, project: WorkflowProject, actor: WorkflowActor) {
  assertActorCanComplete(milestone, project, actor);
  if (!(milestone.status === 'COMPLETED'
    && (project.status === 'COMPLETED' || RESULT_PHASE_STATUSES.has(project.status))
    && !project.is_postponed)) {
    assertProjectIsActive(project);
  }
  if (milestone.name.trim().toLocaleLowerCase() === 'assign pic') {
    throw new Error('Assign a PIC to complete this milestone.');
  }
  if (milestone.status !== 'IN_PROGRESS' && milestone.status !== 'COMPLETED') {
    throw new Error('Only IN_PROGRESS milestones can be completed.');
  }
}

export async function completeMilestoneStage(milestoneId: string, actor: WorkflowActor, outcomeInput?: ProjectOutcomeInput) {
  let { milestone, project } = await getMilestoneWithProject(milestoneId);
  let isFinalSalesMilestone = false;
  if (stageRoleOf(milestone) === 'SALES') {
    try {
      isFinalSalesMilestone = !(await getProjectMilestones(project.id)).some((row) => row.step_order > milestone.step_order);
    } catch {
      console.error('[WorkflowProgression] Failed to identify the final Sales milestone.', { milestoneId, projectId: project.id });
      throw new Error('Unable to verify milestone progression. Please try again.');
    }
  }
  if (isFinalSalesMilestone) {
    assertActorCanComplete(milestone, project, actor);
    if (!(milestone.status === 'COMPLETED' && ['WON', 'LOST'].includes(project.status) && !project.is_postponed)) {
      assertProjectIsActive(project);
    }
    if (milestone.status !== 'IN_PROGRESS' && milestone.status !== 'COMPLETED') {
      throw new Error('Only IN_PROGRESS milestones can be completed.');
    }
    const parsed = projectOutcomeSchema.safeParse(outcomeInput);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'A valid project result is required.');

    const { data: scenario, error: scenarioError } = await supabaseAdmin
      .from('scenarios').select('name').eq('id', project.scenario_id).single();
    if (scenarioError || !scenario || !['Pra-Tender', 'On Submission Tender', 'Assessment', 'Existing TOR'].includes(scenario.name)) {
      throw new Error('Project scenario is not available for completion.');
    }
    const mandatoryKeys = getMandatoryDocumentKeys(resolveScenarioKey(scenario.name));
    const { data, error } = await supabaseAdmin.rpc('complete_final_sales_milestone_with_outcome', {
      p_milestone_id: milestone.id,
      p_sales_id: actor.userId,
      p_outcome: parsed.data.outcome,
      p_final_contract_value: parsed.data.outcome === 'WON' ? parsed.data.final_contract_value : null,
      p_loss_reason: parsed.data.outcome === 'LOST' ? parsed.data.loss_reason : null,
      p_required_output_keys: mandatoryKeys,
    });
    if (error) {
      const safeMessages = new Set([
        'Milestone not found.', 'Only the project owner can complete this milestone.',
        'This is not the final milestone.', 'A valid project result is required.',
        'Project result has already been recorded.', 'Project is not active.',
        'Only IN_PROGRESS milestones can be completed.', 'Other milestones must be completed first.',
        'Selected output documents must be approved first.',
      ]);
      if (safeMessages.has(error.message)) throw new Error(error.message);
      console.error('[WorkflowProgression] Final Sales completion transaction failed.', {
        milestoneId: milestone.id, projectId: project.id, code: error.code,
      });
      throw new Error('Unable to complete the milestone and record the project result. Please try again.');
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw new Error('Unable to verify project completion. Please refresh and try again.');
    if (result.changed) {
      await logWorkflowActivityBestEffort(actor, project.id, 'MILESTONE_COMPLETED', `${actor.fullName} completed milestone '${milestone.name}'`);
      await logWorkflowActivityBestEffort(actor, project.id, `PROJECT_${parsed.data.outcome}`, `${actor.fullName} marked project '${project.name}' as ${parsed.data.outcome}`);
    }
    return {
      milestone_id: milestone.id,
      name: result.milestone_name,
      status: 'COMPLETED',
      completed_at: result.completed_at,
      next_milestone: null,
      started: false,
      project_completed: true,
      blocked_reason: null,
      project_status: result.project_status,
    };
  }
  assertCanCompleteOrReconcile(milestone, project, actor);

  if (milestone.status === 'IN_PROGRESS') {
    const completedAt = nowIso();
    const { data: completedMilestone, error } = await supabaseAdmin
      .from('project_milestones')
      .update({ status: 'COMPLETED', completed_at: completedAt, updated_at: completedAt })
      .eq('id', milestone.id)
      .eq('status', 'IN_PROGRESS')
      .select('id,project_id,name,step_order,status,completed_at')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (completedMilestone) {
      milestone = { ...milestone, ...completedMilestone };
      await logWorkflowActivityBestEffort(actor, project.id, 'MILESTONE_COMPLETED', `${actor.fullName} completed milestone '${milestone.name}'`);
    } else {
      ({ milestone, project } = await getMilestoneWithProject(milestoneId));
      assertCanCompleteOrReconcile(milestone, project, actor);
      if (milestone.status !== 'COMPLETED') throw new Error('Only IN_PROGRESS milestones can be completed.');
    }
  }

  const progression = await advanceToNextMilestone(project.id, milestone.id, actor);

  return {
    milestone_id: milestone.id,
    name: milestone.name,
    status: milestone.status,
    completed_at: milestone.completed_at,
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

  await logWorkflowActivityBestEffort(actor, project.id, 'MILESTONE_COMPLETED', `${actor.fullName} completed milestone '${completedMilestone.name}' by assigning a PIC`);
  const progression = await advanceToNextMilestone(project.id, completedMilestone.id, actor);

  return { completed: true, milestone: completedMilestone, progression };
}
