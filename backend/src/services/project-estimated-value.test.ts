import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { once } from 'node:events';
import { supabaseAdmin } from '../config/supabase';
import { authenticateJwt, requireRoles } from '../middlewares/auth.middleware';
import { ProjectEstimatedValueController } from '../controllers/project-estimated-value.controller';
import { EstimatedValueError, ProjectEstimatedValueService } from './project-estimated-value.service';
import { estimatedValueSchema, updateProjectManagementSchema } from '../validators/project-management.validator';

const actor = { userId: 'sales', role: 'SALES' };
const version = '2026-10-06T01:00:00.000Z';
const input = { estimated_revenue: '250.50', expected_updated_at: version, request_id: '00000000-0000-4000-8000-000000000001' };
const nextRequest = { ...input, estimated_revenue: '350.50', request_id: '00000000-0000-4000-8000-000000000002' };
const fail = (code: string) => ({ data: null, error: { code, message: 'private provider detail' } });

async function main() {
  const original = { from: supabaseAdmin.from, rpc: supabaseAdmin.rpc, getUser: supabaseAdmin.auth.getUser };
  let profile: any = { id: 'sales', role: 'SALES', is_active: true, full_name: 'Sales', email: 'mock@example.invalid', must_change_password: false };
  let project = { id: 'p', sales_id: 'sales', status: 'ACTIVE', is_postponed: false, estimated_revenue: '100.00', updated_at: version };
  let reads = 0, calls = 0, auditFailure = false, responseLoss = false;
  const audits = new Map<string, any>();
  let queue = Promise.resolve();
  let gate: Promise<void> | undefined;
  let started: (() => void) | undefined;
  (supabaseAdmin.auth as any).getUser = async () => ({ data: { user: { id: profile.id } }, error: null });
  (supabaseAdmin as any).from = (table: string) => {
    assert(['projects', 'users'].includes(table), 'No service-side value or audit writes');
    if (table === 'projects') reads++;
    const q: any = { select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: { ...project }, error: null }),
      single: async () => ({ data: { ...profile }, error: null }) };
    return q;
  };
  // Transactional model for the RPC contract; migration structure is checked
  // below. This does not assert that SQL was executed against PostgreSQL.
  (supabaseAdmin as any).rpc = (name: string, params: any) => {
    assert.equal(name, 'update_project_estimated_value'); calls++;
    const work = queue.then(async () => {
      started?.(); await gate;
      if (profile.role !== 'SALES' || !profile.is_active || params.p_actor_id !== project.sales_id) return fail('42501');
      if (!['DRAFT', 'ACTIVE'].includes(project.status) || project.is_postponed) return fail('55000');
      const before = project.estimated_revenue;
      const value = Number(params.p_value).toFixed(2);
      const existing = audits.get(params.p_request_id);
      if (existing) {
        if (existing.actor !== params.p_actor_id || existing.after !== value || existing.expected !== params.p_expected_updated_at) return fail('40001');
        return { data: [{ estimated_revenue: existing.after, updated_at: existing.saved, changed: true, replayed: true }], error: null };
      }
      if (params.p_expected_updated_at !== project.updated_at) return fail('40001');
      if (before === value) return { data: [{ estimated_revenue: value, updated_at: project.updated_at, changed: false, replayed: false }], error: null };
      if (auditFailure) return fail('23514');
      const saved = `2026-10-06T01:00:0${audits.size + 1}.000Z`;
      project = { ...project, estimated_revenue: value, updated_at: saved };
      audits.set(params.p_request_id, { before, after: value, actor: params.p_actor_id, expected: params.p_expected_updated_at, saved });
      if (responseLoss) return fail('08006');
      return { data: [{ estimated_revenue: value, updated_at: saved, changed: true, replayed: false }], error: null };
    });
    queue = work.then(() => undefined); return work;
  };
  const expectError = (action: () => Promise<unknown>, code: string) => assert.rejects(action,
    (error: unknown) => error instanceof EstimatedValueError && error.code === code);
  const reset = () => { project = { ...project, status: 'ACTIVE', is_postponed: false, estimated_revenue: '100.00', updated_at: version }; audits.clear(); calls = 0; };
  try {
    for (const role of ['SA', 'HEAD_SA', 'SUPER_ADMIN', 'UNKNOWN']) {
      await expectError(() => ProjectEstimatedValueService.update('p', input, { ...actor, role }), 'ESTIMATE_FORBIDDEN');
    }
    assert.equal(reads, 0); assert.equal(calls, 0);
    await expectError(() => ProjectEstimatedValueService.update('p', input, { ...actor, userId: 'other' }), 'ESTIMATE_FORBIDDEN');
    for (const status of ['COMPLETED', 'WON', 'LOST', 'POSTPONED', 'WAITING_RESULT', 'CANCELLED', 'ON_HOLD']) {
      project.status = status; await expectError(() => ProjectEstimatedValueService.update('p', input, actor), 'ESTIMATE_NOT_EDITABLE');
    }
    project.status = 'ACTIVE'; project.is_postponed = true;
    await expectError(() => ProjectEstimatedValueService.update('p', input, actor), 'ESTIMATE_NOT_EDITABLE');
    assert.equal(calls, 0); reset();
    for (const value of ['', ' ', '-1', 'NaN', 'Infinity', '1e3', '1,000', '0.001', '10000000000000000', 1, null]) {
      assert(!estimatedValueSchema.safeParse({ ...input, estimated_revenue: value }).success);
      await expectError(() => ProjectEstimatedValueService.update('p', { ...input, estimated_revenue: value } as any, actor), 'ESTIMATE_INVALID');
    }
    for (const value of ['0', '0.01', '9999999999999999.99']) assert(estimatedValueSchema.safeParse({ ...input, estimated_revenue: value }).success);
    for (const extra of [{ p_actor_id: 'fake' }, { before: '999' }, { final_contract_value: 1 }]) assert(!estimatedValueSchema.safeParse({ ...input, ...extra }).success);
    assert(!updateProjectManagementSchema.safeParse({ estimated_revenue: 1 }).success, 'Generic PATCH cannot bypass audited endpoint');
    assert(updateProjectManagementSchema.safeParse({ name: 'Kept' }).success);
    assert.equal(calls, 0);
    const transactionRpc = supabaseAdmin.rpc;
    (supabaseAdmin as any).rpc = async (_name: string, params: any) => {
      assert.equal(params.p_value, '9999999999999999.99', 'Service never coerces exact decimals through Number');
      return { data: [{ estimated_revenue: params.p_value, updated_at: version, changed: true, replayed: false }], error: null };
    };
    await ProjectEstimatedValueService.update('p', { ...input, estimated_revenue: '9999999999999999.99' }, actor);
    (supabaseAdmin as any).rpc = transactionRpc;
    auditFailure = true;
    await expectError(() => ProjectEstimatedValueService.update('p', input, actor), 'ESTIMATE_UNAVAILABLE');
    assert.equal(project.estimated_revenue, '100.00'); assert.equal(project.updated_at, version); assert.equal(audits.size, 0);
    auditFailure = false; project.status = 'DRAFT'; responseLoss = true;
    await expectError(() => ProjectEstimatedValueService.update('p', input, actor), 'ESTIMATE_UNAVAILABLE');
    responseLoss = false;
    const replay = await ProjectEstimatedValueService.update('p', input, actor);
    assert.equal(replay.replayed, true); assert.equal(audits.size, 1);
    assert.deepEqual([...audits.values()][0], { before: '100.00', after: '250.50', actor: 'sales', expected: version, saved: project.updated_at });
    await expectError(() => ProjectEstimatedValueService.update('p', { ...input, estimated_revenue: '999' }, actor), 'ESTIMATE_STALE');
    const noop = await ProjectEstimatedValueService.update('p', { ...nextRequest, estimated_revenue: '250.50', expected_updated_at: project.updated_at }, actor);
    assert.equal(noop.changed, false); assert.equal(audits.size, 1);
    reset();
    let release!: () => void;
    const barrierStarted = new Promise<void>(resolve => { started = resolve; });
    gate = new Promise<void>(resolve => { release = resolve; });
    const first = ProjectEstimatedValueService.update('p', input, actor); await barrierStarted;
    const second = ProjectEstimatedValueService.update('p', nextRequest, actor); release();
    const competing = await Promise.allSettled([first, second]);
    assert.equal(competing[0].status, 'fulfilled'); assert.equal(competing[1].status, 'rejected');
    assert.equal((competing[1] as PromiseRejectedResult).reason.code, 'ESTIMATE_STALE');
    assert.equal(project.estimated_revenue, '250.50'); assert.equal(audits.size, 1);
    gate = undefined; started = undefined; reset();
    const double = await Promise.all([ProjectEstimatedValueService.update('p', input, actor), ProjectEstimatedValueService.update('p', input, actor)]);
    assert.equal(audits.size, 1); assert(double.some(receipt => receipt.replayed));
    reset();
    const app = express(); app.use(express.json());
    app.patch('/projects/:projectId/estimated-value', authenticateJwt, requireRoles(['SALES']), ProjectEstimatedValueController.update);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert(address && typeof address !== 'string');
    const request = (body = input) => fetch(`http://127.0.0.1:${address.port}/projects/p/estimated-value`, {
      method: 'PATCH', headers: { authorization: 'Bearer local-mock', 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    try {
      for (const role of ['SA', 'HEAD_SA', 'SUPER_ADMIN']) { profile.role = role; assert.equal((await request()).status, 403); }
      profile.role = 'SALES'; profile.is_active = false; assert.equal((await request()).status, 401); assert.equal(calls, 0);
      profile.is_active = true; profile.id = 'other'; assert.equal((await request()).status, 403); assert.equal(calls, 0);
      profile.id = 'sales'; assert.equal((await request()).status, 200); assert.equal(audits.size, 1);
      reset(); auditFailure = true;
      const failed = await request(); assert.equal(failed.status, 503);
      assert(!(await failed.text()).includes('private provider detail')); assert.equal(audits.size, 0);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    const sql = fs.readFileSync(path.join(__dirname, '../../supabase/phase26-estimated-value-audit.sql'), 'utf8');
    const body = sql.slice(sql.indexOf('create function'));
    const positions = ['for update;', 'for share;', "v_p.status not in ('DRAFT','ACTIVE')", 'select * into v_a', 'v_p.updated_at is distinct', 'v_p.estimated_revenue is not distinct', 'update public.projects set', 'insert into public.activity_logs'].map(text => body.indexOf(text));
    assert(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])), 'Lock, active actor, eligibility, replay, CAS, no-op must precede writes');
    assert(!body.includes('exception when'), 'Audit failure must propagate and roll back the RPC');
    assert(body.includes("'before',v_p.estimated_revenue::text,'after',v_value::text"));
    assert(body.includes('clock_timestamp()')); assert(body.includes("'object_type','PROJECT','object_id',p_project_id"));
    assert(sql.includes('create unique index activity_estimated_value_request')); assert(body.includes('from public,anon,authenticated'));
    assert(!body.includes('final_contract_value =')); assert(!body.includes('delete from')); assert(!body.includes('notification'));
    console.log('Estimated value: local HTTP active owner policy, strict values, safe errors, transaction model rollback/CAS/replay/concurrency/no-op and SQL guard order passed (no live SQL).');
  } finally {
    (supabaseAdmin as any).from = original.from; (supabaseAdmin as any).rpc = original.rpc; (supabaseAdmin.auth as any).getUser = original.getUser;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
