import assert from 'node:assert/strict';
import { supabaseAdmin } from '../config/supabase';
import { ProjectManagementService } from './project-management.service';
import { projectQuerySchema, projectManagementStatusEnum } from '../validators/project-management.validator';

const salesA = '00000000-0000-4000-8000-000000000001', salesB = '00000000-0000-4000-8000-000000000002';
const scenario = '00000000-0000-4000-8000-000000000003';
const rows = ['WON', 'ACTIVE', 'COMPLETED', 'WAITING_RESULT', 'LOST', 'DRAFT', 'CANCELLED', 'POSTPONED'].map(status => ({
  id: status, name: `Project ${status}`, customer: 'Example', status, sales_id: salesA, pic_id: 'sa-a', scenario_id: scenario,
}));
rows.push({ ...rows[0], id: 'other-won', name: 'Other won', sales_id: salesB, pic_id: 'sa-b' });
const milestones = [
  {id:'later-active',project_id:'ACTIVE',name:'Later',status:'IN_PROGRESS',start_date:'2026-10-03',duration_working_days:1,step_order:1},
  {id:'early-long',project_id:'ACTIVE',name:'Long',status:'CREATED',start_date:'2026-10-01',duration_working_days:5,step_order:2},
  {id:'early-short',project_id:'ACTIVE',name:'Short',status:'CREATED',start_date:'2026-10-01',duration_working_days:2,step_order:3},
  {id:'finished',project_id:'ACTIVE',name:'Finished',status:'COMPLETED',start_date:'2026-09-01',duration_working_days:1,step_order:4},
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
    const term = expression.split('name.ilike.%')[1].split('%,customer')[0].toLowerCase();
    this.filters.push(row => `${row.name} ${row.customer}`.toLowerCase().includes(term)); return this;
  }
  then(resolve: any, reject: any) {
    const filtered = (this.table === 'projects' ? rows : milestones).filter(row => this.filters.every(matches => matches(row as any)));
    return Promise.resolve({ data: filtered.slice(this.first, this.last + 1), count: filtered.length, error: null }).then(resolve, reject);
  }
}
async function run() {
  const original = { from: supabaseAdmin.from, fetch: globalThis.fetch };
  (supabaseAdmin as any).from = (table: string) => { assert(['projects', 'project_milestones'].includes(table)); return new Query(table); };
  globalThis.fetch = async () => { throw Error('No provider network is allowed in this test'); };
  const head = { userId: 'head-a', role: 'HEAD_SA', fullName: 'Example' };
  const list = (query: unknown, actor = head) => ProjectManagementService.list(projectQuerySchema.parse(query), actor);
  try {
    const first = await list({ status_group: 'DELIVERY_COMPLETED', limit: 2 });
    assert.deepEqual(first.projects.map((row: any) => row.status), ['WON', 'COMPLETED']);
    assert.equal(first.pagination.total, 5); assert.equal(first.pagination.totalPages, 3); assert(first.pagination.hasNextPage);
    const last = await list({ status_group: 'DELIVERY_COMPLETED', limit: 2, page: 3 });
    assert.deepEqual(last.projects.map((row: any) => row.id), ['other-won']); assert(!last.pagination.hasNextPage);
    const all = await list({ status_group: 'DELIVERY_COMPLETED', limit: 100 });
    assert.deepEqual(new Set(all.projects.map((row: any) => row.status)), new Set(['COMPLETED', 'WAITING_RESULT', 'WON', 'LOST']));
    const exact = await list({ status: 'COMPLETED' }); assert.deepEqual(exact.projects.map((row: any) => row.id), ['COMPLETED']);
    const active = await list({ status: 'ACTIVE' }); assert.equal(active.pagination.total, 1);
    assert.equal(active.projects[0].currentMilestone.id, 'early-short', 'Work Stage follows start date then shortest duration, regardless of started state');
    for (const actor of [{ ...head, role: 'SALES', userId: salesA }, { ...head, role: 'SA', userId: 'sa-a' }]) {
      const result = await list({ status_group: 'DELIVERY_COMPLETED', sales_id: salesB }, actor);
      assert.equal(result.pagination.total, 4); assert(!result.projects.some((row: any) => row.id === 'other-won'));
    }
    assert.equal((await list({ status_group: 'DELIVERY_COMPLETED' }, { ...head, role: 'UNKNOWN' })).pagination.total, 0);
    const searched = await list({ status_group: 'DELIVERY_COMPLETED', search: 'other', scenario_id: scenario });
    assert.deepEqual(searched.projects.map((row: any) => row.id), ['other-won']);
    assert.equal((await list({ status_group: 'DELIVERY_COMPLETED', sales_id: salesB })).pagination.total, 1);
    assert.equal((await list({})).pagination.total, rows.length);
    assert(!projectQuerySchema.safeParse({ status_group: 'WON' }).success);
    assert(!projectManagementStatusEnum.safeParse('DELIVERY_COMPLETED').success, 'A list grouping never becomes a stored project status');
    console.log('Project list completion: grouping before pagination, exact status compatibility, search/scenario and role access passed.');
  } finally { supabaseAdmin.from = original.from; globalThis.fetch = original.fetch; }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
