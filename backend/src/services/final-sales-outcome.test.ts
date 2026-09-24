import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin } from '../config/supabase';
import { getMandatoryDocumentKeys } from '../constants/scenarios';
import { completeMilestoneStage } from './workflow-progression.service';

type Row = Record<string, any>;
const sales = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Owner' };

function createState() {
  return {
    project: { id: 'project-1', name: 'Tender', sales_id: sales.userId, pic_id: 'sa-1', scenario_id: 'scenario-1', status: 'ACTIVE', is_postponed: false, selected_document_keys: [] as string[], final_contract_value: null, loss_reason: null },
    milestones: [
      { id: 'stage-1', project_id: 'project-1', name: 'Delivery', step_order: 1, status: 'COMPLETED', completed_at: '2026-09-20T00:00:00Z', workflow_stage: { default_role: 'SA' } },
      { id: 'stage-2', project_id: 'project-1', name: 'Tender Process', step_order: 2, status: 'IN_PROGRESS', completed_at: null, workflow_stage: { default_role: 'SALES' } },
    ] as Row[],
    outputs: getMandatoryDocumentKeys('ON_SUBMISSION_TENDER').map((key) => ({ document_key: key, is_required: true, is_selected: true, status: 'APPROVED' })) as Row[],
    logs: [] as Row[],
    rpcCalls: 0,
    failTransaction: false,
  };
}

class QueryMock {
  private filters: Array<[string, unknown]> = [];
  private inserted: Row | null = null;
  private singleResult = false;
  constructor(private state: ReturnType<typeof createState>, private table: string) {}
  select() { return this; }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
  order() { return this; }
  insert(row: Row) { this.inserted = row; return this; }
  single() { this.singleResult = true; return Promise.resolve(this.execute()); }
  then(resolve: (result: { data: any; error: any }) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }
  private execute() {
    if (this.table === 'activity_logs' && this.inserted) {
      this.state.logs.push(this.inserted);
      return { data: null, error: null };
    }
    const rows = this.table === 'project_milestones' ? this.state.milestones :
      this.table === 'scenarios' ? [{ id: 'scenario-1', name: 'On Submission Tender' }] : [];
    const matches = rows.filter((row) => this.filters.every(([key, value]) => row[key] === value));
    const data = this.singleResult ? matches[0] || null : matches;
    if (this.table === 'project_milestones' && this.singleResult && data) {
      return { data: { ...data, project: this.state.project }, error: null };
    }
    return { data, error: null };
  }
}

async function withState(action: (state: ReturnType<typeof createState>) => Promise<void>) {
  const state = createState();
  const originalFrom = supabaseAdmin.from;
  const originalRpc = supabaseAdmin.rpc;
  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(state, table);
    (supabaseAdmin as any).rpc = async (name: string, input: Row) => {
      assert.equal(name, 'complete_final_sales_milestone_with_outcome');
      state.rpcCalls++;
      if (state.failTransaction) return { data: null, error: { code: 'P0001', message: 'private provider failure' } };
      if (state.project.status === 'ACTIVE') {
        if (state.outputs.some((row) => row.status !== 'APPROVED') ||
          state.project.selected_document_keys.some((key: string) => !state.outputs.some((row) => row.document_key === key && row.status === 'APPROVED')) ||
          input.p_required_output_keys.some((key: string) => !state.outputs.some((row) => row.document_key === key && row.status === 'APPROVED'))) {
          return { data: null, error: { message: 'Selected output documents must be approved first.' } };
        }
        if (state.milestones[0].status !== 'COMPLETED') return { data: null, error: { message: 'Other milestones must be completed first.' } };
        state.milestones[1].status = 'COMPLETED';
        state.milestones[1].completed_at = '2026-09-24T00:00:00Z';
        state.project.status = input.p_outcome;
        state.project.final_contract_value = input.p_final_contract_value;
        state.project.loss_reason = input.p_loss_reason;
        return { data: [{ changed: true, project_id: state.project.id, milestone_name: state.milestones[1].name, completed_at: state.milestones[1].completed_at, project_status: state.project.status }], error: null };
      }
      if (state.project.status !== input.p_outcome || state.project.final_contract_value !== input.p_final_contract_value || state.project.loss_reason !== input.p_loss_reason) {
        return { data: null, error: { message: 'Project result has already been recorded.' } };
      }
      return { data: [{ changed: false, project_id: state.project.id, milestone_name: state.milestones[1].name, completed_at: state.milestones[1].completed_at, project_status: state.project.status }], error: null };
    };
    await action(state);
  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.rpc = originalRpc;
  }
}

async function run() {
  for (const input of [
    { outcome: 'WON' as const, final_contract_value: 1200000 },
    { outcome: 'LOST' as const, loss_reason: 'Price not competitive' },
  ]) {
    await withState(async (state) => {
      const result = await completeMilestoneStage('stage-2', sales, input);
      assert.equal(result.project_status, input.outcome);
      assert.equal(state.project.status, input.outcome);
      assert.equal(state.milestones[1].status, 'COMPLETED');
      assert.deepEqual(state.logs.map((row) => row.action), ['MILESTONE_COMPLETED', `PROJECT_${input.outcome}`]);
      const again = await completeMilestoneStage('stage-2', sales, input);
      assert.equal(again.project_status, input.outcome);
      assert.equal(state.logs.length, 2);
      assert.equal(state.rpcCalls, 2);
      await assert.rejects(() => completeMilestoneStage('stage-2', sales, input.outcome === 'WON'
        ? { outcome: 'WON', final_contract_value: 1 }
        : { outcome: 'LOST', loss_reason: 'Different reason' }), /already been recorded/);
    });
  }
  await withState(async (state) => {
    state.outputs[0].status = 'IN_REVIEW';
    await assert.rejects(() => completeMilestoneStage('stage-2', sales, { outcome: 'WON', final_contract_value: 100 }), /Selected output documents/);
    assert.equal(state.milestones[1].status, 'IN_PROGRESS');
    assert.equal(state.project.status, 'ACTIVE');
  });
  await withState(async (state) => {
    state.outputs = [];
    await assert.rejects(() => completeMilestoneStage('stage-2', sales, { outcome: 'WON', final_contract_value: 100 }), /Selected output documents/);
    assert.equal(state.project.status, 'ACTIVE');
  });
  await withState(async (state) => {
    state.milestones[0].status = 'IN_PROGRESS';
    await assert.rejects(() => completeMilestoneStage('stage-2', sales, { outcome: 'WON', final_contract_value: 100 }), /Other milestones/);
    assert.equal(state.milestones[1].status, 'IN_PROGRESS');
  });
  await withState(async (state) => {
    state.failTransaction = true;
    const originalError = console.error;
    console.error = () => undefined;
    try {
      await assert.rejects(() => completeMilestoneStage('stage-2', sales, { outcome: 'LOST', loss_reason: 'Lost' }), /Unable to complete/);
    } finally { console.error = originalError; }
    assert.equal(state.milestones[1].status, 'IN_PROGRESS');
    assert.equal(state.project.status, 'ACTIVE');
    assert.equal(state.logs.length, 0);
    state.failTransaction = false;
    const retry = await completeMilestoneStage('stage-2', sales, { outcome: 'LOST', loss_reason: 'Lost' });
    assert.equal(retry.project_status, 'LOST');
    assert.equal(state.logs.length, 2);
  });
  await withState(async (state) => {
    await assert.rejects(() => completeMilestoneStage('stage-2', { ...sales, userId: 'other' }, { outcome: 'WON', final_contract_value: 100 }), /Only the project owner/);
    assert.equal(state.rpcCalls, 0);
  });
  const sql = readFileSync(join(__dirname, '../../supabase/phase14-final-sales-outcome.sql'), 'utf8');
  assert(sql.includes('begin;') && sql.includes('for update of p') && sql.includes('for update of m'));
  assert(sql.includes("set status = 'COMPLETED'") && sql.includes('set status = p_outcome'));
  assert(sql.includes('pg_catalog.jsonb_array_elements_text(v_project.selected_document_keys)'));
  console.log('Final Sales outcome: WON, LOST, output gate, idempotency, authorization and transaction failure passed');
}

void run().catch((error) => { console.error(error); process.exitCode = 1; });
