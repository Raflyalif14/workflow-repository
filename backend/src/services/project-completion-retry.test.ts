import { strict as assert } from 'assert';
import { supabaseAdmin } from '../config/supabase';
import { NotificationService } from './notification.service';
import {
  ProjectCompletionRetryError,
  retryProjectCompletion,
} from './project-completion-retry.service';

type Row = Record<string, any>;
type State = {
  project: Row;
  milestones: Row[];
  outputDocuments: Row[];
  failProjectUpdate: boolean;
  activityLogs: Row[];
  notifications: Row[];
};

class QueryMock {
  private operation = 'select';
  private payload: Row = {};
  private filters: Array<[string, unknown]> = [];
  private expectsSingle = false;

  constructor(private state: State, private table: string) {}

  select() { return this; }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
  order() { return this; }
  update(payload: Row) { this.operation = 'update'; this.payload = payload; return this; }
  insert(payload: Row) { this.operation = 'insert'; this.payload = payload; return this; }
  single() { this.expectsSingle = true; return Promise.resolve(this.execute()); }
  maybeSingle() { return this.single(); }
  then(resolve: (value: { data: any; error: any }) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  private execute() {
    if (this.table === 'activity_logs' && this.operation === 'insert') {
      this.state.activityLogs.push(this.payload);
      return { data: null, error: null };
    }

    const source = this.table === 'projects'
      ? [this.state.project]
      : this.table === 'project_milestones'
        ? this.state.milestones
        : this.table === 'project_output_documents'
          ? this.state.outputDocuments
          : null;
    if (!source) throw new Error(`Unexpected table ${this.table}`);

    const matching = source.filter((row) => this.filters.every(([key, value]) => row[key] === value));
    if (this.operation === 'update') {
      if (this.table === 'projects' && this.state.failProjectUpdate) {
        return { data: null, error: { message: 'provider update failure' } };
      }
      for (const row of matching) Object.assign(row, this.payload);
    }

    const data = this.operation === 'update' || this.expectsSingle ? matching[0] || null : matching;
    return { data, error: null };
  }
}

const headSa = { userId: 'head-1', role: 'HEAD_SA', fullName: 'Head SA' };
const salesOwner = { userId: 'sales-1', role: 'SALES', fullName: 'Sales Owner' };

function createState(): State {
  return {
    project: { id: 'project-1', name: 'Retry Project', sales_id: salesOwner.userId, pic_id: 'sa-1', status: 'ACTIVE', is_postponed: false },
    milestones: [
      { id: 'milestone-1', project_id: 'project-1', name: 'Delivery', step_order: 1, status: 'COMPLETED', pic_id: 'sa-1', completed_at: '2026-09-22T00:00:00.000Z', workflow_stage: { default_role: 'SALES' } },
    ],
    outputDocuments: [{ id: 'output-1', project_id: 'project-1', is_required: true, is_selected: true, status: 'APPROVED' }],
    failProjectUpdate: false,
    activityLogs: [],
    notifications: [],
  };
}

async function withState(action: (state: State) => Promise<void>) {
  const state = createState();
  const originalFrom = supabaseAdmin.from;
  const originalCreateNotification = NotificationService.createNotification;
  try {
    (supabaseAdmin as any).from = (table: string) => new QueryMock(state, table);
    (NotificationService as any).createNotification = async (input: Row) => {
      state.notifications.push(input);
      return {};
    };
    await action(state);
  } finally {
    supabaseAdmin.from = originalFrom;
    (NotificationService as any).createNotification = originalCreateNotification;
  }
}

async function assertRetryError(action: () => Promise<unknown>, statusCode: number) {
  await assert.rejects(action, (error: unknown) => error instanceof ProjectCompletionRetryError && error.statusCode === statusCode);
}

async function run() {
  await withState(async () => {
    await assertRetryError(() => retryProjectCompletion('project-1', { userId: 'sa-other', role: 'SA', fullName: 'Other SA' }), 403);
  });
  console.log('Retry 1 - unauthorized actor is denied');

  await withState(async (state) => {
    state.outputDocuments[0].status = 'IN_REVIEW';
    await assertRetryError(() => retryProjectCompletion('project-1', headSa), 400);
  });
  console.log('Retry 2 - pending output is denied');

  await withState(async (state) => {
    state.outputDocuments = [];
    await assertRetryError(() => retryProjectCompletion('project-1', headSa), 400);
  });
  console.log('Retry 3 - missing output rows are denied');

  await withState(async (state) => {
    state.milestones[0].status = 'IN_PROGRESS';
    await assertRetryError(() => retryProjectCompletion('project-1', headSa), 400);
  });
  console.log('Retry 4 - unfinished milestone is denied');

  await withState(async (state) => {
    state.project.is_postponed = true;
    await assertRetryError(() => retryProjectCompletion('project-1', salesOwner), 400);
  });
  console.log('Retry 5 - postponed project is denied');

  await withState(async (state) => {
    state.failProjectUpdate = true;
    await assertRetryError(() => retryProjectCompletion('project-1', headSa), 500);
    assert.equal(state.project.status, 'ACTIVE');

    state.failProjectUpdate = false;
    const retried = await retryProjectCompletion('project-1', headSa);
    assert.equal(retried.status, 'WAITING_RESULT');
    assert.equal(retried.retried, true);
    assert.equal(state.project.status, 'WAITING_RESULT');
    assert.equal(state.notifications.length, 1);
    assert.equal(state.activityLogs.filter((entry) => entry.action === 'PROJECT_WAITING_RESULT').length, 1);

    const duplicate = await retryProjectCompletion('project-1', headSa);
    assert.equal(duplicate.status, 'WAITING_RESULT');
    assert.equal(duplicate.retried, false);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.activityLogs.filter((entry) => entry.action === 'PROJECT_WAITING_RESULT').length, 1);
  });
  console.log('Retry 6 - failed reconciliation recovers once and duplicate retry is idempotent');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
