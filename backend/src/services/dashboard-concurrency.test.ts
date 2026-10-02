import { supabaseAdmin } from '../config/supabase';
import { DashboardService } from './dashboard.service';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

type QueryResult = { data: any[]; error: null };
const result = (data: any[] = []): QueryResult => ({ data, error: null });

async function run() {
  const originalFrom = supabaseAdmin.from;
  const started: string[] = [];
  const filters: Array<{ table: string; column: string; value: unknown }> = [];
  const projects = deferred<QueryResult>();
  const milestones = deferred<QueryResult>();
  const roster = deferred<QueryResult>();

  (supabaseAdmin as any).from = (table: string) => {
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      range: () => query,
      eq: (column: string, value: unknown) => {
        filters.push({ table, column, value });
        return query;
      },
      in: (column: string, value: unknown) => {
        filters.push({ table, column, value });
        return query;
      },
      then: (resolve: (value: QueryResult) => void, reject: (reason: unknown) => void) => {
        started.push(table);
        const pending = table === 'projects' ? projects.promise
          : table === 'project_milestones' ? milestones.promise
          : table === 'users' && filters.some((filter) => filter.table === 'users' && filter.column === 'role') ? roster.promise
          : Promise.resolve(result());
        return pending.then(resolve, reject);
      },
    };
    return query;
  };

  try {
    const overview = DashboardService.getOverview({ userId: 'head-1', role: 'HEAD_SA' });
    await Promise.resolve();
    await Promise.resolve();
    assert(started.includes('users') && started.includes('projects'), 'HEAD_SA roster must start while projects are pending');
    assert(!started.includes('project_plan_approvals'), 'project plan query must wait for scoped project IDs');

    projects.resolve(result([{
      id: 'project-1', name: 'Test', customer: 'Customer', scenario_id: null,
      sales_id: 'sales-1', pic_id: 'sa-1', status: 'ACTIVE', is_postponed: false,
      estimated_revenue: null, final_contract_value: null,
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
    }]));
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    assert(started.includes('project_plan_approvals') && started.includes('project_milestones'), 'project plan approval must start before milestone query completes');
    assert(filters.some((filter) => filter.table === 'project_plan_approvals' && filter.column === 'project_id' && JSON.stringify(filter.value) === '["project-1"]'), 'project plan approval must stay scoped to project IDs');
    assert(filters.some((filter) => filter.table === 'users' && filter.column === 'role' && filter.value === 'SA'), 'HEAD_SA roster must retain SA role filter');
    assert(filters.some((filter) => filter.table === 'users' && filter.column === 'is_active' && filter.value === true), 'HEAD_SA roster must retain active filter');

    milestones.resolve(result());
    roster.resolve(result());
    const response = await overview;
    assert(response.summary.totalProjects === 1, 'overview response must still include scoped project');
    console.log('Dashboard independent query concurrency and scope: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
