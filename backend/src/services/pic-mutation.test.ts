import assert from 'node:assert/strict';
import { supabaseAdmin } from '../config/supabase';
import { PicMutationError, runPicMutation } from './pic-mutation.service';

async function main() {
  const original = supabaseAdmin.rpc, errorLog = console.error;
  const logs: unknown[][] = [];
  console.error = (...items: unknown[]) => { logs.push(items); };
  const request = { p_request_id: '00000000-0000-4000-8000-000000000030', p_note: 'PRIVATE_NOTE', p_pic_id: 'PRIVATE_PIC' };
  const fails = (status: number, code: string) => assert.rejects(
    () => runPicMutation('review_project_plan_pic_atomic', request),
    (error: unknown) => error instanceof PicMutationError && error.statusCode === status && error.code === code);
  try {
    for (const code of ['23514', '42702', 'PGRST202']) {
      (supabaseAdmin as any).rpc = async () => ({ data: null, error: { code, message: 'PRIVATE_DATABASE_MESSAGE', details: 'PRIVATE_DETAILS', hint: 'PRIVATE_HINT' } });
      await fails(503, 'PIC_UNAVAILABLE');
      assert.equal((logs.at(-1)?.[1] as any).databaseCode, code);
      assert.equal((logs.at(-1)?.[1] as any).requestId, request.p_request_id);
    }
    for (const [databaseCode, status, code] of [['42501', 403, 'PIC_FORBIDDEN'], ['22023', 422, 'PIC_INVALID'], ['40001', 409, 'PIC_CONFLICT'], ['55000', 409, 'PIC_NOT_EDITABLE']] as const) {
      (supabaseAdmin as any).rpc = async () => ({ data: null, error: { code: databaseCode } });
      await fails(status, code);
    }
    (supabaseAdmin as any).rpc = async () => { throw new Error('PRIVATE_NETWORK_URL'); };
    await fails(503, 'PIC_UNAVAILABLE');
    assert.equal((logs.at(-1)?.[1] as any).category, 'TRANSPORT');
    (supabaseAdmin as any).rpc = async () => ({ data: [], error: null });
    await fails(503, 'PIC_UNAVAILABLE');
    assert.equal((logs.at(-1)?.[1] as any).category, 'EMPTY_RESPONSE');
    (supabaseAdmin as any).rpc = async () => ({ data: { replayed: true }, error: null });
    assert.deepEqual(await runPicMutation('review_project_plan_pic_atomic', request), { replayed: true });
    (supabaseAdmin as any).rpc = async () => ({ data: null, error: { code: 'PRIVATE_CODE\n', message: 'PRIVATE_MESSAGE' } });
    await assert.rejects(() => runPicMutation('PRIVATE_OPERATION', { p_request_id: 'PRIVATE_ID' }));
    assert.deepEqual(logs.at(-1)?.[1], { operation: 'pic_mutation', requestId: null, category: 'DATABASE_OR_API', databaseCode: null });
    assert(!JSON.stringify(logs).includes('PRIVATE'), 'Logs contain only allowlisted diagnostics');
    assert.equal(request.p_request_id, '00000000-0000-4000-8000-000000000030', 'Diagnostics never change the replay identity');
  } finally { (supabaseAdmin as any).rpc = original; console.error = errorLog; }
  console.log('PIC RPC safe SQLSTATE/API/transport diagnostics and existing HTTP error mapping: PASS');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
