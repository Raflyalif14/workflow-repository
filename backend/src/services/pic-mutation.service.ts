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
export async function runPicMutation(name: string, params: Record<string, unknown>) {
  // All writes and durable intents are inside RPC. No external delivery here.
  let response;
  try { response = await supabaseAdmin.rpc(name, params); }
  catch { throw new PicMutationError(503, 'PIC_UNAVAILABLE'); }
  const { data, error } = response;
  if (error) {
    const errors: Record<string, [number, string]> = {
      '42501': [403, 'PIC_FORBIDDEN'], '22023': [422, 'PIC_INVALID'],
      '40001': [409, 'PIC_CONFLICT'], '55000': [409, 'PIC_NOT_EDITABLE'],
    };
    const [status, code] = errors[error.code] || [503, 'PIC_UNAVAILABLE'];
    throw new PicMutationError(status, code);
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new PicMutationError(503, 'PIC_UNAVAILABLE');
  return result;
}
