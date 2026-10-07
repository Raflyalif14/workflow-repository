import { randomUUID } from 'crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { DeadlineError } from '../utils/deadline-error.util';

export type BusinessRequestContext = { requestId?: string; expectedUpdatedAt?: string };
export class BusinessAuditError extends DeadlineError {}
export function businessRequestContext(headers: Record<string, unknown>): BusinessRequestContext {
  const requestId = headers['x-business-request-id'];
  const expectedUpdatedAt = headers['x-business-expected-updated-at'];
  const parsed = z.object({ requestId: z.string().uuid().optional(),
    expectedUpdatedAt: z.string().datetime({ offset: true }).optional() }).safeParse({ requestId, expectedUpdatedAt });
  if (!parsed.success) throw new BusinessAuditError('Invalid business request.', 422);
  return parsed.data;
}
export async function mutateBusiness(projectId: string, actorId: string, action: string,
  payload: Record<string, unknown>, context: BusinessRequestContext = {}) {
  // Legacy consumers get a server-read CAS; current UI supplies its reviewed timestamp and stable retry ID.
  let expected = context.expectedUpdatedAt;
  if (!expected && context.requestId) {
    const { data, error } = await supabaseAdmin.from('project_business_requests').select('expected_updated_at')
      .eq('project_id', projectId).eq('request_id', context.requestId).eq('actor_id', actorId).maybeSingle();
    if (error) throw new BusinessAuditError('Unable to save changes.', 503);
    expected = data?.expected_updated_at;
  }
  if (!expected) {
    const { data, error } = await supabaseAdmin.from('projects').select('updated_at').eq('id', projectId).single();
    if (error || !data?.updated_at) throw new BusinessAuditError('Unable to save changes.', 503);
    expected = data.updated_at;
  }
  const { data, error } = await supabaseAdmin.rpc('mutate_project_business', {
    p_project_id: projectId, p_actor_id: actorId, p_action: action, p_payload: payload,
    p_expected_updated_at: expected, p_request_id: context.requestId || randomUUID(),
  });
  if (error) {
    const status: Record<string, number> = { '42501': 403, '40001': 409, '55000': 409, '22023': 422 };
    throw new BusinessAuditError(error.code === '40001' ? 'Business data changed. Refresh and review the changes.' : 'Unable to save changes.', status[error.code] || 503);
  }
  if (data == null) throw new BusinessAuditError('Unable to confirm changes. Retry the same request.', 503);
  const result = data.value;
  if (result == null) throw new BusinessAuditError('Unable to confirm changes. Retry the same request.', 503);
  Object.defineProperty(result, '_businessReplayed', { value: data.replayed === true });
  return result;
}
