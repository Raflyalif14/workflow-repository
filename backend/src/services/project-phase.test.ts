import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { supabaseAdmin } from '../config/supabase';
import { ALL_OUTPUT_DEFINITIONS, getScenarioDocuments, getMandatoryDocumentKeys, getProjectDocumentDefinitions, getProjectMandatoryDocumentKeys } from '../constants/scenarios';
import { activePhaseProject, assertCanContinuePhase, phaseRows, projectPhaseName, ProjectPhaseService } from './project-phase.service';
import { advanceToNextMilestone } from './workflow-progression.service';
import { buildInitialMilestoneRows } from './milestone.service';

const actor = { userId: 'sales', role: 'SALES', fullName: 'Sales' };
const project: any = { id: 'project', name: 'Project', sales_id: 'sales', status: 'ACTIVE',
  is_postponed: false, active_phase_id: 'pra', current_scenario_id: 'scenario-pra',
  scenario_id: 'initial-pra', selected_document_keys: ['proposal_deck_solusi'] };
async function main() {
  assert.equal(getScenarioDocuments('PRA_TENDER').length, 10);
  assert.equal(getScenarioDocuments('ON_SUBMISSION_TENDER').length, 7);
  assert.equal(ALL_OUTPUT_DEFINITIONS.length, 17);
  assert.equal(projectPhaseName({ phase_key: 'PRA_TENDER' }), 'Pra-Tender');
  assert.equal(projectPhaseName([{ phase_key: 'ON_SUBMISSION_TENDER' }]), 'On Submission Tender');
  assert.equal(projectPhaseName({ phase_key: 'Tender approximate' }), null);
  assert.equal(getProjectDocumentDefinitions('PRA_TENDER', false).length, 17, 'Existing legacy projects retain both groups');
  assert.deepEqual(getMandatoryDocumentKeys('PRA_TENDER'), ['proposal_deck_solusi']);
  assert.equal(getProjectMandatoryDocumentKeys('PRA_TENDER', false).length, 5, 'Legacy combined mandatory scope is retained');
  assert.equal(getMandatoryDocumentKeys('ON_SUBMISSION_TENDER').length, 4);
  for (const group of ['PRA_TENDER', 'ON_SUBMISSION_TENDER'] as const) {
    const definitions = getScenarioDocuments(group);
    const stageKeys = new Set(definitions.filter(row => row.isRequired).map(row => row.stageKey));
    const stages = [...new Set(definitions.map(row => row.stageKey))].map((key, index) => ({ id: key, name: key,
      description: null, step_order: index + 1, stage_key: key, default_role: 'SA' }));
    if (group === 'ON_SUBMISSION_TENDER') stages.push({ id: 'TENDER_PROCESS', name: 'Tender', description: null,
      step_order: stages.length + 1, stage_key: 'TENDER_PROCESS', default_role: 'SALES' });
    const rows = buildInitialMilestoneRows('project', stages, undefined, { workflow_model: 'OPERATIONAL_V2', workflow_version: 2 }, stageKeys);
    assert(rows.every(row => row.status === 'CREATED'));
    assert(rows.every(row => stageKeys.has(row.workflow_stage_id) || row.workflow_stage_id === 'TENDER_PROCESS'));
    assert.equal(rows.some(row => row.workflow_stage_id === 'TENDER_PROCESS'), group === 'ON_SUBMISSION_TENDER');
  }
  assert.equal(activePhaseProject(project).scenario_id, 'scenario-pra');
  assert.equal(project.scenario_id, 'initial-pra');
  assert.deepEqual(phaseRows([{ phase_id: 'pra', id: 'old' }, { phase_id: 'tender', id: 'new' }], 'tender').map(row => row.id), ['new']);
  for (const role of ['SA', 'HEAD_SA', 'SUPER_ADMIN']) assert.throws(() => assertCanContinuePhase(project, { ...actor, role }));
  assert.throws(() => assertCanContinuePhase(project, { ...actor, userId: 'other' }));
  for (const status of ['POSTPONED', 'WAITING_RESULT', 'WON', 'LOST', 'CANCELLED']) assert.throws(() => assertCanContinuePhase({ ...project, status }, actor));
  assert.throws(() => assertCanContinuePhase({ ...project, is_postponed: true }, actor));
  assert.throws(() => assertCanContinuePhase({ ...project, active_phase_id: null }, actor));

  const from = supabaseAdmin.from, rpc = supabaseAdmin.rpc;
  let rpcCalls = 0;
  try {
    (supabaseAdmin as any).from = () => {
      const q: any = { select: () => q, eq: () => q, single: async () => ({ data: project, error: null }) }; return q;
    };
    (supabaseAdmin as any).rpc = async (name: string, args: any) => {
      rpcCalls++; assert.equal(name, 'continue_project_tender_phase');
      assert.equal(args.p_sales_id, actor.userId);
      for (const key of getMandatoryDocumentKeys('ON_SUBMISSION_TENDER')) assert(args.p_selected_keys.includes(key));
      return { data: [{ phase_id: 'tender', created: rpcCalls === 1 }], error: null };
    };
    await assert.rejects(ProjectPhaseService.continue('project', [], { ...actor, role: 'SA' }));
    await assert.rejects(ProjectPhaseService.continue('project', ['assessment'], actor));
    assert.equal(rpcCalls, 0, 'Unauthorized/invalid scope cannot reach a write RPC');
    const first = await ProjectPhaseService.continue('project', [], actor);
    const replay = await ProjectPhaseService.continue('project', [], actor);
    assert.equal(first.phase_id, replay.phase_id); assert(replay.created === false);

    const milestone = { id: 'last-pra', project_id: 'project', phase_id: 'pra', status: 'COMPLETED', step_order: 1 };
    let writes = 0, finishes = 0;
    (supabaseAdmin as any).from = (table: string) => {
      const data = table === 'projects' ? project : table === 'project_milestones' ? [milestone]
        : table === 'project_output_documents' ? [{ document_key: 'proposal_deck_solusi', is_required: true, is_selected: true, status: 'APPROVED' }]
          : { name: 'Pra-Tender' };
      const q: any = { select: () => q, eq: () => q, order: () => q, single: async () => ({ data, error: null }),
        update: () => { writes++; return q; }, then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) }; return q;
    };
    (supabaseAdmin as any).rpc = async (name: string, args: any) => {
      assert.equal(name, 'finish_project_phase'); assert.equal(args.p_phase_id, 'pra'); finishes++;
      return { data: finishes === 1, error: null };
    };
    for (let i = 0; i < 2; i++) {
      const result = await advanceToNextMilestone('project', milestone.id, { ...actor, role: 'HEAD_SA' });
      assert('phase_completed' in result && result.phase_completed);
      assert.equal(result.project_completed, false); assert.equal(result.next_milestone, null);
    }
    assert.equal(writes, 0, 'Pra completion cannot set outcome or automatically create/start tender');
  } finally { (supabaseAdmin as any).from = from; (supabaseAdmin as any).rpc = rpc; }

  const sql = readFileSync(join(__dirname, '../../supabase/phase24-sequential-project-phases.sql'), 'utf8');
  const body = (name: string) => { const start = sql.indexOf('function public.' + name); return sql.slice(start, sql.indexOf('$$;', sql.indexOf('as $$', start)) + 3); };
  const transition = body('continue_project_tender_phase');
  assert(transition.indexOf('for update') < transition.indexOf('insert into public.project_phases'));
  assert(transition.indexOf("is_active") < transition.indexOf('insert into public.project_phases'));
  assert(transition.indexOf('return query select v_id,false') < transition.indexOf('insert into public.project_phases'));
  assert(sql.includes('unique(project_id,phase_key)'));
  assert(!transition.includes('delete from')); assert(!transition.includes('set scenario_id'));
  const scope = body('sync_phase_output_scope');
  assert(scope.includes('phase_id = v_project.active_phase_id'));
  assert(scope.indexOf('project_output_document_draft_requests') < scope.indexOf('delete from public.project_output_documents'));
  assert(scope.includes("v_scenario_name = 'On Submission Tender' and ws.default_role = 'SALES'"));
  const plan = body('review_project_phase_plan');
  assert(plan.includes('phase_id = v_p.active_phase_id')); assert(plan.includes("using errcode = '40001'"));
  assert(plan.includes("role = 'HEAD_SA' and id = p_actor_id"), 'Head SA cannot appoint another Head SA');
  assert(plan.includes('btrim(p_note)')); assert(plan.includes('is_active'));
  assert(sql.includes('or v_d.phase_id is distinct from v_m.phase_id'));
  assert(sql.includes('or v_p.active_phase_id is distinct from v_d.phase_id'));
  assert(!sql.includes('create or replace function public.submit_project_output_document_draft'));
  assert(!sql.includes('create or replace function public.mutate_project_output_document_draft'));
  assert(!sql.includes('drop table')); assert(!sql.includes('drop cascade'));
  console.log('Phase catalog, owner/status guards, replay contract, completion boundary and SQL transaction guards passed (SQL not executed)');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
