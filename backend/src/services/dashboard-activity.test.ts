import assert from 'node:assert/strict';
import express from 'express';
import { supabaseAdmin } from '../config/supabase';
import dashboardRouter from '../routes/dashboard.routes';
import { DashboardService } from './dashboard.service';

type Row = Record<string, any>;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profiles: Row[] = ['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN', 'SA', 'SALES'].map((role, n) => ({
  id: id(100 + n), role, full_name: 'Fixture actor', is_active: true, must_change_password: false,
  email: 'fixture@example.test', preferred_language: 'en',
}));
profiles.push({ ...profiles[0], id: id(110), is_active: false }, { ...profiles[0], id: id(111), must_change_password: true });
const project = (n: number, sales = profiles[0].id, pic = profiles[1].id) => ({ id: id(200 + n), name: 'Fixture project',
  sales_id: sales, pic_id: pic, status: 'ACTIVE', is_postponed: false, scenario_id: null,
  estimated_revenue: null, final_contract_value: null, updated_at: '2026-10-08T00:00:00Z' });
let projects: Row[] = [], activities: Row[] = [], failActivities = false;
const calls: Array<{ table: string; projection: string; scope?: string[]; order: string[]; limit: number; cursor: string }> = [];
class Query {
  projection = ''; filters: Array<[string, any]> = []; excluded: Array<[string, any]> = [];
  scope?: string[]; orders: Array<[string, boolean]> = []; max = Infinity; start = 0; end = Infinity; cursor = ''; one = false;
  constructor(readonly table: string) {}
  select(value: string) { this.projection = value; return this; }
  eq(column: string, value: any) { this.filters.push([column, value]); return this; }
  neq(column: string, value: any) { this.excluded.push([column, value]); return this; }
  in(column: string, values: string[]) { this.filters.push([column, values]); if (column === 'project_id') this.scope = values; return this; }
  order(column: string, options: { ascending: boolean }) { this.orders.push([column, options.ascending]); return this; }
  limit(value: number) { this.max = value; return this; }
  range(start: number, end: number) { this.start = start; this.end = end; return this; }
  or(value: string) { this.cursor = value; return this; }
  single() { this.one = true; return this; }
  then(resolve: any, reject?: any) { return Promise.resolve().then(() => this.execute()).then(resolve, reject); }
  execute() {
    calls.push({ table: this.table, projection: this.projection, scope: this.scope, order: this.orders.map(([col, asc]) => `${col}:${asc}`), limit: this.max, cursor: this.cursor });
    if (this.table === 'activity_logs' && failActivities) return { data: null, error: { code: 'FIXTURE_FAILURE' } };
    let rows = [...(this.table === 'projects' ? projects : this.table === 'activity_logs' ? activities : this.table === 'users' ? profiles : [])];
    rows = rows.filter(row => this.filters.every(([col, val]) => Array.isArray(val) ? val.includes(row[col]) : row[col] === val)
      && this.excluded.every(([col, val]) => row[col] !== val));
    if (this.cursor) {
      const match = /^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.([0-9a-f-]+)\)$/.exec(this.cursor)!;
      assert(match && match[1] === match[2], 'Only the validated tuple predicate reaches the query');
      rows = rows.filter(row => row.created_at < match[1] || row.created_at === match[1] && row.id < match[3]);
    }
    rows.sort((a, b) => {
      for (const [col, asc] of this.orders) { const result = String(a[col]).localeCompare(String(b[col])); if (result) return asc ? result : -result; }
      return 0;
    });
    rows = rows.slice(this.start, Math.min(this.end + 1, this.start + this.max));
    // Enforce the actual projection so tests catch accidental sensitive response fields.
    rows = rows.map(row => Object.fromEntries(this.projection.split(',').map(key => key.trim()).filter(key => !key.includes(':')).map(key => [key, row[key]])));
    return { data: this.one ? rows[0] || null : rows, error: null };
  }
}
const fixture = (count: number, sameTime = false) => {
  calls.length = 0; failActivities = false;
  projects = [project(0), project(1, profiles[5].id, profiles[4].id)];
  activities = Array.from({ length: count }, (_, n) => ({ id: id(count - n), project_id: projects[0].id, user_id: profiles[0].id,
    action: 'PROJECT_CREATED', description: 'Fixture activity', created_at: sameTime ? '2026-10-08T12:00:00.123456+00:00' : new Date(Date.UTC(2026, 9, 8, 12) - n * 60_000).toISOString() }));
  // Unauthorized and private rows are newer than every visible row: filtering must precede limit/cursor.
  activities.push({ ...activities[0], id: id(90), project_id: projects[1].id, user_id: profiles[5].id, action: 'PROJECT_CREATED', description: 'Other scope', created_at: '2026-10-09T12:00:00Z' },
    { id: id(91), project_id: projects[0].id, user_id: profiles[0].id, action: 'DOCUMENT_ACCESS_CHANGED', description: 'Private audit', created_at: '2026-10-10T12:00:00Z' });
};
async function run() {
  const originalFrom = supabaseAdmin.from, originalGetUser = supabaseAdmin.auth.getUser, originalError = console.error;
  (supabaseAdmin as any).from = (table: string) => new Query(table);
  (supabaseAdmin.auth as any).getUser = async (token: string) => ({ data: { user: profiles.find(p => p.id === token) || null }, error: null });
  const app = express(); app.use('/api/dashboard', dashboardRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address() as { port: number };
  const http = async (path: string, actor?: Row) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/dashboard${path}`, { headers: actor ? { Authorization: `Bearer ${actor.id}` } : {} });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    for (const count of [0, 8, 9, 17, 24]) {
      fixture(count);
      let cursor: string | undefined, seen: string[] = [];
      do {
        const page = await DashboardService.getActivityPage({ userId: profiles[0].id, role: 'SALES' }, cursor);
        assert.equal(page.pageSize, 8); assert(page.items.length <= 8);
        if (!cursor) { assert.equal(page.items.length, Math.min(8, count)); assert.equal(Boolean(page.nextCursor), count > 8); }
        assert(page.items.every(item => item.project?.id === projects[0].id));
        assert(!JSON.stringify(page).includes('fixture@example.test') && !JSON.stringify(page).includes('Private audit'));
        seen.push(...page.items.map(item => item.id)); cursor = page.nextCursor || undefined;
      } while (cursor);
      assert.deepEqual(seen, Array.from({ length: count }, (_, n) => id(count - n)), 'Reach every older authorized activity once');
      const reads = calls.filter(call => call.table === 'activity_logs');
      assert(reads.every(call => call.limit === 9 && call.scope?.length === 1 && call.scope[0] === projects[0].id));
      assert(reads.every(call => call.order.join(',') === 'created_at:false,id:false'));
    }
    fixture(19, true);
    const first = await http('/activity', profiles[0]); assert.equal(first.status, 200);
    assert.deepEqual(first.body.data.items.map((row: Row) => row.id), Array.from({ length: 8 }, (_, n) => id(19 - n)));
    const cursor = first.body.data.nextCursor;
    assert.equal(JSON.parse(Buffer.from(cursor, 'base64url').toString()).createdAt, '2026-10-08T12:00:00.123456+00:00', 'Preserve microseconds in cursor');
    const second = await http(`/activity?cursor=${cursor}`, profiles[0]); assert.equal(second.status, 200);
    assert.deepEqual(second.body.data.items.map((row: Row) => row.id), Array.from({ length: 8 }, (_, n) => id(11 - n)));
    const third = await http(`/activity?cursor=${second.body.data.nextCursor}`, profiles[0]);
    assert.deepEqual(third.body.data.items.map((row: Row) => row.id), [id(3), id(2), id(1)]); assert.equal(third.body.data.nextCursor, null);
    assert.deepEqual((await http('/activity', profiles[0])).body.data.items, first.body.data.items, 'Previous first-page cursor replays the same stable order');
    activities.push({ ...activities[0], id: id(99), created_at: '2026-10-09T13:00:00Z' });
    assert.deepEqual((await http(`/activity?cursor=${cursor}`, profiles[0])).body.data.items, second.body.data.items, 'New inserts above cursor do not shift older pages');
    for (const actor of profiles.slice(0, 6)) {
      const result = await http(`/activity?cursor=${cursor}`, actor); assert.equal(result.status, 200);
      const allowed = projects.filter(p => actor.role === 'HEAD_SA' || actor.role === 'SUPER_ADMIN' || (actor.role === 'SALES' ? p.sales_id : p.pic_id) === actor.id).map(p => p.id);
      assert(result.body.data.items.every((item: Row) => allowed.includes(item.project.id)), 'Scope applies even to a cursor from another actor');
    }
    projects[0].pic_id = profiles[4].id;
    assert.equal((await http(`/activity?cursor=${cursor}`, profiles[1])).body.data.items.length, 0, 'Reassignment revokes later-page access immediately');
    assert.equal((await http('/activity')).status, 401);
    for (const actor of profiles.slice(6)) { const start = calls.filter(c => c.table === 'activity_logs').length; assert([401, 403].includes((await http('/activity', actor)).status)); assert.equal(calls.filter(c => c.table === 'activity_logs').length, start); }
    assert.equal((await http('/activity?cursor=bad', profiles[0])).status, 422);
    const unsafe = Buffer.from(JSON.stringify({ createdAt: '2026-10-08T00:00:00Z),id.gt.0', id: id(1) })).toString('base64url');
    assert.equal((await http(`/activity?cursor=${unsafe}`, profiles[0])).status, 422);
    const overview = await http('/', profiles[0]); assert.equal(overview.status, 200);
    assert.equal(overview.body.data.recentActivity.length, 8, 'Existing overview still returns an array of eight');
    assert(overview.body.data.recentActivityPagination.nextCursor && !('total' in overview.body.data.recentActivityPagination));
    fixture(1); projects = Array.from({ length: 251 }, (_, n) => project(n));
    activities[0].project_id = projects[250].id;
    assert.deepEqual((await http('/activity', profiles[0])).body.data.items.map((item: Row) => item.project.id), [projects[1].id, projects[250].id], 'Full scope includes the 251st project while keeping the newer now-authorized row first');
    console.error = () => {}; failActivities = true;
    const failed = await http('/activity', profiles[0]); assert.equal(failed.status, 500); assert.equal(failed.body.success, false); assert.equal(failed.body.data, undefined); assert(!JSON.stringify(failed.body).includes('FIXTURE_FAILURE'));
    failActivities = false; assert.equal((await http('/activity', profiles[0])).status, 200);
    console.log('Dashboard activity HTTP/service: 0/8/9/17/24, real cursor boundaries, same timestamps/microseconds, scope before paging, account guards, replay, insert/revoke, full scope, compatibility and safe errors passed');
  } finally {
    console.error = originalError; (supabaseAdmin as any).from = originalFrom; (supabaseAdmin.auth as any).getUser = originalGetUser;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
