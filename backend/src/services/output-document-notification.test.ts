import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin } from '../config/supabase';
import { OutputDocumentService } from './output-document.service';
import { OutputNotificationOutboxWorker } from './output-notification-outbox.worker';

const projectId = 'project-notification';
const actors = {
  pic: { userId: 'pic-1', role: 'SA', fullName: 'Assigned PIC' },
  headSa: { userId: 'head-1', role: 'HEAD_SA', fullName: 'Head SA' },
  sales: { userId: 'sales-1', role: 'SALES', fullName: 'Sales Owner' },
};

type OutputRow = Record<string, any>;
type Notification = Record<string, unknown>;
type State = { outputs: OutputRow[]; notifications: Notification[]; pending: Notification[]; failedDocumentIds: Set<string>; failDelivery: boolean };

const makeState = (status: 'DRAFT' | 'IN_REVIEW'): State => ({
  outputs: [
    { id: 'output-success', project_id: projectId, document_key: 'proposal_teknis', status, file_name: 'proposal.pdf', current_version_id: 'version-success' },
    { id: 'output-fail', project_id: projectId, document_key: 'timeline_proyek', status, file_name: 'timeline.pdf', current_version_id: 'version-fail' },
  ],
  notifications: [],
  pending: [],
  failedDocumentIds: new Set(['output-fail']),
  failDelivery: false,
});

class QueryMock {
  private readonly filters: Array<{ column: string; value: unknown }> = [];

  constructor(private readonly state: State, private readonly table: string) {}

  select(): this { return this; }
  eq(column: string, value: unknown): this { this.filters.push({ column, value }); return this; }
  order(): this { return this; }
  insert(): this { return this; }
  maybeSingle(): Promise<{ data: unknown; error: null }> { return Promise.resolve(this.execute(true)); }
  single(): Promise<{ data: unknown; error: null }> { return Promise.resolve(this.execute(true)); }
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> { return Promise.resolve(this.execute(false)).then(onfulfilled, onrejected); }

  private value(column: string): unknown { return this.filters.find((filter) => filter.column === column)?.value; }

  private execute(single: boolean): { data: unknown; error: null } {
    if (this.table === 'projects') {
      return { data: single ? {
        id: projectId,
        name: 'Notification Project',
        scenario_id: 'scenario-1',
        sales_id: actors.sales.userId,
        pic_id: actors.pic.userId,
        status: 'ACTIVE',
        is_postponed: false,
        selected_document_keys: [],
        scenario: { name: 'On Submission Tender' },
      } : [], error: null };
    }
    if (this.table === 'project_output_documents') {
      const rows = this.state.outputs.filter((row) =>
        (!this.value('project_id') || row.project_id === this.value('project_id'))
        && (!this.value('document_key') || row.document_key === this.value('document_key'))
      );
      return { data: single ? (rows[0] || null) : rows, error: null };
    }
    if (this.table === 'users') {
      return { data: this.value('role') === 'HEAD_SA' ? [{ id: actors.headSa.userId }] : [], error: null };
    }
    return { data: single ? null : [], error: null };
  }
}

async function withState<T>(status: 'DRAFT' | 'IN_REVIEW', action: (state: State) => Promise<T>): Promise<T> {
  const state = makeState(status);
  const originalFrom = supabaseAdmin.from;
  const originalRpc = supabaseAdmin.rpc;
  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(state, table);
    (supabaseAdmin as any).rpc = async (name: string, input: Record<string, unknown>) => {
      if (name === 'deliver_pending_output_notifications') {
        if (state.failDelivery) return { data: state.pending.map(() => ({ failed: true })), error: null };
        for (const notification of state.pending.splice(0)) state.notifications.push(notification);
        return { data: [], error: null };
      }
      const row = state.outputs.find((item) => item.id === input.p_output_document_id);
      if (!row || state.failedDocumentIds.has(row.id)) return { data: null, error: { code: '40001' } };
      const action = input.p_action;
      if ((action === 'SUBMIT' && row.status !== 'DRAFT') || (action !== 'SUBMIT' && row.status !== 'IN_REVIEW')) {
        return { data: null, error: { code: '40001' } };
      }
      row.status = action === 'SUBMIT' ? 'IN_REVIEW' : action === 'APPROVE' ? 'APPROVED' : 'REVISION_REQUIRED';
      const recipients = action === 'SUBMIT' ? [actors.headSa.userId]
        : action === 'APPROVE' ? [actors.pic.userId, actors.sales.userId] : [actors.pic.userId];
      for (const userId of recipients) {
        state.pending.push({
          userId,
          actionUrl: `/projects/${projectId}#output-documents`,
          message: row.document_key === 'proposal_teknis' ? 'Proposal Teknis' : 'Timeline Proyek',
        });
      }
      return { data: null, error: null };
    };
    return await action(state);
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (supabaseAdmin as any).rpc = originalRpc;
  }
}

const batch = [
  { document_key: 'proposal_teknis', expected_version_id: 'version-success' },
  { document_key: 'timeline_proyek', expected_version_id: 'version-fail' },
];

async function main(): Promise<void> {
  await withState('DRAFT', async (state) => {
    const result = await OutputDocumentService.submitOutputDocuments(projectId, { items: batch }, actors.pic);
    assert.equal(result.success, false, 'Partial submit must report partial failure');
    assert.equal(state.notifications.length, 1, 'Only successful output submission sends one HEAD_SA notification');
    const notification = state.notifications[0];
    assert.equal(notification.userId, actors.headSa.userId, 'Submit notifications go only to HEAD_SA');
    assert.equal(notification.actionUrl, `/projects/${projectId}#output-documents`, 'Submit notifications deep-link to Output Documents');
    assert(String(notification.message).includes('Proposal Teknis') && !String(notification.message).includes('Timeline Proyek'), 'Partial submit notifications name successful outputs only');
    await OutputDocumentService.submitOutputDocuments(projectId, { items: batch }, actors.pic);
    assert.equal(state.notifications.length, 1, 'Retrying an already transitioned or failed batch must not duplicate notifications');
    console.log('Test 1 - Partial output submission names only successful files, deep-links, and does not duplicate on retry: passed');
  });

  await withState('DRAFT', async (state) => {
    state.failedDocumentIds.add('output-success');
    const result = await OutputDocumentService.submitOutputDocuments(projectId, { items: batch }, actors.pic);
    assert.equal(result.success, false, 'An all-failed submit must report failure');
    assert.equal(state.notifications.length, 0, 'An all-failed submit must not notify HEAD_SA');
    console.log('Test 2 - All-failed output submission does not send a notification: passed');
  });

  await withState('IN_REVIEW', async (state) => {
    await OutputDocumentService.reviewOutputDocument(projectId, { decision: 'APPROVE', items: batch }, actors.headSa);
    assert.equal(state.notifications.length, 2, 'Successful approval notifies PIC and Sales owner only');
    const recipients = state.notifications.map((notification) => notification.userId).sort();
    assert.deepEqual(recipients, [actors.pic.userId, actors.sales.userId].sort(), 'Approval recipients are PIC and Sales owner');
    assert(state.notifications.every((notification) => notification.actionUrl === `/projects/${projectId}#output-documents`), 'Approval notifications deep-link to Output Documents');
    assert(state.notifications.every((notification) => String(notification.message).includes('Proposal Teknis') && !String(notification.message).includes('Timeline Proyek')), 'Approval names successful output only');
    await OutputDocumentService.reviewOutputDocument(projectId, { decision: 'APPROVE', items: batch }, actors.headSa);
    assert.equal(state.notifications.length, 2, 'Duplicate approval transition does not notify again');
    console.log('Test 3 - Approval notifies PIC and Sales only for successfully approved outputs: passed');
  });

  await withState('IN_REVIEW', async (state) => {
    await OutputDocumentService.reviewOutputDocument(projectId, { decision: 'REVISE', feedback: 'Please revise.', items: [batch[0]] }, actors.headSa);
    assert.equal(state.notifications.length, 1, 'Revision request sends one notification');
    assert.equal(state.notifications[0].userId, actors.pic.userId, 'Revision request does not notify Sales');
    assert(String(state.notifications[0].message).includes('Proposal Teknis'), 'Revision request names the revised output');
    console.log('Test 4 - Revision requests notify the assigned PIC only: passed');
  });

  await withState('DRAFT', async (state) => {
    state.failDelivery = true;
    const result = await OutputDocumentService.submitOutputDocuments(projectId, { items: [batch[0]] }, actors.pic);
    assert.equal(result.success, true, 'Notification failure must not falsify a durable output transition');
    assert.equal(state.notifications.length, 0);
    assert.equal(state.pending.length, 1, 'Failed delivery must remain pending');
    state.failDelivery = false;
    await OutputNotificationOutboxWorker.runOnceBestEffort();
    await OutputNotificationOutboxWorker.runOnceBestEffort();
    assert.equal(state.notifications.length, 1, 'Retry and duplicate retry must deliver exactly once');
    assert.equal(state.pending.length, 0);
    console.log('Test 5 - Durable pending notification retries once without duplicate delivery: passed');
  });

  const migration = readFileSync(join(__dirname, '../../supabase/phase15-output-notification-outbox.sql'), 'utf8');
  assert(migration.includes('after update of status on public.project_output_documents'));
  assert(migration.includes('unique (output_document_id, version_id, event_status, recipient_user_id)'));
  assert(migration.includes('for update skip locked'));
  assert(migration.includes('on conflict (notification_id, channel) do nothing'));
  console.log('Test 6 - Migration defines transactional enqueue and idempotent delivery: passed');

  const diagnostics = readFileSync(join(__dirname, '../../supabase/phase16-output-notification-outbox-diagnostics.sql'), 'utf8');
  assert(diagnostics.includes('last_error_category = case SQLSTATE'), 'Retry failures must receive a bounded category');
  assert(diagnostics.includes('last_attempt_at = now()') && diagnostics.includes('attempt_count = attempt_count + 1'), 'Retry failures must retain time and attempt count');
  assert(diagnostics.includes('for update skip locked') && diagnostics.includes('on conflict (notification_id, channel) do nothing'), 'Idempotent delivery mechanics must remain');
  assert(!/last_error\s*=\s*SQLERRM|last_error\s*=\s*SQLSTATE/i.test(diagnostics), 'Provider details must not be stored in last_error');
  console.log('Test 7 - Outbox diagnostics capture category, attempt time, and count without provider text: passed');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Output notification test failed.');
  process.exitCode = 1;
});
