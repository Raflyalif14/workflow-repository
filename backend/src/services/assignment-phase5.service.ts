import { supabaseAdmin } from '../config/supabase';
import { completeAssignPicStageIfCurrent } from './workflow-progression.service';

type Actor = { userId: string; role: string; fullName: string };
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

export class AssignmentPhase5Service {
  static async availablePics() {
    const { data, error } = await supabaseAdmin.from('users').select(userFields).eq('role', 'SA').eq('is_active', true).order('full_name');
    if (error) throw new Error(error.message);
    return data || [];
  }

  static async assign(projectId: string, picId: string, reason: string | undefined, actor: Actor) {
    if (actor.role !== 'HEAD_SA') throw new Error('Forbidden');
    const { data: project, error: projectError } = await supabaseAdmin.from('projects').select(`id,name,pic_id,scenario_id,status,is_postponed,pic:users!projects_pic_id_fkey(${userFields})`).eq('id', projectId).single();
    if (projectError || !project) throw new Error('Project not found');
    if (project.status === 'POSTPONED' || project.is_postponed) throw new Error('Project is postponed.');
    const { data: pic, error: picError } = await supabaseAdmin.from('users').select(`${userFields}, is_active`).eq('id', picId).single();
    if (picError || !pic) throw new Error('PIC not found');
    if (!pic.is_active) throw new Error('Selected user is inactive.');
    if (pic.role !== 'SA') throw new Error('Selected user cannot be assigned as Solution Architect.');
    if (project.pic_id === picId) throw new Error('Project is already assigned to this PIC.');
    if (project.pic_id && !reason?.trim()) throw new Error('Reassignment reason is required.');
    const type = project.pic_id ? 'REASSIGNMENT' : 'INITIAL_ASSIGNMENT';
    const { error: updateError } = await supabaseAdmin.from('projects').update({ pic_id: picId }).eq('id', projectId);
    if (updateError) throw new Error(updateError.message);
    const { data: history, error: historyError } = await supabaseAdmin.from('project_assignments').insert({ project_id: projectId, pic_id: picId, assigned_by: actor.userId, previous_pic_id: project.pic_id, assignment_type: type, reason: reason || null }).select(assignmentSelect).single();
    if (historyError) { await supabaseAdmin.from('projects').update({ pic_id: project.pic_id }).eq('id', projectId); throw new Error(historyError.message); }
    const { data: stages, error: stagesError } = await supabaseAdmin.from('workflow_stages').select('id,default_role').eq('scenario_id', project.scenario_id).eq('is_active', true);
    if (stagesError) { await supabaseAdmin.from('projects').update({ pic_id: project.pic_id }).eq('id', projectId); await supabaseAdmin.from('project_assignments').delete().eq('id', history.id); throw new Error(stagesError.message); }
    const relevantStageIds = (stages || []).filter((stage) => stage.default_role === 'SA' || (stage.default_role === 'HEAD_SA' && pic.role === 'HEAD_SA')).map((stage) => stage.id);
    if (relevantStageIds.length) {
      const { error: milestoneError } = await supabaseAdmin.from('project_milestones').update({ pic_id: picId }).eq('project_id', projectId).in('workflow_stage_id', relevantStageIds).not('status', 'in', `(${lockedHistoricalStatuses.join(',')})`);
      if (milestoneError) { await supabaseAdmin.from('projects').update({ pic_id: project.pic_id }).eq('id', projectId); await supabaseAdmin.from('project_assignments').delete().eq('id', history.id); throw new Error(milestoneError.message); }
    }
    const action = type === 'REASSIGNMENT' ? 'PIC_REASSIGNED' : 'PIC_ASSIGNED';
    const previousPic = Array.isArray(project.pic) ? project.pic[0] : project.pic;
    const details = type === 'REASSIGNMENT'
      ? `${actor.fullName} reassigned project '${project.name}' from ${previousPic?.full_name || 'Unassigned'} to ${pic.full_name}${reason ? `. Reason: ${reason}` : ''}`
      : `${actor.fullName} assigned ${pic.full_name} as Solution Architect PIC for '${project.name}'`;
    await logAssignment(actor, projectId, action, details);
    const workflow = await completeAssignPicStageIfCurrent(projectId, actor);
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
