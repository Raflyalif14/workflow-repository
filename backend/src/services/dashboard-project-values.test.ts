import assert from 'node:assert/strict';
import { supabaseAdmin } from '../config/supabase';
import {
  buildDashboardOverviewFromRows,
  DashboardProjectRow,
  DashboardService,
  DashboardSourceRows,
} from './dashboard.service';

const head = { userId: 'head-1', role: 'HEAD_SA' };
const project = (id: string, overrides: Partial<DashboardProjectRow> = {}): DashboardProjectRow => ({
  id, name: id, customer: null, scenario_id: null, sales_id: 'sales-1', pic_id: 'sa-1',
  status: 'ACTIVE', is_postponed: false, estimated_revenue: 100.5, final_contract_value: 99999,
  ...overrides,
});
const rows = (projects: DashboardProjectRow[]): DashboardSourceRows => ({
  projects, milestones: [], scenarios: [], deadlineApprovals: [], projectPlanApprovals: [],
  activityLogs: [], users: [],
});
const projects = [
  project('active'),
  project('other-owner', { sales_id: 'sales-2', pic_id: 'sa-2', estimated_revenue: '20', is_postponed: null }),
  project('no-pause-flag', { estimated_revenue: 25, is_postponed: undefined }),
  project('missing', { estimated_revenue: null }),
  project('invalid', { estimated_revenue: 'invalid' }),
  project('negative', { estimated_revenue: -20 }),
  project('infinite', { estimated_revenue: Infinity }),
  project('paused-active', { is_postponed: true }),
  ...['POSTPONED', 'DRAFT', 'WAITING_RESULT', 'LOST', 'COMPLETED', 'CANCELLED'].map((status) =>
    project(status, { status })),
  project('won', { status: 'WON', final_contract_value: 40.25 }),
  project('old-won', { status: 'WON', final_contract_value: '50', created_at: '2000-01-01T00:00:00Z' }),
  project('missing-won', { status: 'WON', final_contract_value: null }),
  project('invalid-won', { status: 'WON', final_contract_value: 'Infinity' }),
  project('negative-won', { status: 'WON', final_contract_value: -1 }),
  project('paused-won', { status: 'WON', is_postponed: true, final_contract_value: 9 }),
];

assert.deepEqual(buildDashboardOverviewFromRows(rows(projects), head).headSaProjectValues, {
  active: { count: 7, estimatedRevenue: 145.5 },
  won: { count: 6, finalContractValue: 99.25 },
}, 'HEAD_SA uses global access scope, strict ACTIVE/unpaused criteria and WON final values from all periods');
assert.deepEqual(buildDashboardOverviewFromRows(rows([]), head).headSaProjectValues, {
  active: { count: 0, estimatedRevenue: 0 }, won: { count: 0, finalContractValue: 0 },
});
for (const role of ['SALES', 'SA', 'SUPER_ADMIN', 'UNKNOWN']) {
  assert.equal(buildDashboardOverviewFromRows(rows(projects), { userId: 'sales-1', role }).headSaProjectValues, null);
}

async function run() {
  const originalFrom = supabaseAdmin.from;
  let source = Array.from({ length: 1003 }, (_, index) => project(`project-${String(index).padStart(4, '0')}`, {
    estimated_revenue: 1, updated_at: '2026-10-01T00:00:00Z',
  }));
  source[1002] = project('last-won', { status: 'WON', final_contract_value: 50 });
  const ranges: Array<[number, number]> = [];
  const filters: Array<[string, unknown]> = [];
  const orders: Array<[string, boolean]> = [];
  let failOffset: number | undefined;
  let baseProjectIds: string[] = [];

  (supabaseAdmin as any).from = (table: string) => {
    let range: [number, number] | undefined;
    const queryFilters: Array<[string, unknown]> = [];
    const query = {
      select: (projection: string) => {
        if (table === 'projects') {
          assert(projection.includes('estimated_revenue') && projection.includes('final_contract_value'));
          assert(!projection.includes('*'));
        }
        return query;
      },
      order: (column: string, options: { ascending: boolean }) => {
        if (table === 'projects') orders.push([column, options.ascending]);
        return query;
      },
      neq: () => query,
      limit: () => query,
      eq: (column: string, value: unknown) => {
        if (table === 'projects') { filters.push([column, value]); queryFilters.push([column, value]); }
        return query;
      },
      in: (column: string, values: string[]) => {
        if (table === 'project_milestones' && column === 'project_id') baseProjectIds = values;
        return query;
      },
      range: (start: number, end: number) => {
        range = [start, end];
        ranges.push(range);
        return query;
      },
      then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
        if (table !== 'projects') return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        if (range && range[0] === failOffset) {
          return Promise.resolve({ data: null, error: new Error('Test page failure') }).then(resolve, reject);
        }
        const scoped = source.filter((row) => queryFilters.every(([column, value]) => row[column as keyof DashboardProjectRow] === value));
        return Promise.resolve({
          data: range ? scoped.slice(range[0], range[1] + 1) : scoped, error: null,
        }).then(resolve, reject);
      },
    };
    return query;
  };

  try {
    const result = await DashboardService.getOverview(head);
    assert.deepEqual(ranges, [[0, 249], [250, 499], [500, 749], [750, 999], [1000, 1249]]);
    assert.deepEqual(result.headSaProjectValues, {
      active: { count: 1002, estimatedRevenue: 1002 }, won: { count: 1, finalContractValue: 50 },
    }, 'values beyond frontend 100 and database default 1000 must be included');
    assert.equal(baseProjectIds.length, 1003, 'related overview queries must retain the full scoped project list');
    assert.equal(filters.length, 0, 'HEAD_SA global access must not be filtered by owner/PIC');
    assert.deepEqual(orders, Array.from({ length: 5 }, () => [['updated_at', false], ['id', true]]).flat(),
      'pagination needs deterministic ordering even when updated_at timestamps tie');

    failOffset = 250;
    await assert.rejects(DashboardService.getOverview(head), /Failed to load dashboard data/,
      'a later page error must fail instead of returning incomplete financial totals');
    failOffset = undefined;
    source = [];
    const empty = await DashboardService.getOverview(head);
    assert.equal(empty.headSaProjectValues?.active.count, 0);
    assert.equal(empty.headSaProjectValues?.won.finalContractValue, 0);

    source = projects;
    for (const [role, userId, column] of [['SALES', 'sales-1', 'sales_id'], ['SA', 'sa-1', 'pic_id']] as const) {
      const previousRanges = ranges.length;
      const overview = await DashboardService.getOverview({ role, userId });
      assert.equal(overview.headSaProjectValues, null);
      assert(filters.some(([key, value]) => key === column && value === userId));
      assert.equal(overview.summary.totalProjects, source.filter((row) => row[column] === userId).length);
      const scopedCount = source.filter(row => row[column] === userId).length;
      assert.equal(ranges.length - previousRanges, Math.floor(scopedCount / 250) + 1,
        'all roles now page their complete existing scope for phase status aggregates');
    }
    assert.equal((await DashboardService.getOverview({ role: 'SUPER_ADMIN', userId: 'admin-1' })).headSaProjectValues, null);
    console.log('HEAD_SA project value aggregation, roles, paused projects and pagination: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
