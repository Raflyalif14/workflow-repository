import { supabaseAdmin } from '../config/supabase';
import { logWorkflowActivityBestEffort } from './workflow-progression.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

type ActivityState = {
  failInsert: boolean;
  inserts: Array<Record<string, unknown>>;
};

class ActivityLogQueryMock {
  private payload: Record<string, unknown> = {};

  constructor(private readonly state: ActivityState) {}

  insert(payload: Record<string, unknown>): this {
    this.payload = payload;
    return this;
  }

  then<TResult1 = { data: null; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    if (!this.state.failInsert) this.state.inserts.push(this.payload);
    const result = this.state.failInsert
      ? { data: null, error: { message: 'provider-specific activity database detail' } }
      : { data: null, error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

async function run(): Promise<void> {
  const state: ActivityState = { failInsert: true, inserts: [] };
  const actor = { userId: 'actor-1', role: 'HEAD_SA', fullName: 'Head SA Test' };
  const originalFrom = supabaseAdmin.from;
  const originalConsoleError = console.error;
  const errors: unknown[][] = [];

  try {
    (supabaseAdmin as any).from = (table: string) => {
      if (table !== 'activity_logs') throw new Error(`Unexpected table: ${table}`);
      return new ActivityLogQueryMock(state);
    };
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    await logWorkflowActivityBestEffort(actor, 'project-1', 'PROJECT_UPDATED', 'A durable project update');
    assert(errors.length === 1, 'Test 1: failed activity insert must be logged server-side');
    assert(!JSON.stringify(errors).includes('provider-specific activity database detail'), 'Test 1: server log must not contain provider detail');
    assert(state.inserts.length === 0, 'Test 1: failed provider insert must not be reported as persisted');

    state.failInsert = false;
    await logWorkflowActivityBestEffort(actor, 'project-1', 'PROJECT_UPDATED', 'A durable project update');
    assert(state.inserts.length === 1, 'Test 2: available activity logging must still persist the event');
    assert(state.inserts[0].action === 'PROJECT_UPDATED', 'Test 2: persisted activity must preserve the requested action');
    console.log('Test 1 - Activity insert failure is contained and provider detail is not logged: passed');
    console.log('Test 2 - Available activity logging still writes the audit event: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    console.error = originalConsoleError;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
