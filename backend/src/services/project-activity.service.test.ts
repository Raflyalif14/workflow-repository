import { strict as assert } from 'assert';
import { supabaseAdmin } from '../config/supabase';
import { ProjectActivityError, ProjectActivityService } from './project-activity.service';
import { projectActivityQuerySchema } from '../validators/project-activity.validator';

type Row = Record<string, any>;
type ActivityState = {
  projects: Row[];
  activities: Row[];
  users: Row[];
};

const admin = { userId: 'admin-1', role: 'SUPER_ADMIN' };
const headSa = { userId: 'headsa-1', role: 'HEAD_SA' };
const salesOwner = { userId: 'sales-1', role: 'SALES' };
const salesOther = { userId: 'sales-2', role: 'SALES' };
const assignedSa = { userId: 'sa-1', role: 'SA' };
const unrelatedSa = { userId: 'sa-2', role: 'SA' };

const ids = {
  newest: '00000000-0000-4000-8000-000000000003',
  sameTimestamp: '00000000-0000-4000-8000-000000000002',
  oldest: '00000000-0000-4000-8000-000000000001',
};

const makeState = (): ActivityState => ({
  projects: [{ id: 'project-1', sales_id: 'sales-1', pic_id: 'sa-1' }],
  activities: [
    { id: ids.oldest, project_id: 'project-1', user_id: 'deleted-user', action: 'PROJECT_CREATED', description: 'Created', created_at: '2026-09-01T08:00:00.000Z' },
    { id: ids.sameTimestamp, project_id: 'project-1', user_id: 'sales-1', action: 'PROJECT_PLAN_SUBMITTED', description: 'Submitted', created_at: '2026-09-02T08:00:00.000Z' },
    { id: ids.newest, project_id: 'project-1', user_id: 'headsa-1', action: 'PROJECT_PLAN_APPROVED', description: 'Approved', created_at: '2026-09-02T08:00:00.000Z' },
  ],
  users: [
    { id: 'sales-1', full_name: 'Sales Owner', role: 'SALES', email: 'private@example.test' },
    { id: 'headsa-1', full_name: 'Head SA', role: 'HEAD_SA', email: 'private@example.test' },
  ],
});

class QueryMock {
  private filters: Array<[string, unknown]> = [];
  private ids: string[] = [];
  private cursor = '';
  private max = Number.POSITIVE_INFINITY;
  private single = false;

  constructor(private readonly state: ActivityState, private readonly table: string) {}
  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  in(_column: string, values: string[]) { this.ids = values; return this; }
  order() { return this; }
  limit(value: number) { this.max = value; return this; }
  or(value: string) { this.cursor = value; return this; }
  maybeSingle() { this.single = true; return this; }
  then(resolve: (value: { data: any; error: any }) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve().then(() => this.execute()).then(resolve, reject);
  }

  private execute() {
    const source = this.table === 'projects'
      ? this.state.projects
      : this.table === 'activity_logs'
        ? this.state.activities
        : this.state.users;
    let rows = source.filter((row) => this.filters.every(([column, value]) => row[column] === value));
    if (this.ids.length) rows = rows.filter((row) => this.ids.includes(row.id));

    if (this.table === 'activity_logs') {
      const match = this.cursor.match(/created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^)]+)\)/);
      if (match) {
        const [, olderThan, sameTimestamp, lowerId] = match;
        rows = rows.filter((row) => row.created_at < olderThan || (row.created_at === sameTimestamp && row.id < lowerId));
      }
      rows = rows.sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id));
    }

    const data = rows.slice(0, this.max).map((row) => ({ ...row }));
    return { data: this.single ? data[0] || null : data, error: null };
  }
}

async function withState<T>(state: ActivityState, action: () => Promise<T>): Promise<T> {
  const originalFrom = supabaseAdmin.from;
  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(state, table);
    return await action();
  } finally {
    supabaseAdmin.from = originalFrom;
  }
}

async function run() {
  await withState(makeState(), async () => {
    const firstPage = await ProjectActivityService.list('project-1', { limit: 2 }, admin);
    assert.deepEqual(firstPage.items.map((item) => item.id), [ids.newest, ids.sameTimestamp], 'Test 1: activities are newest-first with ID tie-breaking');
    assert(firstPage.nextCursor, 'Test 1: a full page with more rows returns a cursor');
    assert.deepEqual(firstPage.items[0].actor, { id: 'headsa-1', name: 'Head SA', role: 'HEAD_SA' }, 'Test 1: actor is safely resolved');
    assert.deepEqual(Object.keys(firstPage.items[0].actor || {}).sort(), ['id', 'name', 'role'], 'Test 1: actor exposes only safe fields');

    const secondPage = await ProjectActivityService.list('project-1', { limit: 2, cursor: firstPage.nextCursor! }, admin);
    assert.deepEqual(secondPage.items.map((item) => item.id), [ids.oldest], 'Test 2: cursor pagination continues after equal timestamps without duplicates');
    assert.equal(secondPage.nextCursor, null, 'Test 2: final page has no cursor');
    assert.equal(secondPage.items[0].actor, null, 'Test 2: a missing actor maps to null');
    console.log('Test 1-2 - Stable newest-first cursor pagination and safe actor mapping: passed');
  });

  await withState(makeState(), async () => {
    for (const actor of [admin, headSa, salesOwner, assignedSa]) {
      assert.equal((await ProjectActivityService.list('project-1', { limit: 1 }, actor)).items.length, 1);
    }
    console.log('Test 3 - SUPER_ADMIN, HEAD_SA, owning SALES, and assigned SA can read project activities: passed');
  });

  await withState(makeState(), async () => {
    for (const actor of [salesOther, unrelatedSa]) {
      await assert.rejects(
        () => ProjectActivityService.list('project-1', { limit: 1 }, actor),
        (error: unknown) => error instanceof ProjectActivityError && error.statusCode === 404
      );
    }
    console.log('Test 4 - Unrelated SALES and SA are non-disclosed: passed');
  });

  const defaults = projectActivityQuerySchema.parse({});
  assert.equal(defaults.limit, 25, 'Test 5: default page size is 25');
  assert.throws(() => projectActivityQuerySchema.parse({ limit: 51 }), 'Test 5: page size is capped at 50');
  await withState(makeState(), async () => {
    await assert.rejects(
      () => ProjectActivityService.list('project-1', { limit: 1, cursor: 'not-a-valid-cursor' }, admin),
      (error: unknown) => error instanceof ProjectActivityError && error.statusCode === 422
    );
  });
  console.log('Test 5 - Limit and cursor validation: passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
