import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { supabaseAdmin } from '../config/supabase';
import { authenticateJwt, requireRoles } from '../middlewares/auth.middleware';
import { ProjectManagementController } from '../controllers/project-management.controller';
import { PhaseDecisionError, ProjectPhaseService } from './project-phase.service';
import { buildDashboardOverviewFromRows, DashboardSourceRows } from './dashboard.service';

async function main() {
  const sql = readFileSync(join(__dirname, '../../supabase/phase25-pra-tender-sales-decision.sql'), 'utf8');
  const functionBody = (name: string) => {
    const start = sql.indexOf(`function public.${name}(`);
    assert(start >= 0);
    return sql.slice(start, sql.indexOf('end $$;', start) + 7);
  };
  const yes = functionBody('continue_project_tender_phase');
  const no = functionBody('close_project_at_pra_tender');
  for (const body of [yes, no]) {
    assert(body.indexOf('from public.projects where id = p_project_id for update') < body.indexOf('update public.project_phases'));
    assert(body.indexOf('is_active') < body.indexOf('update public.project_phases'));
    assert(body.indexOf('coalesce(v_p.is_postponed,false)') < body.indexOf('update public.project_phases'));
    assert(body.indexOf('assert_pra_tender_decision_ready') < body.indexOf('update public.project_phases'));
    assert(body.includes("using errcode = '40001'"));
    assert(body.includes('sales_decided_by = p_sales_id,sales_decided_at = now()'));
  }
  assert(yes.indexOf("sales_decision = 'CLOSE_PRA_TENDER'") < yes.indexOf('insert into public.project_phases'));
  assert(yes.indexOf('return query select v_id,false') < yes.indexOf("'PRA_TENDER_DECIDED'"));
  assert(no.indexOf("phase_key = 'ON_SUBMISSION_TENDER'") < no.indexOf("set status = 'COMPLETED'"));
  assert(no.indexOf('return query select v_phase.id,false') < no.indexOf('insert into public.activity_logs'));
  assert(no.indexOf('insert into public.notifications') < no.indexOf('return query select v_phase.id,true'));
  const retryWorker = readFileSync(join(__dirname, '../../supabase/phase10c7b-telegram-retry-claim.sql'), 'utf8');
  assert(retryWorker.includes("delivery.status = 'FAILED'") && retryWorker.includes("delivery.failure_kind = 'RETRYABLE'"));
  assert(no.includes("'TELEGRAM','FAILED','RETRYABLE',now(),0"), 'First Telegram intent must use the existing claimable queue contract');
  assert(!/\bdelete\s+from\b|\bdrop\b|storage\.objects/i.test(sql));
  assert(!/set\s+(?:scenario_id|final_contract_value|outcome_decided_at|current_version_id)\s*=/i.test(no));
  assert(sql.includes('from public,anon,authenticated') && sql.includes('to service_role;'));

  const actor = { userId: 'sales', role: 'SALES', fullName: 'Sales' };
  const project = { id: 'project', sales_id: 'sales', status: 'ACTIVE', is_postponed: false, active_phase_id: 'pra' };
  const profile = { id: 'sales', email: 'mock@example.invalid', role: 'SALES', full_name: 'Sales', is_active: true, must_change_password: false };
  const from = supabaseAdmin.from, rpc = supabaseAdmin.rpc, getUser = supabaseAdmin.auth.getUser;
  let calls = 0;
  (supabaseAdmin as any).from = (table: string) => {
    assert(['projects', 'users'].includes(table), 'Decision service cannot write outputs or history');
    const q: any = { select: () => q, eq: () => q, single: async () => ({ data: { ...(table === 'users' ? profile : project) }, error: null }) };
    return q;
  };
  (supabaseAdmin.auth as any).getUser = async () => ({ data: { user: { id: profile.id } }, error: null });
  (supabaseAdmin as any).rpc = async (name: string) => {
    assert.equal(name, 'close_project_at_pra_tender'); calls++;
    return { data: [{ phase_id: 'pra', closed: calls === 1 }], error: null };
  };
  const app = express(); app.use(express.json());
  app.post('/projects/:projectId/phases/pra-tender/close', authenticateJwt, requireRoles(['SALES']), ProjectManagementController.closePraTender);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const request = () => fetch(`http://127.0.0.1:${address.port}/projects/project/phases/pra-tender/close`, {
    method: 'POST', headers: { authorization: 'Bearer mock-only', 'content-type': 'application/json' }, body: '{}',
  });
  try {
    for (const role of ['SA', 'HEAD_SA', 'SUPER_ADMIN']) { profile.role = role; assert.equal((await request()).status, 403); }
    profile.role = 'SALES'; profile.is_active = false; assert.equal((await request()).status, 401);
    profile.is_active = true; profile.id = 'other'; assert.equal((await request()).status, 403);
    profile.id = 'sales'; project.is_postponed = true; assert.equal((await request()).status, 400);
    project.is_postponed = false;
    for (const status of ['WON', 'LOST', 'WAITING_RESULT', 'CANCELLED', 'POSTPONED']) { project.status = status; assert.equal((await request()).status, 400); }
    assert.equal(calls, 0, 'Rejected requests cannot reach write RPC');
    project.status = 'ACTIVE'; assert.equal((await request()).status, 200);
    project.status = 'COMPLETED'; assert.equal((await request()).status, 200, 'Saved No replay delegates to transaction checks');
    (supabaseAdmin as any).rpc = async () => ({ data: null, error: { code: '40001', message: 'PRIVATE_PROVIDER_DETAILS' } });
    project.status = 'DRAFT'; assert.equal((await request()).status, 409);
    await assert.rejects(ProjectPhaseService.closePraTender('project', actor), (error: unknown) => error instanceof PhaseDecisionError && error.statusCode === 409);

    // Emulate the RPC's serialized response contract. This is not a live DB lock test.
    for (const first of ['yes', 'no'] as const) {
      project.status = 'ACTIVE';
      let saved: string | null = null, decisions = 0;
      let release!: () => void;
      const barrier = new Promise<void>(resolve => { release = resolve; });
      let started = 0;
      (supabaseAdmin as any).rpc = async (name: string) => {
        started++; if (started === 2) release();
        await barrier;
        const choice = name === 'close_project_at_pra_tender' ? 'no' : 'yes';
        if (saved && saved !== choice) return { data: null, error: { code: '40001', message: 'conflict' } };
        const created = !saved; if (created) decisions++; saved = choice;
        return { data: [{ phase_id: choice === 'yes' ? 'tender' : 'pra', closed: created, created }], error: null };
      };
      const choose = (choice: string) => choice === 'yes' ? ProjectPhaseService.continue('project', [], actor) : ProjectPhaseService.closePraTender('project', actor);
      const results = await Promise.allSettled([choose(first), choose(first === 'yes' ? 'no' : 'yes')]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(decisions, 1);
      const rejection = results.find(result => result.status === 'rejected');
      assert(rejection?.status === 'rejected' && rejection.reason.statusCode === 409);
    }
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    (supabaseAdmin as any).from = from; (supabaseAdmin as any).rpc = rpc; (supabaseAdmin.auth as any).getUser = getUser;
  }

  const rows: DashboardSourceRows = {
    projects: [{ ...project, status: 'COMPLETED', name: 'Completed Pra', scenario_id: null, customer: '', pic_id: 'sa', estimated_revenue: 1000 }],
    milestones: [], deadlineApprovals: [], projectPlanApprovals: [], activityLogs: [], users: [], scenarios: [],
    saUsers: [{ id: 'sa', role: 'SA', is_active: true, full_name: 'SA' }], outputDocuments: [],
  };
  const head = buildDashboardOverviewFromRows(rows, { userId: 'head', role: 'HEAD_SA' });
  assert.equal(head.summary.activeProjects, 0); assert.equal(head.summary.completedProjects, 1);
  assert.equal(head.headSaProjectValues?.active.count, 0); assert.equal(head.headSaProjectValues?.won.count, 0);
  assert.equal(head.headSaProjectValues?.won.finalContractValue, 0);
  assert.equal(head.saWorkload[0].activeProjectCount, 0);
  assert.equal(head.outputDocuments.reviewQueue.length, 0);
  console.log('Pra-Tender decision: local HTTP access/replay/conflict, simulated concurrent RPC contract, terminal metrics and SQL safety checks passed (SQL not executed).');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
