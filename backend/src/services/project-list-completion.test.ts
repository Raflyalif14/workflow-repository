import assert from 'node:assert/strict';
import { supabaseAdmin } from '../config/supabase';
import { ProjectManagementService } from './project-management.service';
import { projectQuerySchema, projectManagementStatusEnum } from '../validators/project-management.validator';

const salesA = '00000000-0000-4000-8000-000000000001', salesB = '00000000-0000-4000-8000-000000000002';
const scenario = '00000000-0000-4000-8000-000000000003';
const submissionScenario = '00000000-0000-4000-8000-000000000004';
const rows = ['WON', 'ACTIVE', 'COMPLETED', 'WAITING_RESULT', 'LOST', 'DRAFT', 'CANCELLED', 'POSTPONED'].map(status => ({
  id: status, name: `Project ${status}`, customer: 'Example', status, sales_id: salesA, pic_id: 'sa-a', scenario_id: scenario,
  current_scenario_id: null as string | null,
}));
rows.push({ ...rows[0], id: 'other-won', name: 'Other won', sales_id: salesB, pic_id: 'sa-b' });
const milestones = [
  {id:'later-active',project_id:'ACTIVE',name:'Later',status:'IN_PROGRESS',start_date:'2026-10-03',duration_working_days:1,step_order:1},
  {id:'early-long',project_id:'ACTIVE',name:'Long',status:'CREATED',start_date:'2026-10-01',duration_working_days:5,step_order:2},
  {id:'early-short',project_id:'ACTIVE',name:'Deliverables',status:'CREATED',start_date:'2026-10-01',duration_working_days:2,step_order:3},
  {id:'finished',project_id:'ACTIVE',name:'Finished',status:'COMPLETED',start_date:'2026-09-01',duration_working_days:1,step_order:4},
];
const outputs = [
  { project_id: 'ACTIVE', milestone_id: 'early-short', document_key: 'proposal_teknis', is_required: true, is_selected: false },
  { project_id: 'ACTIVE', milestone_id: 'early-short', document_key: 'timeline_proyek', is_required: false, is_selected: true },
  { project_id: 'ACTIVE', milestone_id: 'early-short', document_key: 'unselected-output', is_required: false, is_selected: false },
  { project_id: 'WON', milestone_id: 'other-milestone', document_key: 'other-output', is_required: true, is_selected: true },
];

class Query {
  filters: Array<(row: typeof rows[number]) => boolean> = [];
  first = 0; last = Infinity;
  constructor(private table: string) {}
  select() { return this; }
  order() { return this; }
  range(first: number, last: number) { this.first = first; this.last = last; return this; }
  eq(column: string, value: unknown) { this.filters.push(row => (row as any)[column] === value); return this; }
  in(column: string, values: unknown[]) { this.filters.push(row => values.includes((row as any)[column])); return this; }
  or(expression: string) {
    const activeScenario = expression.match(/^current_scenario_id\.eq\.([\w-]+),and\(current_scenario_id\.is\.null,scenario_id\.eq\.([\w-]+)\)$/);
    if (activeScenario) {
      assert.equal(activeScenario[1], activeScenario[2], 'Legacy fallback must use the same scenario');
      this.filters.push(row => (row.current_scenario_id ?? row.scenario_id) === activeScenario[1]);
      return this;
    }
    assert(expression.startsWith('name.ilike.%'), 'Unexpected OR filter');
    const term = expression.split('name.ilike.%')[1].split('%,customer')[0].toLowerCase();
    this.filters.push(row => `${row.name} ${row.customer}`.toLowerCase().includes(term)); return this;
  }
  then(resolve: any, reject: any) {
    const source = this.table === 'projects' ? rows : this.table === 'project_milestones' ? milestones : outputs;
    const filtered = source.filter(row => this.filters.every(matches => matches(row as any)));
    return Promise.resolve({ data: filtered.slice(this.first, this.last + 1), count: filtered.length, error: null }).then(resolve, reject);
  }
}
async function run() {
  const initialRowCount = rows.length;
  const original = { from: supabaseAdmin.from, fetch: globalThis.fetch };
  (supabaseAdmin as any).from = (table: string) => { assert(['projects', 'project_milestones', 'project_output_documents'].includes(table)); return new Query(table); };
  globalThis.fetch = async () => { throw Error('No provider network is allowed in this test'); };
  const head = { userId: 'head-a', role: 'HEAD_SA', fullName: 'Example' };
  const list = (query: unknown, actor = head) => ProjectManagementService.list(projectQuerySchema.parse(query), actor);
  try {
    const first = await list({ status_group: 'DELIVERY_COMPLETED', limit: 2 });
    assert.deepEqual(first.projects.map((row: any) => row.status), ['WON', 'COMPLETED']);
    assert.equal(first.pagination.total, 5); assert.equal(first.pagination.totalPages, 3); assert(first.pagination.hasNextPage);
    assert.deepEqual(first.summary, { active: 0, planning: 0, completed: 5 }, 'Summary includes matching projects beyond the current page');
    const last = await list({ status_group: 'DELIVERY_COMPLETED', limit: 2, page: 3 });
    assert.deepEqual(last.projects.map((row: any) => row.id), ['other-won']); assert(!last.pagination.hasNextPage);
    const all = await list({ status_group: 'DELIVERY_COMPLETED', limit: 100 });
    assert.deepEqual(new Set(all.projects.map((row: any) => row.status)), new Set(['COMPLETED', 'WAITING_RESULT', 'WON', 'LOST']));
    const exact = await list({ status: 'COMPLETED' }); assert.deepEqual(exact.projects.map((row: any) => row.id), ['COMPLETED']);
    const active = await list({ status: 'ACTIVE' }); assert.equal(active.pagination.total, 1);
    assert.equal(active.projects[0].currentMilestone.id, 'early-short', 'Work Stage follows start date then shortest duration, regardless of started state');
    assert.equal(active.projects[0].currentStage, 'Proposal Teknis • Timeline Proyek', 'Deliverables uses only required or selected output names from the current milestone');
    for (const actor of [{ ...head, role: 'SALES', userId: salesA }, { ...head, role: 'SA', userId: 'sa-a' }]) {
      const result = await list({ status_group: 'DELIVERY_COMPLETED', sales_id: salesB }, actor);
      assert.equal(result.pagination.total, 4); assert(!result.projects.some((row: any) => row.id === 'other-won'));
      const paged = await list({ status_group: 'DELIVERY_COMPLETED', sales_id: salesB, limit: 2 }, actor);
      assert.deepEqual(paged.summary, { active: 0, planning: 0, completed: 4 }, 'Summary retains Sales and SA access scope across pages');
    }
    assert.equal((await list({ status_group: 'DELIVERY_COMPLETED' }, { ...head, role: 'UNKNOWN' })).pagination.total, 0);
    const searched = await list({ status_group: 'DELIVERY_COMPLETED', search: 'other', scenario_id: scenario });
    assert.deepEqual(searched.projects.map((row: any) => row.id), ['other-won']);
    assert.equal((await list({ status_group: 'DELIVERY_COMPLETED', sales_id: salesB })).pagination.total, 1);
    assert.equal((await list({})).pagination.total, rows.length);
    assert(!projectQuerySchema.safeParse({ status_group: 'WON' }).success);
    assert(!projectManagementStatusEnum.safeParse('DELIVERY_COMPLETED').success, 'A list grouping never becomes a stored project status');
    rows.push(
      { ...rows[1], id: 'converted-active', name: 'Converted active', current_scenario_id: submissionScenario },
      { ...rows[0], id: 'converted-completed', name: 'Converted completed', status: 'COMPLETED', current_scenario_id: submissionScenario },
      { ...rows[1], id: 'converted-other-owner', name: 'Converted other owner', sales_id: salesB, pic_id: 'sa-b', current_scenario_id: submissionScenario },
      { ...rows[5], id: 'direct-submission', name: 'Direct submission', scenario_id: submissionScenario },
      { ...rows[1], id: 'current-pra', name: 'Current Pra-Tender', current_scenario_id: scenario },
    );
    const submission = await list({ scenario_id: submissionScenario, limit: 1 });
    assert.deepEqual(submission.projects.map((project: any) => project.id), ['converted-active'], 'Converted projects match their active phase');
    assert.equal(submission.pagination.total, 4, 'Active phase filter runs before pagination and includes legacy projects');
    assert.deepEqual(submission.summary, { active: 2, planning: 1, completed: 1 }, 'Summary uses the same active phase filter across every page');
    const direct = await list({ scenario_id: submissionScenario, page: 4, limit: 1 });
    assert.equal(direct.projects[0].id, 'direct-submission', 'Projects without an active scenario use their original scenario');
    const pra = await list({ scenario_id: scenario });
    assert.equal(pra.pagination.total, initialRowCount + 1, 'Pra-Tender excludes projects that moved to Submission Tender');
    assert(!pra.projects.some((project: any) => project.id.startsWith('converted-')));
    const filtered = await list({ scenario_id: submissionScenario, status: 'ACTIVE', search: 'converted', limit: 1 });
    assert.equal(filtered.pagination.total, 2, 'Active phase composes with search and status filters');
    assert.deepEqual(filtered.summary, { active: 2, planning: 0, completed: 0 });
    const owner = await list({ scenario_id: submissionScenario, sales_id: salesB });
    assert.deepEqual(owner.projects.map((project: any) => project.id), ['converted-other-owner']);
    for (const actor of [{ ...head, role: 'SALES', userId: salesA }, { ...head, role: 'SA', userId: 'sa-a' }]) {
      const scoped = await list({ scenario_id: submissionScenario, sales_id: salesB, limit: 1 }, actor);
      assert.equal(scoped.pagination.total, 3, 'Active phase filtering preserves Sales and SA access scope');
      assert.deepEqual(scoped.summary, { active: 1, planning: 1, completed: 1 });
    }
    console.log('Project list completion: grouping before pagination, exact status compatibility, search/scenario and role access passed.');
  } finally { rows.splice(initialRowCount); supabaseAdmin.from = original.from; globalThis.fetch = original.fetch; }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
