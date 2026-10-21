import assert from 'node:assert/strict';
import express from 'express';
import { supabaseAdmin } from '../config/supabase';
import meRouter from '../routes/me.routes';
import { calendarMonthBounds, getDeadlineCalendar } from './deadline-calendar.service';

type Row = Record<string, any>;
const users: Row[] = ['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN', 'UNKNOWN'].map((role, index) => ({ id: `user-${index}`, role,
  email: 'private@example.invalid', full_name: 'Synthetic user', is_active: true, must_change_password: false }));
users.push({ ...users[0], id: 'inactive', is_active: false }, { ...users[0], id: 'password-required', must_change_password: true });
let projects: Row[] = [], milestones: Row[] = [], fail = '', calls: string[] = [];
class Query {
  fields = ''; filters: Array<(row: Row) => boolean> = []; orders: string[] = []; start = 0; end = 499; one = false;
  constructor(readonly table: string) {}
  select(fields: string) { this.fields = fields; return this; }
  eq(key: string, value: unknown) { this.filters.push(row => row[key] === value); return this; }
  in(key: string, values: string[]) { assert(values.length <= 100); this.filters.push(row => values.includes(row[key])); return this; }
  gte(key: string, value: string) { this.filters.push(row => row[key] != null && row[key] >= value); return this; }
  lt(key: string, value: string) { this.filters.push(row => row[key] != null && row[key] < value); return this; }
  order(key: string) { this.orders.push(key); return this; }
  range(start: number, end: number) { this.start = start; this.end = end; assert(end - start < 500); return this; }
  single() { this.one = true; return this; }
  then(resolve: any, reject: any) {
    return Promise.resolve().then(() => {
      calls.push(this.table);
      if (fail === this.table) return { data: null, error: { code: 'FIXTURE_FAILURE' } };
      let rows = [...(this.table === 'projects' ? projects : this.table === 'project_milestones' ? milestones : users)]
        .filter(row => this.filters.every(filter => filter(row)));
      rows.sort((a, b) => { for (const key of this.orders) { const result = String(a[key]).localeCompare(String(b[key])); if (result) return result; } return 0; });
      rows = rows.slice(this.start, this.end + 1).map(row => Object.fromEntries(this.fields.split(',').map(key => [key.trim(), row[key.trim()]])));
      return { data: this.one ? rows[0] || null : rows, error: null };
    }).then(resolve, reject);
  }
}
function seed(count = 2, perProject = 3) {
  calls = []; fail = '';
  projects = Array.from({ length: count }, (_, i) => ({ id: `project-${String(i).padStart(4, '0')}`, name: `Project ${i}`,
    status: 'ACTIVE', is_postponed: false, sales_id: i % 2 ? 'other-sales' : users[0].id,
    pic_id: i % 2 ? 'other-sa' : users[1].id, secret: 'must-not-leak' }));
  milestones = projects.flatMap(project => Array.from({ length: perProject }, (_, i) => ({ id: `${project.id}-${String(i).padStart(4, '0')}`,
    project_id: project.id, name: `Milestone ${i}`, status: 'IN_PROGRESS', due_date: `2026-10-${String(i % 31 + 1).padStart(2, '0')}`, secret: 'must-not-leak' })));
}
async function run() {
  const originalFrom = supabaseAdmin.from, originalGetUser = supabaseAdmin.auth.getUser;
  (supabaseAdmin as any).from = (table: string) => new Query(table);
  (supabaseAdmin.auth as any).getUser = async (token: string) => ({ data: { user: users.find(user => user.id === token) || null }, error: null });
  const app = express(); app.use('/api/me', meRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const { port } = server.address() as { port: number };
  const http = async (query: string, user?: Row) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/me/deadline-calendar${query}`, { headers: user ? { Authorization: `Bearer ${user.id}` } : {} });
    return { status: response.status, body: await response.json() as any, cache: response.headers.get('Cache-Control') };
  };
  try {
    assert.deepEqual(calendarMonthBounds('2026-12'), { month: '2026-12', from: '2026-12-01', until: '2027-01-01' });
    assert.deepEqual(calendarMonthBounds('2024-02'), { month: '2024-02', from: '2024-02-01', until: '2024-03-01' });
    seed();
    milestones.push({ ...milestones[0], id: 'prior', due_date: '2026-09-30' }, { ...milestones[0], id: 'next', due_date: '2026-11-01' }, { ...milestones[0], id: 'undated', due_date: null });
    for (const user of users.slice(0, 4)) {
      const result = await http('?month=2026-10', user);
      assert.equal(result.status, 200); assert.equal(result.cache, 'no-store');
      const data = result.body.data;
      assert.equal(data.items.length, ['SA', 'SALES'].includes(user.role) ? 3 : 6);
      assert.equal(data.month, '2026-10');
      assert(data.items.every((item: any) => item.dueDate.startsWith('2026-10-')));
      if (['SA', 'SALES'].includes(user.role)) assert(data.items.every((item: any) => item.project.id === projects[0].id));
      assert(!JSON.stringify(data).includes('must-not-leak') && !JSON.stringify(data).includes('private@'));
    }
    for (const month of ['', '?month=2026-00', '?month=2026-13', '?month=2026-1', '?month=0999-01', '?month=9999-01', '?month=2026-10&month=2026-11'])
      assert.equal((await http(month, users[0])).status, 400);
    assert.equal((await http('?month=2026-10')).status, 401);
    assert.equal((await http('?month=2026-10', users[4])).status, 403);
    assert.equal((await http('?month=2026-10', users[5])).status, 401);
    assert.equal((await http('?month=2026-10', users[6])).status, 403);
    seed(301, 11);
    const actor = { userId: users[2].id, role: users[2].role };
    const all = await getDeadlineCalendar(actor, '2026-10');
    assert.equal(all.items.length, 3311, 'No truncation above project and milestone page limits');
    assert.equal(new Set(all.items.map(item => item.id)).size, 3311);
    assert.deepEqual(all.items.map(item => `${item.dueDate}/${item.id}`), all.items.map(item => `${item.dueDate}/${item.id}`).sort());
    assert(calls.filter(table => table === 'projects').length >= 2);
    seed(0); assert.deepEqual((await getDeadlineCalendar(actor, '2026-10')).items, []);
    assert(!calls.includes('project_milestones'), 'No unscoped query when no projects are accessible');
    for (const table of ['projects', 'project_milestones']) {
      seed(); fail = table;
      const response = await http('?month=2026-10', users[2]);
      assert.equal(response.status, 503); assert.equal(response.body.data, undefined);
    }
    console.log('Deadline calendar: month boundaries, all role scopes, HTTP auth, private projection, paging beyond 3000 rows, empty and failure passed.');
  } finally {
    supabaseAdmin.from = originalFrom; supabaseAdmin.auth.getUser = originalGetUser;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
