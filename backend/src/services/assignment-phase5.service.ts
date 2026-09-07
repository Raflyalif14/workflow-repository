import { supabaseAdmin } from '../config/supabase';
import {
  resolveWorkflowInitializationMode,
  ScenarioWorkflowConfiguration,
} from './milestone.service';
import { completeAssignPicStageIfCurrent } from './workflow-progression.service';
import { notifyPicAssignment } from './pic-assignment-notification.service';

type Actor = { userId: string; role: string; fullName: string };
type AssignmentProjectState = { pic_id: string | null; status: string; is_postponed: boolean | null };
type AssignmentPicState = { id: string; role: string; is_active: boolean };
type AssignmentWorkflowMode = 'LEGACY' | 'OPERATIONAL_V2';
type MilestonePicSnapshot = { id: string; pic_id: string | null };
const userFields = 'id, full_name, email, role';
const assignmentSelect = `id, project_id, pic_id, assigned_by, previous_pic_id, assignment_type, reason, created_at, pic:users!project_assignments_pic_id_fkey(${userFields}), assigned_by_user:users!project_assignments_assigned_by_fkey(${userFields}), previous_pic:users!project_assignments_previous_pic_id_fkey(${userFields})`;
const lockedHistoricalStatuses = ['COMPLETED', 'APPROVED'];

const mapAssignment = (row: any) => ({
  id: row.id,
  project_id: row.project_id,
  pic_id: row.pic_id,
  previous_pic_id: row.previous_pic_id,
  assigned_by_id: row.assigned_by,
  assignment_type: row.assignment_type,
  reason: row.reason,
  created_at: row.created_at,
  pic: row.pic || null,
  previous_pic: row.previous_pic || null,
  assigned_by: row.assigned_by_user || null,
});

async function logAssignment(actor: Actor, projectId: string, action: 'PIC_ASSIGNED' | 'PIC_REASSIGNED', description: string) {
  const { error } = await supabaseAdmin
    .from('activity_logs')
    .insert({ user_id: actor.userId, project_id: projectId, action, description });
  if (error) throw new Error(error.message);
}

export function assertPicAssignmentActor(actor: Actor): void {
  if (actor.role !== 'HEAD_SA') throw new Error('Forbidden');
}

export function assertPicAssignmentProjectState(project: AssignmentProjectState): void {
  if (project.status !== 'ACTIVE' || project.is_postponed !== false) {
    throw new Error('PIC assignment is only available for ACTIVE projects.');
  }
}

export function assertAssignablePic(pic: AssignmentPicState | null, actor: Actor): asserts pic is AssignmentPicState {
  if (!pic) throw new Error('PIC not found');
  if (!pic.is_active) throw new Error('Selected user is inactive.');
  if (pic.role === 'SA') return;
  if (actor.role === 'HEAD_SA' && pic.role === 'HEAD_SA' && pic.id === actor.userId) return;
  throw new Error('Selected user cannot be assigned as Solution Architect.');
}

export function assertPicAssignmentChange(project: AssignmentProjectState, picId: string, reason?: string): void {
  if (project.pic_id === picId) throw new Error('Project is already assigned to this PIC.');
  if (project.pic_id && !reason?.trim()) throw new Error('Reassignment reason is required.');
}

async function getAssignmentWorkflowMode(project: { scenario_id: string }): Promise<AssignmentWorkflowMode> {
  const { data, error } = await supabaseAdmin
    .from('scenarios')
    .select('workflow_model,workflow_version')
    .eq('id', project.scenario_id)
    .single();

  if (error || !data) throw new Error('Project scenario not found.');
  return resolveWorkflowInitializationMode(data as ScenarioWorkflowConfiguration);
}

async function assertOperationalV2ProjectPlanApproved(projectId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('project_plan_approvals')
    .select('id,status')
    .eq('project_id', projectId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error('Failed to verify project plan approval.');
  if (!data || data.status !== 'APPROVED') {
    throw new Error('Project plan must be approved before assigning a V2 PIC.');
  }
}

async function rollbackOperationalV2Assignment(
  projectId: string,
  assignedPicId: string,
  previousPicId: string | null,
  historyId: string | null,
  milestones: MilestonePicSnapshot[]
): Promise<void> {
  const rollbackFailures: string[] = [];

  for (const milestone of milestones) {
    const { error } = await supabaseAdmin
      .from('project_milestones')
      .update({ pic_id: milestone.pic_id })
      .eq('id', milestone.id)
      .eq('pic_id', assignedPicId);
    if (error) rollbackFailures.push(`milestone:${milestone.id}`);
  }

  if (historyId) {
    const { error } = await supabaseAdmin.from('project_assignments').delete().eq('id', historyId);
    if (error) rollbackFailures.push('history');
  }

  const { error: projectError } = await supabaseAdmin
    .from('projects')
    .update({ pic_id: previousPicId })
    .eq('id', projectId)
    .eq('pic_id', assignedPicId);
  if (projectError) rollbackFailures.push('project');

  if (rollbackFailures.length) {
    console.error('[AssignmentPhase5] Operational V2 assignment compensation was incomplete.', {
      projectId,
      rollbackFailures,
    });
  }
}

async function activateOperationalV2FirstMilestone(projectId: string, picId: string) {
  const { data: firstMilestone, error: firstMilestoneError } = await supabaseAdmin
    .from('project_milestones')
    .select('id,status,pic_id,updated_at')
    .eq('project_id', projectId)
    .eq('step_order', 1)
    .single();

  if (firstMilestoneError || !firstMilestone) {
    throw new Error('Operational V2 first milestone not found.');
  }

  if (firstMilestone.status !== 'CREATED') {
    return { milestone: firstMilestone, started: false };
  }

  const updatedAt = new Date().toISOString();
  const { data: startedMilestone, error: startError } = await supabaseAdmin
    .from('project_milestones')
    .update({ status: 'IN_PROGRESS', pic_id: picId, updated_at: updatedAt })
    .eq('id', firstMilestone.id)
    .eq('status', 'CREATED')
    .select('id,status,pic_id,updated_at')
    .maybeSingle();

  if (startError) throw new Error('Failed to start the first Operational V2 milestone.');
  if (startedMilestone) return { milestone: startedMilestone, started: true };

  const { data: currentMilestone, error: currentMilestoneError } = await supabaseAdmin
    .from('project_milestones')
    .select('id,status,pic_id,updated_at')
    .eq('id', firstMilestone.id)
    .single();

  if (
    currentMilestoneError ||
    !currentMilestone ||
    currentMilestone.status === 'CREATED' ||
    currentMilestone.pic_id !== picId
  ) {
    throw new Error('Failed to start the first Operational V2 milestone.');
  }

  return { milestone: currentMilestone, started: false };
}

async function applyOperationalV2Assignment(
  project: { id: string; pic_id: string | null },
  historyId: string,
  picId: string,
  relevantStageIds: string[]
) {
  let milestones: MilestonePicSnapshot[] = [];

  try {
    if (relevantStageIds.length) {
      const { data, error: snapshotError } = await supabaseAdmin
        .from('project_milestones')
        .select('id,pic_id')
        .eq('project_id', project.id)
        .in('workflow_stage_id', relevantStageIds)
        .not('status', 'in', `(${lockedHistoricalStatuses.join(',')})`);
      if (snapshotError) throw new Error('Failed to prepare Operational V2 PIC assignment.');
      milestones = (data || []) as MilestonePicSnapshot[];

      const { error: milestoneError } = await supabaseAdmin
        .from('project_milestones')
        .update({ pic_id: picId })
        .eq('project_id', project.id)
        .in('workflow_stage_id', relevantStageIds)
        .not('status', 'in', `(${lockedHistoricalStatuses.join(',')})`);
      if (milestoneError) throw new Error('Failed to apply Operational V2 PIC assignment.');
    }

    const firstMilestone = await activateOperationalV2FirstMilestone(project.id, picId);
    return {
      completed: false,
      progression: null,
      first_milestone: firstMilestone.milestone,
      started: firstMilestone.started,
    };
  } catch (error) {
    await rollbackOperationalV2Assignment(project.id, picId, project.pic_id, historyId, milestones);
    throw error;
  }
}

export class AssignmentPhase5Service {
  static async availablePics(actor: Actor) {
    let query = supabaseAdmin.from('users').select(userFields).eq('is_active', true);
    query = actor.role === 'HEAD_SA'
      ? query.or(`role.eq.SA,and(role.eq.HEAD_SA,id.eq.${actor.userId})`)
      : query.eq('role', 'SA');
    const { data, error } = await query.order('full_name');
    if (error) throw new Error(error.message);
    return data || [];
  }

  static async assign(projectId: string, picId: string, reason: string | undefined, actor: Actor) {
    assertPicAssignmentActor(actor);
    const { data: project, error: projectError } = await supabaseAdmin.from('projects').select(`id,name,pic_id,scenario_id,status,is_postponed,pic:users!projects_pic_id_fkey(${userFields})`).eq('id', projectId).single();
    if (projectError || !project) throw new Error('Project not found');
    assertPicAssignmentProjectState(project);
    const workflowMode = await getAssignmentWorkflowMode(project);
    if (workflowMode === 'OPERATIONAL_V2') await assertOperationalV2ProjectPlanApproved(project.id);
    const { data: pic, error: picError } = await supabaseAdmin.from('users').select(`${userFields}, is_active`).eq('id', picId).single();
    const selectedPic = picError ? null : pic;
    assertAssignablePic(selectedPic, actor);
    assertPicAssignmentChange(project, picId, reason);
    const type = project.pic_id ? 'REASSIGNMENT' : 'INITIAL_ASSIGNMENT';
    if (workflowMode === 'OPERATIONAL_V2') {
      let projectUpdate = supabaseAdmin.from('projects').update({ pic_id: picId }).eq('id', projectId);
      projectUpdate = project.pic_id === null
        ? projectUpdate.is('pic_id', null)
        : projectUpdate.eq('pic_id', project.pic_id);
      const { data: updatedProject, error: updateError } = await projectUpdate.select('id').maybeSingle();
      if (updateError) throw new Error('Failed to update project PIC assignment.');
      if (!updatedProject) throw new Error('Project PIC assignment is no longer current.');
    } else {
      const { error: updateError } = await supabaseAdmin.from('projects').update({ pic_id: picId }).eq('id', projectId);
      if (updateError) throw new Error(updateError.message);
    }
    const { data: history, error: historyError } = await supabaseAdmin.from('project_assignments').insert({ project_id: projectId, pic_id: picId, assigned_by: actor.userId, previous_pic_id: project.pic_id, assignment_type: type, reason: reason || null }).select(assignmentSelect).single();
    if (historyError) {
      if (workflowMode === 'OPERATIONAL_V2') await rollbackOperationalV2Assignment(projectId, picId, project.pic_id, null, []);
      else await supabaseAdmin.from('projects').update({ pic_id: project.pic_id }).eq('id', projectId);
      throw new Error(workflowMode === 'OPERATIONAL_V2' ? 'Failed to record PIC assignment.' : historyError.message);
    }
    const { data: stages, error: stagesError } = await supabaseAdmin.from('workflow_stages').select('id,default_role').eq('scenario_id', project.scenario_id).eq('is_active', true);
    if (stagesError) {
      if (workflowMode === 'OPERATIONAL_V2') await rollbackOperationalV2Assignment(projectId, picId, project.pic_id, history.id, []);
      else {
        await supabaseAdmin.from('projects').update({ pic_id: project.pic_id }).eq('id', projectId);
        await supabaseAdmin.from('project_assignments').delete().eq('id', history.id);
      }
      throw new Error(workflowMode === 'OPERATIONAL_V2' ? 'Failed to load project workflow stages.' : stagesError.message);
    }
    const relevantStageIds = (stages || []).filter((stage) => stage.default_role === 'SA' || (stage.default_role === 'HEAD_SA' && selectedPic.role === 'HEAD_SA')).map((stage) => stage.id);
    if (workflowMode === 'OPERATIONAL_V2') {
      const workflow = await applyOperationalV2Assignment(project, history.id, picId, relevantStageIds);
      const action = type === 'REASSIGNMENT' ? 'PIC_REASSIGNED' : 'PIC_ASSIGNED';
      const previousPic = Array.isArray(project.pic) ? project.pic[0] : project.pic;
      const details = type === 'REASSIGNMENT'
        ? `${actor.fullName} reassigned project '${project.name}' from ${previousPic?.full_name || 'Unassigned'} to ${selectedPic.full_name}${reason ? `. Reason: ${reason}` : ''}`
        : `${actor.fullName} assigned ${selectedPic.full_name} as Solution Architect PIC for '${project.name}'`;
      await logAssignment(actor, projectId, action, details);
      await notifyPicAssignment({
        projectId: project.id,
        projectName: project.name,
        previousPicId: history.previous_pic_id,
        currentPicId: history.pic_id,
      });
      return { ...mapAssignment(history), workflow };
    }
    if (relevantStageIds.length) {
      const { error: milestoneError } = await supabaseAdmin.from('project_milestones').update({ pic_id: picId }).eq('project_id', projectId).in('workflow_stage_id', relevantStageIds).not('status', 'in', `(${lockedHistoricalStatuses.join(',')})`);
      if (milestoneError) { await supabaseAdmin.from('projects').update({ pic_id: project.pic_id }).eq('id', projectId); await supabaseAdmin.from('project_assignments').delete().eq('id', history.id); throw new Error(milestoneError.message); }
    }
    const action = type === 'REASSIGNMENT' ? 'PIC_REASSIGNED' : 'PIC_ASSIGNED';
    const previousPic = Array.isArray(project.pic) ? project.pic[0] : project.pic;
    const details = type === 'REASSIGNMENT'
      ? `${actor.fullName} reassigned project '${project.name}' from ${previousPic?.full_name || 'Unassigned'} to ${selectedPic.full_name}${reason ? `. Reason: ${reason}` : ''}`
      : `${actor.fullName} assigned ${selectedPic.full_name} as Solution Architect PIC for '${project.name}'`;
    await logAssignment(actor, projectId, action, details);
    const workflow = await completeAssignPicStageIfCurrent(projectId, actor);
    await notifyPicAssignment({
      projectId: project.id,
      projectName: project.name,
      previousPicId: history.previous_pic_id,
      currentPicId: history.pic_id,
    });
    return { ...mapAssignment(history), workflow };
  }

  static async history(projectId: string, actor: Actor) {
    const { data: project, error: projectError } = await supabaseAdmin.from('projects').select('id,sales_id,pic_id').eq('id', projectId).single();
    if (projectError || !project || (actor.role === 'SALES' && project.sales_id !== actor.userId) || (actor.role === 'SA' && project.pic_id !== actor.userId)) throw new Error('Project not found');
    const { data, error } = await supabaseAdmin.from('project_assignments').select(assignmentSelect).eq('project_id', projectId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(mapAssignment);
  }

  static async assignedProjects(actor: Actor) {
    if (!['SA', 'HEAD_SA'].includes(actor.role)) throw new Error('Forbidden');
    const { data, error } = await supabaseAdmin.from('projects').select('id,name,customer,status,scenario:scenarios!projects_scenario_id_fkey(id,name),pic:users!projects_pic_id_fkey(id,full_name,email,role)').eq('pic_id', actor.userId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }

  static async assignedMilestones(actor: Actor) {
    if (!['SA', 'HEAD_SA'].includes(actor.role)) throw new Error('Forbidden');
    const { data, error } = await supabaseAdmin.from('project_milestones').select('id,project_id,name,step_order,status,pic_id,project:projects!project_milestones_project_id_fkey(id,name,customer)').eq('pic_id', actor.userId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }
}
