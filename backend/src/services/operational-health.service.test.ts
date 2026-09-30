import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { supabaseAdmin } from '../config/supabase';
import { cleanupMonitoringSchema, monitoringPageSchema } from '../controllers/operational-health.controller';
import { OperationalHealthService } from './operational-health.service';

type Row = Record<string, any>;
const outbox: Row[] = [
  { id: 'a', created_at: '2026-09-29T00:00:00Z', delivered_at: null, attempt_count: 4, last_attempt_at: '2026-09-30T00:00:00Z', last_error_category: 'UNKNOWN', last_error_sqlstate: '42702', last_error_operation: 'notification_deliveries.insert', message: 'secret', recipient_user_id: 'private' },
  { id: 'b', created_at: '2026-09-29T00:00:00Z', delivered_at: null, attempt_count: 0, last_attempt_at: null, last_error_category: null, last_error_sqlstate: null, last_error_operation: null, storage_path: 'private' },
  { id: 'c', created_at: '2026-09-28T00:00:00Z', delivered_at: '2026-09-29T00:00:00Z', attempt_count: 1, last_attempt_at: '2026-09-29T00:00:00Z' },
];
const cleanups: Row[] = [
  { id: 'new', created_at: '2026-09-30T00:00:00Z', updated_at: '2026-09-30T00:00:00Z', status: 'FAILED', storage_object_count: 2, failure_code: 'STORAGE_DELETE_FAILED', storage_paths: ['private'] },
  { id: 'old', created_at: '2026-09-29T00:00:00Z', updated_at: '2026-09-29T00:00:00Z', status: 'FAILED', storage_object_count: 1, failure_code: 'unsafe provider error', storage_paths: ['private'] },
  { id: 'done', created_at: '2026-09-28T00:00:00Z', updated_at: '2026-09-28T00:00:00Z', status: 'COMPLETED', storage_object_count: 1 },
];

async function main() {
  const originalFrom = supabaseAdmin.from;
  const selects: string[] = [];
  (supabaseAdmin as any).from = (table: string) => {
    let rows = table === 'output_notification_outbox' ? outbox : table === 'project_deletion_cleanups' ? cleanups : [];
    let columns = '';
    let head = false;
    const ordering: Array<{ key: string; ascending: boolean }> = [];
    let start = 0;
    let end = Infinity;
    let limit = Infinity;
    const query: any = {
      select: (fields: string, options?: { head?: boolean }) => { columns = fields; head = Boolean(options?.head); selects.push(`${table}:${fields}`); return query; },
      is: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return query; },
      not: (key: string, _operator: string, value: unknown) => { rows = rows.filter((row) => row[key] !== value); return query; },
      gt: (key: string, value: number) => { rows = rows.filter((row) => row[key] > value); return query; },
      eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return query; },
      order: (key: string, options: { ascending: boolean }) => { ordering.push({ key, ascending: options.ascending }); return query; },
      range: (from: number, to: number) => { start = from; end = to; return query; },
      limit: (value: number) => { limit = value; return query; },
      then: (resolve: (result: unknown) => unknown) => {
        const sorted = [...rows].sort((a, b) => {
          for (const { key, ascending } of ordering) {
            const comparison = String(a[key]).localeCompare(String(b[key]));
            if (comparison) return ascending ? comparison : -comparison;
          }
          return 0;
        });
        const data = head ? null : sorted.slice(start, end + 1).slice(0, limit).map((row) =>
          Object.fromEntries(columns.split(',').map((key) => [key, row[key] ?? null])));
        return Promise.resolve({ data, count: rows.length, error: null }).then(resolve);
      },
    };
    return query;
  };

  try {
    for (const role of ['SA', 'SALES', 'HEAD_SA']) {
      await assert.rejects(OperationalHealthService.outputOutbox({ role, isActive: true }, { page: 1, limit: 1 }), { statusCode: 403 });
      await assert.rejects(OperationalHealthService.storageCleanups({ role, isActive: true }, { page: 1, limit: 1 }, 'ALL'), { statusCode: 403 });
    }
    await assert.rejects(OperationalHealthService.outputOutbox({ role: 'SUPER_ADMIN', isActive: false }, { page: 1, limit: 1 }), { statusCode: 403 });
    await assert.rejects(OperationalHealthService.storageCleanups({ role: 'SUPER_ADMIN', isActive: false }, { page: 1, limit: 1 }, 'ALL'), { statusCode: 403 });
    assert.equal(selects.length, 0, 'unauthorized requests must not query monitoring tables');

    const admin = { role: 'SUPER_ADMIN', isActive: true };
    const first = await OperationalHealthService.outputOutbox(admin, { page: 1, limit: 1 });
    const second = await OperationalHealthService.outputOutbox(admin, { page: 2, limit: 1 });
    assert.deepEqual([first.summary.pending, first.summary.previouslyFailed, first.totalPages], [2, 1, 2]);
    assert(first.summary.oldestAgeSeconds !== null && first.summary.oldestAgeSeconds > 0);
    assert.deepEqual([first.items[0]?.id, second.items[0]?.id], ['b', 'a'], 'created_at tie must use id descending');
    assert.deepEqual([second.items[0]?.sqlstate, second.items[0]?.errorOperation], ['42702', 'notification_deliveries.insert']);
    assert(!JSON.stringify(first).includes('private') && !JSON.stringify(second).includes('secret'));

    const failed = await OperationalHealthService.storageCleanups(admin, { page: 1, limit: 1 }, 'FAILED');
    const failedSecond = await OperationalHealthService.storageCleanups(admin, { page: 2, limit: 1 }, 'FAILED');
    assert.deepEqual(failed.summary, { total: 3, pending: 0, failed: 2, completed: 1 });
    assert.deepEqual([failed.items[0]?.id, failedSecond.items[0]?.id, failed.totalPages], ['new', 'old', 2]);
    assert.equal(failedSecond.items[0]?.failureCode, null, 'unknown failure codes must not expose raw provider text');
    assert.equal(failed.items[0]?.attemptCount, null, 'cleanup attempts are not tracked by the current schema');
    assert(!JSON.stringify(failed).includes('storage_paths') && !JSON.stringify(failed).includes('private'));
    assert.equal((await OperationalHealthService.storageCleanups(admin, { page: 1, limit: 20 }, 'PENDING')).items.length, 0);
    assert(selects.every((selection) => !/storage_paths|message|recipient|token|email|signed|error_message/.test(selection)));
    outbox.splice(0);
    const emptyOutbox = await OperationalHealthService.outputOutbox(admin, { page: 1, limit: 20 });
    assert.deepEqual([emptyOutbox.summary.pending, emptyOutbox.summary.previouslyFailed, emptyOutbox.items.length], [0, 0, 0]);

    for (const invalid of [{ page: '0' }, { page: '1.5' }, { limit: '51' }, { page: ['1', '2'] }]) {
      assert(!monitoringPageSchema.safeParse(invalid).success, 'pagination must reject invalid values');
    }
    assert(!cleanupMonitoringSchema.safeParse({ status: 'UNKNOWN' }).success);
    const notificationRoutes = readFileSync(join(__dirname, '../routes/notification.routes.ts'), 'utf8');
    const projectRoutes = readFileSync(join(__dirname, '../routes/project.routes.ts'), 'utf8');
    assert(notificationRoutes.includes("'/admin/output-outbox', authenticateUser, requireRoles(['SUPER_ADMIN'])"));
    assert(projectRoutes.includes("'/deletion-cleanups', requireRoles(['SUPER_ADMIN'])"));
    assert(projectRoutes.includes("'/deletion-cleanups/:cleanupId/retry', requireRoles(['SUPER_ADMIN'])"));
    console.log('Operational health access, safe projection, summary, empty list, pagination, and retry policy: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
