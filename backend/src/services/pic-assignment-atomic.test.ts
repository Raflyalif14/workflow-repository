import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AssignmentPhase5Service } from './assignment-phase5.service';
import { ProjectPlanApprovalService } from './project-plan-approval.service';
import { PicMutationError } from './pic-mutation.service';
import { DeadlineService } from './deadline.service';
import * as notices from './pic-assignment-notification.service';
import * as planNotices from './project-plan-notification.service';
import assignmentRoutes from '../routes/assignment-phase5.routes';

const head = { userId: '00000000-0000-4000-8000-000000000010', role: 'HEAD_SA', fullName: 'Head' };
const sa = '00000000-0000-4000-8000-000000000020', sa2 = '00000000-0000-4000-8000-000000000021';
const request = (n: number, revision = '0') => ({ expected_pic_revision: revision, request_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` });
type State = { project: any; milestones: any[]; history: any[]; audits: any[]; intents: any[]; receipts: Map<string, any>; plan: any };
const initial = (phase: string | null = 'pra'): State => ({
  project: { id: 'p', name: 'Project', scenario_id: 'initial', current_scenario_id: 's', active_phase_id: phase,
    phase_migration_state: phase ? 'READY' : 'LEGACY_REVIEW', phase_status: 'ACTIVE', pic_id: null, pic_revision: '0', status: 'ACTIVE', is_postponed: false },
  milestones: [
    { id: 'm', project_id: 'p', phase_id: phase, pic_id: null, status: 'CREATED', role: 'SA', step_order: 1, start_date: '2026-10-06', duration_working_days: 1, due_date: '2026-10-06' },
    { id: 'completed', project_id: 'p', phase_id: phase, pic_id: 'historical', status: 'COMPLETED', role: 'SA', step_order: 2 },
    { id: 'old', project_id: 'p', phase_id: 'old', pic_id: 'previous-phase', status: 'COMPLETED', role: 'SA', step_order: 1 },
    { id: 'sales', project_id: 'p', phase_id: phase, pic_id: 'sales-owner', status: 'CREATED', role: 'SALES', step_order: 3 },
  ], history: [], audits: [], intents: [], receipts: new Map(),
  plan: { id: 'approval', project_id: 'p', phase_id: phase, status: 'APPROVED' },
});
async function main() {
  const original = { from: supabaseAdmin.from, rpc: supabaseAdmin.rpc, getUser: supabaseAdmin.auth.getUser,
    deadline: DeadlineService.calculateDeadline, notice: notices.notifyPicAssignment, planNotice: planNotices.notifyProjectPlanApproved };
  let state = initial(), rpcCalls = 0, failure: string | null = null, lostResponse = false, targetActive = true, actorActive = true;
  let actorRole = 'HEAD_SA', externalCalls = 0;
  let queue = Promise.resolve(), barrier: Promise<void> | undefined, started: (() => void) | undefined;
  const preferences = { inApp: true, telegram: true, linked: true };
  const error = (code: string) => ({ data: null, error: { code, message: 'private diagnostic detail' } });
  (notices as any).notifyPicAssignment = (planNotices as any).notifyProjectPlanApproved = async () => { externalCalls++; throw new Error('Delivery unavailable'); };
  (DeadlineService as any).calculateDeadline = async () => ({ due_date: '2026-10-06' });
  (supabaseAdmin.auth as any).getUser = async () => ({ data: { user: { id: head.userId } }, error: null });
  (supabaseAdmin as any).from = (table: string) => {
    assert(['projects', 'scenarios', 'project_milestones', 'users'].includes(table), 'No separate write path in services');
    const q: any = { select: () => q, eq: () => q, order: () => q,
      single: async () => ({ data: table === 'projects' ? state.project : table === 'scenarios' ? { workflow_model: 'OPERATIONAL_V2', workflow_version: 2 }
        : { id: head.userId, role: actorRole, is_active: actorActive, full_name: 'Head', email: 'mock@example.invalid', must_change_password: false }, error: null }),
      then: (resolve: any) => Promise.resolve({ data: state.milestones, error: null }).then(resolve) };
    return q;
  };
  // Application contract model, not a PostgreSQL execution/concurrency claim.
  (supabaseAdmin as any).rpc = (name: string, args: any) => {
    rpcCalls++;
    const work = queue.then(async () => {
      started?.(); await barrier;
      assert(['assign_project_pic_atomic', 'review_project_plan_pic_atomic'].includes(name));
      if (args.p_actor_id !== head.userId || actorRole !== 'HEAD_SA' || !actorActive) return error('42501');
      const p = state.project, isPlan = name === 'review_project_plan_pic_atomic';
      if (p.is_postponed || (isPlan ? !['DRAFT', 'ACTIVE'].includes(p.status) : p.status !== 'ACTIVE')) return error('55000');
      if (p.active_phase_id && (p.phase_migration_state !== 'READY' || (!isPlan && p.phase_status !== 'ACTIVE'))) return error('55000');
      const payload = JSON.stringify(args), prior = state.receipts.get(args.p_request_id);
      if (prior) {
        if (prior.payload !== payload || prior.phase !== p.active_phase_id) return error('40001');
        return { data: { ...prior.result, current_pic_id: p.pic_id, pic_revision: p.pic_revision, project_status: p.status, replayed: true }, error: null };
      }
      if (p.pic_revision !== String(args.p_expected_revision)) return error('40001');
      if (isPlan && (p.status !== 'DRAFT' || state.plan.id !== args.p_approval_id || state.plan.status !== 'PENDING' || state.plan.phase_id !== p.active_phase_id)) return error('40001');
      const approve = !isPlan || args.p_decision === 'APPROVED';
      if (approve && (!targetActive || ![sa, sa2, head.userId].includes(args.p_pic_id))) return error('22023');
      if (!isPlan && state.plan.status !== 'APPROVED') return error('55000');
      if (isPlan && args.p_decision === 'REJECTED' && !args.p_note?.trim()) return error('22023');
      if (!isPlan && p.pic_id && p.pic_id !== args.p_pic_id && !args.p_reason?.trim()) return error('22023');
      const change = approve && p.pic_id !== args.p_pic_id;
      const before = p.pic_id;
      const stage = structuredClone({ project: p, milestones: state.milestones, history: state.history, audits: state.audits, intents: state.intents, plan: state.plan });
      if (change) {
        stage.project.pic_id = args.p_pic_id; stage.project.pic_revision = String(BigInt(p.pic_revision) + BigInt(1));
        for (const m of stage.milestones) if (m.phase_id === p.active_phase_id && m.role === 'SA' && !['COMPLETED', 'APPROVED'].includes(m.status)) m.pic_id = args.p_pic_id;
        stage.history.push({ actor: head.userId, before, after: args.p_pic_id, phase: p.active_phase_id });
        stage.audits.push({ actor: head.userId, before, after: args.p_pic_id, time: 'database-clock' });
        if (preferences.inApp || preferences.telegram && preferences.linked) stage.intents.push({ type: before ? 'PIC_REASSIGNED' : 'PIC_ASSIGNED', in_app_visible: preferences.inApp, telegram: preferences.telegram && preferences.linked });
      }
      if (isPlan) {
        stage.plan.status = args.p_decision;
        if (approve) { stage.project.status = 'ACTIVE'; stage.project.phase_status = 'ACTIVE'; }
        stage.audits.push({ action: 'PROJECT_PLAN_' + args.p_decision, actor: head.userId });
        if (preferences.inApp || preferences.telegram && preferences.linked) stage.intents.push({ type: 'PROJECT_PLAN_' + args.p_decision, in_app_visible: preferences.inApp, telegram: preferences.telegram && preferences.linked });
      }
      if (failure) return error('23514'); // stage discarded: milestone/history/audit/intent/receipt all unchanged
      const result = { changed: change, current_pic_id: stage.project.pic_id, pic_revision: stage.project.pic_revision,
        project_status: stage.project.status, phase_id: p.active_phase_id, replayed: false, status: stage.plan.status };
      Object.assign(state, stage); state.receipts.set(args.p_request_id, { payload, phase: p.active_phase_id, result });
      if (lostResponse) return error('08006');
      return { data: result, error: null };
    });
    queue = work.then(() => undefined); return work;
  };
  const assign = (target = sa, n = 1, revision = state.project.pic_revision, reason?: string) => AssignmentPhase5Service.assign('p', target, reason, head, request(n, revision));
  const rejected = (task: () => Promise<unknown>, code: string) => assert.rejects(task, (e: unknown) => e instanceof PicMutationError && e.code === code);
  try {
    for (const role of ['SALES', 'SA', 'SUPER_ADMIN']) await rejected(() => AssignmentPhase5Service.assign('p', sa, undefined, { ...head, role }, request(1)), 'PIC_FORBIDDEN');
    assert.equal(rpcCalls, 0);
    actorActive = false; await rejected(() => assign(), 'PIC_FORBIDDEN'); actorActive = true;
    targetActive = false; await rejected(() => assign(), 'PIC_INVALID'); targetActive = true;
    for (const status of ['DRAFT', 'POSTPONED', 'WON', 'LOST', 'COMPLETED', 'WAITING_RESULT']) { state.project.status = status; await rejected(() => assign(), 'PIC_NOT_EDITABLE'); }
    state.project.status = 'ACTIVE'; state.project.is_postponed = true; await rejected(() => assign(), 'PIC_NOT_EDITABLE'); state.project.is_postponed = false;
    state.project.phase_status = 'COMPLETED'; await rejected(() => assign(), 'PIC_NOT_EDITABLE'); state.project.phase_status = 'ACTIVE';
    for (const failedWrite of ['milestone', 'history', 'audit', 'intent', 'receipt']) {
      failure = failedWrite; await rejected(() => assign(), 'PIC_UNAVAILABLE');
      assert.equal(state.project.pic_id, null); assert.equal(state.history.length, 0); assert.equal(state.audits.length, 0); assert.equal(state.intents.length, 0); assert.equal(state.receipts.size, 0);
    }
    failure = null; lostResponse = true; await rejected(() => assign(), 'PIC_UNAVAILABLE'); lostResponse = false;
    assert.equal(state.project.pic_id, sa); assert.equal(state.history.length, 1);
    const replay = await assign(sa, 1, '0'); assert(replay.replayed); assert.equal(state.history.length, 1); assert.equal(state.intents.length, 1);
    await rejected(() => assign(sa2, 1, '0'), 'PIC_CONFLICT');
    assert.equal(state.milestones.find(m => m.id === 'old')!.pic_id, 'previous-phase');
    assert.equal(state.milestones.find(m => m.id === 'completed')!.pic_id, 'historical');
    assert.equal(state.milestones.find(m => m.id === 'sales')!.pic_id, 'sales-owner');
    const noop = await assign(sa, 2); assert.equal(noop.changed, false); assert.equal(state.history.length, 1);
    await assign(sa2, 3, '1', 'New allocation'); await assign(sa, 4, '2', 'Return allocation');
    await rejected(() => assign(sa, 5, '1'), 'PIC_CONFLICT'); assert.equal(state.project.pic_revision, '3', 'A → B → A is a new revision');
    const oldReplay = await assign(sa2, 3, '1', 'New allocation'); assert.equal(oldReplay.current_pic_id, sa); assert.equal(oldReplay.pic_revision, '3'); assert.equal(state.history.length, 3);
    state = initial();
    let release!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; }); barrier = new Promise<void>(resolve => { release = resolve; });
    const first = assign(sa, 6, '0'); await entered; const second = assign(sa2, 7, '0'); release();
    const results = await Promise.allSettled([first, second]); assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.equal(state.history.length, 1);
    barrier = undefined; started = undefined;
    state = initial(null); await assign(head.userId, 30); assert.equal(state.project.pic_id, head.userId); assert.equal(state.project.active_phase_id, null);
    state = initial(); const twice = await Promise.all([assign(sa, 8, '0'), assign(sa, 8, '0')]); assert.equal(state.history.length, 1); assert(twice.some(r => r.replayed));
    for (const inApp of [false, true]) for (const telegram of [false, true]) {
      state = initial(); Object.assign(preferences, { inApp, telegram }); await assign(sa, 9, '0'); await assign(sa, 9, '0');
      assert.equal(state.intents.length, inApp || telegram ? 1 : 0);
      if (state.intents.length) { assert.equal(state.intents[0].in_app_visible, inApp); assert.equal(state.intents[0].telegram, telegram); }
    }
    Object.assign(preferences, { inApp: true, telegram: true });
    for (const phase of ['pra', 'tender', null]) {
      state = initial(phase); state.project.status = 'DRAFT'; state.project.phase_status = 'DRAFT'; state.plan.status = 'PENDING';
      state.milestones = state.milestones.filter(m => m.id === 'm' || phase !== null && m.id === 'old');
      const input = { pic_id: sa, expected_approval_id: 'approval', ...request(10) };
      failure = 'audit'; await rejected(() => ProjectPlanApprovalService.approve('p', input, head), 'PIC_UNAVAILABLE');
      assert.equal(state.plan.status, 'PENDING'); assert.equal(state.project.pic_id, null); assert.equal(state.project.status, 'DRAFT');
      failure = null; const result = await ProjectPlanApprovalService.approve('p', input, head); assert.equal(result.project_status, 'ACTIVE');
      await ProjectPlanApprovalService.approve('p', input, head); assert.equal(state.history.length, 1); assert.equal(state.intents.length, 2);
      assert.equal(state.project.active_phase_id, phase, 'Legacy classification is never changed by PIC approval');
      if (phase) assert.equal(state.milestones.find(m => m.id === 'old')!.pic_id, 'previous-phase');
    }
    state = initial(); state.project.status = 'DRAFT'; state.plan.status = 'PENDING';
    const reject = { expected_approval_id: 'approval', note: 'Please revise', ...request(11) };
    await ProjectPlanApprovalService.reject('p', reject, head); await ProjectPlanApprovalService.reject('p', reject, head);
    assert.equal(state.project.pic_id, null); assert.equal(state.history.length, 0); assert.equal(state.audits.length, 1); assert.equal(state.intents.length, 1);
    assert.equal(externalCalls, 0, 'Delivery failures cannot change the mutation result; no external send in the write path');
    state = initial(); const app = express(); app.use(express.json()); app.use(assignmentRoutes);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert(address && typeof address !== 'string');
    const http = (body: any) => fetch(`http://127.0.0.1:${address.port}/projects/p/assign-pic`, { method: 'POST', headers: { authorization: 'Bearer local-mock', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    try {
      const body = { pic_id: sa, ...request(12) };
      actorRole = 'SA'; assert.equal((await http(body)).status, 403); actorRole = 'HEAD_SA'; actorActive = false; assert.equal((await http(body)).status, 401); actorActive = true;
      assert.equal((await http({ ...body, actor_id: 'spoof' })).status, 422);
      assert.equal((await http(body)).status, 200); assert.equal((await http(body)).status, 200); assert.equal(state.history.length, 1);
      const stale = await http({ ...body, ...request(13), pic_id: sa2 }); assert.equal(stale.status, 409); assert.equal((await stale.json() as any).errors.code, 'PIC_CONFLICT');
      state = initial(); failure = 'intent'; const failed = await http(body); assert.equal(failed.status, 503); assert(!(await failed.text()).includes('private diagnostic'));
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    const sql = readFileSync(join(__dirname, '../../supabase/phase27-atomic-pic-assignment.sql'), 'utf8');
    for (const name of ['assign_project_pic_atomic', 'review_project_plan_pic_atomic']) {
      const body = sql.slice(sql.indexOf('create function public.' + name), sql.indexOf('end $$;', sql.indexOf('create function public.' + name)));
      const positions = ['from public.projects where id=p_project_id for update', 'order by id for share', 'from public.project_pic_requests', 'v_p.pic_revision<>p_expected_revision'].map(part => body.indexOf(part));
      assert(positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1])), 'Lock, actor, receipt and revision precede writes');
      assert(body.includes("operation<>") && body.includes('payload<>v_payload')); assert(!body.includes('exception when'));
      assert(body.includes('pm.phase_id is not distinct from v_p.active_phase_id'));
      assert(body.includes('insert into public.project_pic_requests'));
    }
    assert(sql.includes('old.pic_revision + 1')); assert(sql.includes("pm.status not in('COMPLETED','APPROVED')"));
    assert(sql.includes('v_in_app or v_telegram')); assert(sql.includes('if v_telegram then')); assert(sql.includes("'FAILED','RETRYABLE',now(),0"));
    assert(sql.includes('v_a:=public.review_project_phase_plan_phase24_core('), 'Existing atomic phase body is preserved, not split');
    assert(sql.includes('rename to review_project_phase_plan_phase24_core'));
    const initialize = sql.slice(sql.indexOf('create or replace function public.initialize_project_phase'), sql.indexOf('-- Durable notification records'));
    assert(initialize.indexOf("set_config('workflow.pic_write_project',new.id::text,true)") < initialize.indexOf('update public.projects set active_phase_id'), 'New-project initialization must participate in the revision protocol');
    const transition = sql.slice(sql.indexOf('create or replace function public.continue_project_tender_phase'));
    assert(transition.indexOf("set_config('workflow.pic_write_project',p_project_id::text,true)") < transition.indexOf('update public.projects set active_phase_id'));
    assert(transition.includes("'PIC_PHASE_RESET'") && transition.includes("'before',v_p.pic_id,'after',null"));
    assert(sql.includes('from public,anon,authenticated,service_role')); assert(sql.includes('on delete cascade'));
    assert(!sql.includes("lower(name)") && !sql.includes('storage_path') && !sql.includes('document_versions'));
    console.log('PIC atomic contract: local HTTP policy, modeled rollback/CAS/ABA/replay/no-op/concurrency, prior-phase preservation, initial/tender/legacy plan and channel independence; SQL static guard/grant checks passed. PostgreSQL not executed.');
  } finally {
    (supabaseAdmin as any).from = original.from; (supabaseAdmin as any).rpc = original.rpc; (supabaseAdmin.auth as any).getUser = original.getUser;
    (DeadlineService as any).calculateDeadline = original.deadline; (notices as any).notifyPicAssignment = original.notice; (planNotices as any).notifyProjectPlanApproved = original.planNotice;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
