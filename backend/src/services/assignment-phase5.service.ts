import { supabaseAdmin } from '../config/supabase';
import { assignPicSchema } from '../validators/assignment-phase5.validator';
import { PicMutationError, PicRequestContext, runPicMutation } from './pic-mutation.service';

type Actor = { userId: string; role: string; fullName: string };
type AssignmentProjectState = { pic_id: string | null; status: string; is_postponed: boolean | null };
type AssignmentPicState = { id: string; role: string; is_active: boolean };
const userFields = 'id, full_name, email, role';
const assignmentSelect = `id, phase_id, project_id, pic_id, assigned_by, previous_pic_id, assignment_type, reason, created_at, pic:users!project_assignments_pic_id_fkey(${userFields}), assigned_by_user:users!project_assignments_assigned_by_fkey(${userFields}), previous_pic:users!project_assignments_previous_pic_id_fkey(${userFields})`;

const mapAssignment = (row: any) => ({
  id: row.id,
  phase_id: row.phase_id || null,
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

export function assertPicAssignmentActor(actor: Actor): void {
  if (actor.role !== 'HEAD_SA') throw new PicMutationError(403, 'PIC_FORBIDDEN');
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

  static async assign(projectId: string, picId: string, reason: string | undefined, actor: Actor, context?: PicRequestContext) {
    assertPicAssignmentActor(actor);
    const input = assignPicSchema.safeParse({ pic_id: picId, reason, ...context });
    if (!input.success) throw new PicMutationError(422, 'PIC_INVALID');
    return runPicMutation('assign_project_pic_atomic', {
      p_project_id: projectId, p_actor_id: actor.userId, p_pic_id: input.data.pic_id,
      p_reason: input.data.reason || null, p_expected_revision: input.data.expected_pic_revision,
      p_request_id: input.data.request_id,
    });
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
    const { data, error } = await supabaseAdmin.from('project_milestones').select('id,project_id,name,step_order,status,pic_id,start_date,due_date,project:projects!project_milestones_project_id_fkey(id,name,customer,status,is_postponed),outputs:project_output_documents!project_output_documents_milestone_id_fkey(status,is_required,is_selected)').eq('pic_id', actor.userId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }
}
