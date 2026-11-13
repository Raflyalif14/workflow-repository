import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { canAccessProject, ProjectAccessActor } from './project-access.service';
import { DeadlineService } from './deadline.service';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value;
});
export const scopeRequestSchema = z.object({
  request_id: z.string().uuid(), expected_updated_at: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(2000), selected_keys: z.array(z.string().min(1).max(100)).max(100),
  additions: z.array(z.object({ key: z.string().min(1).max(100), start_date: day,
    duration_working_days: z.number().int().min(1).max(1000) }).strict()).max(100),
}).strict().refine(value => new Set(value.selected_keys).size === value.selected_keys.length
  && new Set(value.additions.map(item => item.key)).size === value.additions.length);
export const scopeReviewSchema = z.object({ request_id: z.string().uuid(),
  decision: z.enum(['APPROVED','REJECTED','CANCELLED']), note: z.string().trim().max(2000).optional(),
}).strict().refine(value => value.decision !== 'REJECTED' || !!value.note);
export class ScopeChangeError extends Error {
  constructor(readonly statusCode: number, readonly code: string) { super(code); }
}
const fields = 'id,project_id,phase_id,requested_by,requested_at,reason,before_keys,proposal,status,reviewed_at,review_note';

export class ProjectScopeChangeService {
  static async list(projectId: string, actor: ProjectAccessActor) {
    const result = await supabaseAdmin.from('projects').select('sales_id,pic_id').eq('id',projectId).maybeSingle();
    if (result.error) throw new ScopeChangeError(503,'SCOPE_UNAVAILABLE');
    if (!result.data || !canAccessProject(result.data,actor)) throw new ScopeChangeError(403,'SCOPE_FORBIDDEN');
    const { data,error } = await supabaseAdmin.from('project_scope_changes').select(fields)
      .eq('project_id',projectId).order('requested_at',{ascending:false}).limit(100);
    if (error) throw new ScopeChangeError(503,'SCOPE_UNAVAILABLE');
    return data || [];
  }
  static async mutate(projectId: string, changeId: string | undefined, body: unknown, actor: ProjectAccessActor) {
    const parsed = changeId ? scopeReviewSchema.safeParse(body) : scopeRequestSchema.safeParse(body);
    if (!z.string().uuid().safeParse(projectId).success || (changeId && !z.string().uuid().safeParse(changeId).success) || !parsed.success)
      throw new ScopeChangeError(422,'SCOPE_INVALID');
    const input = parsed.data;
    if (!changeId && actor.role !== 'SALES' || changeId && 'decision' in input &&
      (input.decision === 'CANCELLED' ? actor.role !== 'SALES' : actor.role !== 'HEAD_SA'))
      throw new ScopeChangeError(403,'SCOPE_FORBIDDEN');
    let payload: Record<string,unknown>;
    if ('additions' in input) {
      const additions = [];
      for (const item of input.additions) additions.push({ key:item.key,
        ...await DeadlineService.calculateDeadline(item.start_date,item.duration_working_days) });
      payload = { reason:input.reason, selected_keys:[...input.selected_keys].sort(), additions };
    } else payload = { change_id:changeId, note:input.note || '' };
    const {data,error} = await supabaseAdmin.rpc('mutate_approved_project_scope',{
      p_project_id:projectId,p_actor_id:actor.userId,p_action:'decision' in input ? input.decision : 'REQUEST',
      p_payload:payload,p_request_id:input.request_id,
      p_expected_updated_at:'expected_updated_at' in input ? input.expected_updated_at : null,
    });
    if(error){
      const statuses:Record<string,number>={'42501':403,'22023':422,'40001':409,'55000':409,'23505':409};
      const code=error.code==='55000' && /Started|history|Completed/.test(error.message) ? 'SCOPE_PROTECTED'
        : statuses[error.code]===409 ? 'SCOPE_CONFLICT' : statuses[error.code]===403 ? 'SCOPE_FORBIDDEN' : 'SCOPE_UNAVAILABLE';
      throw new ScopeChangeError(statuses[error.code] || 503,code);
    }
    if(!data?.id) throw new ScopeChangeError(503,'SCOPE_UNAVAILABLE');
    // Never return internal snapshots or server-side review receipts to the client.
    const { before_state:_before,after_state:_after,review_request_id:_receipt,...safe }=data;
    return safe;
  }
}
