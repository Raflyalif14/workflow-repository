import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { supabaseAdmin } from '../config/supabase';
import { ENV } from '../config/env';
import { NotificationService, NotificationServiceError } from './notification.service';
import { ProjectPhaseService } from './project-phase.service';
import { TelegramRetryWorker } from './telegram-retry-worker.service';
import { TelegramDeliveryService } from './telegram-delivery.service';

type StoredRow = Record<string, any>;
type Preferences = { in_app_enabled: boolean; telegram_enabled: boolean; telegram_chat_id: string | null };

// SQL is NOT executed. Tie the channel matrix to the actual migration's predicates,
// then exercise the real API and worker against the resulting mock storage rows.
const sql = readFileSync(join(__dirname, '../../supabase/phase25-pra-tender-sales-decision.sql'), 'utf8');
const close = sql.slice(sql.indexOf('function public.close_project_at_pra_tender('), sql.indexOf('\nrevoke all on function'));
const recipients = close.slice(close.indexOf('with recipients as ('), close.indexOf('), inserted as ('));
const inAppDefault = /coalesce\(np\.in_app_enabled,(true|false)\) as in_app_visible/.exec(recipients);
const telegramDefault = /coalesce\(np\.telegram_enabled,(true|false)\) and nullif\(btrim\(np\.telegram_chat_id\),''\) is not null as telegram_eligible/.exec(recipients);
assert(inAppDefault && telegramDefault, 'Channel eligibility must be captured independently from the same preference snapshot');
assert.equal(inAppDefault[1], 'true'); assert.equal(telegramDefault[1], 'false');
assert(!recipients.includes('where np.in_app_enabled') && !recipients.includes('and coalesce(np.in_app_enabled'), 'Recipient scope cannot be gated by in-app');
assert(recipients.includes("u.is_active and (u.role = 'HEAD_SA' or u.id = v_p.pic_id)"));
assert(close.includes('action_url,in_app_visible)') && close.includes("'#project-phase-panel',r.in_app_visible"), 'Persist visibility with the notification');
assert(close.includes('from recipients r where r.in_app_visible or r.telegram_eligible'), 'A record is needed for either eligible channel');
const delivery = close.slice(close.indexOf('insert into public.notification_deliveries'), close.indexOf('return query select v_phase.id,true'));
assert(delivery.includes('join recipients r on r.id = i.user_id') && delivery.includes('where r.telegram_eligible;'));
assert(!delivery.includes('in_app_visible') && !delivery.includes('notification_preferences'), 'Telegram uses the captured Telegram flag, never the in-app flag');
assert(close.indexOf('return query select v_phase.id,false; return;') < close.indexOf('with recipients as ('), 'Saved Close must return before inserting either channel');
assert(close.indexOf('for update') < close.indexOf('with recipients as ('), 'Project lock and actor guards remain before channel writes');
assert(sql.includes('in_app_visible boolean not null default true'), 'Existing producers/records retain their visibility');

const captureChannels = (prefs: Preferences | null) => {
  const inApp = prefs?.in_app_enabled ?? (inAppDefault![1] === 'true');
  const telegram = (prefs?.telegram_enabled ?? (telegramDefault![1] === 'true')) && Boolean(prefs?.telegram_chat_id?.trim());
  return { inApp, telegram, record: inApp || telegram };
};

class Query {
  private filters: Array<[string, unknown]> = [];
  private columns = '';
  private head = false;
  private bounds?: [number, number];
  private updates?: StoredRow;
  private descending?: string;
  constructor(private tableRows: StoredRow[]) {}
  select(columns: string, options?: { head?: boolean }) { this.columns = columns; this.head = Boolean(options?.head); return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  order(column: string, options: { ascending: boolean }) { if (!options.ascending) this.descending = column; return this; }
  range(start: number, end: number) { this.bounds = [start, end]; return this; }
  update(value: StoredRow) { this.updates = value; return this; }
  private result(single = false) {
    let rows = this.tableRows.filter(row => this.filters.every(([column, value]) => row[column] === value));
    if (this.updates) rows.forEach(row => Object.assign(row, this.updates));
    const count = rows.length;
    if (this.descending) rows = [...rows].sort((a, b) => String(b[this.descending!]).localeCompare(String(a[this.descending!])));
    if (this.bounds) rows = rows.slice(this.bounds[0], this.bounds[1] + 1);
    const projected = this.columns ? rows.map(row => Object.fromEntries(this.columns.split(',').map(column => [column, row[column]]))) : rows;
    return { data: this.head ? null : single ? projected[0] || null : projected, count, error: null };
  }
  async single() { return this.result(true); }
  async maybeSingle() { return this.result(true); }
  then(resolve: (result: ReturnType<Query['result']>) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(this.result()).then(resolve, reject); }
}

async function main() {
  const from = supabaseAdmin.from, rpc = supabaseAdmin.rpc, send = TelegramDeliveryService.sendMessage;
  const token = ENV.TELEGRAM_BOT_TOKEN;
  try {
    ENV.TELEGRAM_BOT_TOKEN = 'mock-local-only';
    for (const [inApp, telegram] of [[false, false], [false, true], [true, false], [true, true]] as const) {
      const preferences: Preferences = { in_app_enabled: inApp, telegram_enabled: telegram, telegram_chat_id: 'mock-linked-chat' };
      const channels = captureChannels(preferences);
      assert.deepEqual(channels, { inApp, telegram, record: inApp || telegram });
      const notifications: StoredRow[] = [], deliveries: StoredRow[] = [];
      const project = { id: 'project', sales_id: 'sales', status: 'ACTIVE', is_postponed: false, active_phase_id: 'pra' };
      let saved = false, decisionActivities = 0, sends = 0;
      (supabaseAdmin as any).from = (table: string) => {
        if (table === 'projects') return new Query([project]);
        if (table === 'notifications') return new Query(notifications);
        if (table === 'notification_preferences') return new Query([{ user_id: 'head', ...preferences }]);
        if (table === 'notification_deliveries') return new Query(deliveries);
        throw new Error(`Unexpected table ${table}`);
      };
      (supabaseAdmin as any).rpc = async (name: string) => {
        if (name === 'claim_due_telegram_deliveries') return { data: deliveries.filter(row => row.status === 'FAILED').map(row => ({ ...row, attempt_count: 1 })), error: null };
        assert.equal(name, 'close_project_at_pra_tender');
        // Emulate the saved-decision receipt path, statically checked above.
        if (saved) return { data: [{ phase_id: 'pra', closed: false }], error: null };
        saved = true; decisionActivities++; project.status = 'COMPLETED';
        if (channels.record) notifications.push({ id: 'close-notification', user_id: 'head', type: 'PRA_TENDER_CLOSED', title: 'Close', message: 'Closed at Pra-Tender', in_app_visible: channels.inApp, is_read: false, created_at: '2026-10-06T12:00:00Z' });
        if (channels.telegram) deliveries.push({ id: 'delivery', notification_id: 'close-notification', status: 'FAILED', channel: 'TELEGRAM', failure_kind: 'RETRYABLE', attempt_count: 0 });
        return { data: [{ phase_id: 'pra', closed: true }], error: null };
      };
      const actor = { userId: 'sales', role: 'SALES', fullName: 'Sales' };
      const first = await ProjectPhaseService.closePraTender('project', actor);
      const replay = await ProjectPhaseService.closePraTender('project', actor);
      assert.equal(first.closed, true); assert.equal(replay.closed, false);
      assert.equal(decisionActivities, 1);
      assert.equal(notifications.length, Number(channels.record), 'Close retry cannot duplicate notification');
      assert.equal(deliveries.length, Number(telegram), 'Close retry cannot duplicate Telegram intent');
      const feed = await NotificationService.listForUser('head', { limit: 20, offset: 0, unread_only: false });
      assert.equal(feed.length, Number(inApp));
      assert.equal((await NotificationService.getUnreadCount('head')).unreadCount, Number(inApp));
      assert(feed.every(row => !('in_app_visible' in row)), 'Visibility metadata stays server-side');
      if (!inApp && telegram) {
        await assert.rejects(NotificationService.markAsRead('close-notification', 'head'), error => error instanceof NotificationServiceError && error.statusCode === 404);
        await NotificationService.markAllAsRead('head');
        assert.equal(notifications[0].is_read, false, 'In-app actions cannot mutate hidden transport records');
      }
      (TelegramDeliveryService as any).sendMessage = async () => { sends++; return { status: 'SUCCESS' }; };
      await TelegramRetryWorker.runOnceBestEffort();
      assert.equal(sends, Number(telegram), 'Real worker sends even with in-app disabled');
      if (telegram) assert.equal(deliveries[0].status, 'SENT');

      // Visibility is a persisted choice: reenabling in-app cannot reveal a
      // Telegram-only record. Preference edits plus Close retry cannot recreate it.
      preferences.in_app_enabled = !inApp;
      await ProjectPhaseService.closePraTender('project', actor);
      assert.equal(notifications.length, Number(channels.record));
      assert.equal(deliveries.length, Number(telegram));
      assert.equal((await NotificationService.listForUser('head', { limit: 20, offset: 0, unread_only: false })).length, Number(inApp));
    }

    assert.deepEqual(captureChannels(null), { inApp: true, telegram: false, record: true });
    for (const chat of [null, '', '  ']) assert.equal(captureChannels({ in_app_enabled: false, telegram_enabled: true, telegram_chat_id: chat }).record, false);
    const rows = [
      { id: 'hidden', user_id: 'head', in_app_visible: false, is_read: false, created_at: '2026-10-06T15:00:00Z' },
      { id: 'other-user', user_id: 'other', in_app_visible: true, is_read: false, created_at: '2026-10-06T14:00:00Z' },
      { id: 'visible-new', user_id: 'head', in_app_visible: true, is_read: false, created_at: '2026-10-06T13:00:00Z' },
      { id: 'visible-old', user_id: 'head', in_app_visible: true, is_read: false, created_at: '2026-10-06T12:00:00Z' },
    ];
    (supabaseAdmin as any).from = (table: string) => { assert.equal(table, 'notifications'); return new Query(rows); };
    assert.equal((await NotificationService.listForUser('head', { limit: 1, offset: 0, unread_only: true }))[0].id, 'visible-new');
    assert.equal((await NotificationService.listForUser('head', { limit: 1, offset: 1, unread_only: true }))[0].id, 'visible-old');
    assert.equal((await NotificationService.getUnreadCount('head')).unreadCount, 2, 'Filter precedes pagination and whole-feed count');
    await NotificationService.markAsRead('visible-new', 'head');
    await NotificationService.markAllAsRead('head');
    assert.equal(rows[0].is_read, false); assert.equal(rows[1].is_read, false);
    assert.equal((await NotificationService.getUnreadCount('head')).unreadCount, 0);
    console.log('Phase 25 channels: four combinations, mock Close replay, real API visibility/count/read filters, worker Telegram-only send and defaults passed; SQL statically checked, not executed.');
  } finally {
    (supabaseAdmin as any).from = from; (supabaseAdmin as any).rpc = rpc;
    TelegramDeliveryService.sendMessage = send; ENV.TELEGRAM_BOT_TOKEN = token;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
