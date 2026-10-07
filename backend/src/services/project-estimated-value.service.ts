import { supabaseAdmin } from '../config/supabase';
import { estimatedValueSchema, EstimatedValueInput } from '../validators/project-management.validator';
import { ProjectAccessActor } from './project-access.service';

export class EstimatedValueError extends Error {
  constructor(readonly statusCode: number, readonly code: string) { super(code); }
}
export class ProjectEstimatedValueService {
  static async update(projectId: string, input: EstimatedValueInput, actor: ProjectAccessActor) {
    if (actor.role !== 'SALES') throw new EstimatedValueError(403, 'ESTIMATE_FORBIDDEN');
    const valid = estimatedValueSchema.safeParse(input);
    if (!valid.success) throw new EstimatedValueError(422, 'ESTIMATE_INVALID');
    const { data: project, error } = await supabaseAdmin.from('projects')
      .select('id,sales_id,status,is_postponed').eq('id', projectId).maybeSingle();
    if (error) throw new EstimatedValueError(503, 'ESTIMATE_UNAVAILABLE');
    if (!project || project.sales_id !== actor.userId) throw new EstimatedValueError(403, 'ESTIMATE_FORBIDDEN');
    if (!['DRAFT', 'ACTIVE'].includes(project.status) || project.is_postponed) throw new EstimatedValueError(409, 'ESTIMATE_NOT_EDITABLE');
    // Access/state are rechecked under the RPC lock. Never write value/audit separately.
    const { data, error: rpcError } = await supabaseAdmin.rpc('update_project_estimated_value', {
      p_project_id: projectId, p_actor_id: actor.userId, p_value: valid.data.estimated_revenue,
      p_expected_updated_at: valid.data.expected_updated_at, p_request_id: valid.data.request_id,
    });
    if (rpcError) {
      const mapped: Record<string, [number, string]> = {
        '42501': [403, 'ESTIMATE_FORBIDDEN'], '22023': [422, 'ESTIMATE_INVALID'],
        '40001': [409, 'ESTIMATE_STALE'], '55000': [409, 'ESTIMATE_NOT_EDITABLE'],
      };
      const [status, code] = mapped[rpcError.code] || [503, 'ESTIMATE_UNAVAILABLE'];
      throw new EstimatedValueError(status, code);
    }
    const receipt = Array.isArray(data) ? data[0] : data;
    if (!receipt) throw new EstimatedValueError(503, 'ESTIMATE_UNAVAILABLE');
    return receipt;
  }
}
