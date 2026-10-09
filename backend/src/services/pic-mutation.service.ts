import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { picRequestFields } from '../validators/assignment-phase5.validator';
export type PicRequestContext = { expected_pic_revision?: string; request_id?: string };
export class PicMutationError extends Error {
  constructor(readonly statusCode: number, readonly code: string) { super(code); }
}
export function validatePicContext(context?: PicRequestContext) {
  const result = z.object(picRequestFields).strict().safeParse(context);
  if (!result.success) throw new PicMutationError(422, 'PIC_INVALID');
  return result.data;
}
function logPicFailure(name: string, params: Record<string, unknown>, category: string, databaseCode?: string) {
  const requestId = typeof params.p_request_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.p_request_id)
    ? params.p_request_id : null;
  // Never log database message/details/hint, actor/PIC, notes or the RPC payload.
  console.error('[PicMutation] Operation could not be confirmed.', {
    operation: ['assign_project_pic_atomic', 'review_project_plan_pic_atomic'].includes(name) ? name : 'pic_mutation',
    requestId, category,
    databaseCode: databaseCode && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(databaseCode) ? databaseCode : null,
  });
}
export async function runPicMutation(name: string, params: Record<string, unknown>) {
  // All writes and durable intents are inside RPC. No external delivery here.
  let response;
  try { response = await supabaseAdmin.rpc(name, params); }
  catch { logPicFailure(name, params, 'TRANSPORT'); throw new PicMutationError(503, 'PIC_UNAVAILABLE'); }
  const { data, error } = response;
  if (error) {
    const errors: Record<string, [number, string]> = {
      '42501': [403, 'PIC_FORBIDDEN'], '22023': [422, 'PIC_INVALID'],
      '40001': [409, 'PIC_CONFLICT'], '55000': [409, 'PIC_NOT_EDITABLE'],
    };
    const [status, code] = errors[error.code] || [503, 'PIC_UNAVAILABLE'];
    if (code === 'PIC_UNAVAILABLE') logPicFailure(name, params, 'DATABASE_OR_API', error.code);
    throw new PicMutationError(status, code);
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) { logPicFailure(name, params, 'EMPTY_RESPONSE'); throw new PicMutationError(503, 'PIC_UNAVAILABLE'); }
  return result;
}
