import { readFileSync } from 'fs';
import { join } from 'path';
import { ENV } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import { TelegramRetryWorker } from './telegram-retry-worker.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

type ClaimedDelivery = {
  id: string;
  notification_id: string;
  attempt_count: number;
  last_attempt_at: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  action_url: string | null;
};

type PreferencesRow = {
  telegram_enabled: boolean;
  telegram_chat_id: string | null;
};

type QueryResult<T> = { data: T; error: unknown };

const trustedNotification: NotificationRow = {
  id: 'notification-1',
  user_id: 'trusted-user-id',
  title: 'Milestone Submitted',
  message: 'Customer Assessment is waiting for review.',
  action_url: '/approvals',
};

const linkedPreferences: PreferencesRow = {
  telegram_enabled: true,
  telegram_chat_id: 'trusted-chat-id',
};

const createClaim = (overrides: Partial<ClaimedDelivery> = {}): ClaimedDelivery => ({
  id: 'delivery-1',
  notification_id: 'notification-1',
  attempt_count: 2,
  last_attempt_at: '2026-09-02T00:00:00.000Z',
  ...overrides,
});

const asFetchResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

type WorkerMockOptions = {
  claims?: ClaimedDelivery[];
  notificationForId?: (notificationId: string) => QueryResult<NotificationRow | null>;
  preferencesForUser?: (userId: string) => QueryResult<PreferencesRow | null>;
  rpc?: () => Promise<QueryResult<ClaimedDelivery[]>>;
};

const setupWorkerMock = (options: WorkerMockOptions = {}) => {
  const updates: Array<{ deliveryId: string; value: Record<string, unknown> }> = [];
  const requestedPreferenceUserIds: string[] = [];
  let rpcCalls = 0;

  (supabaseAdmin as any).rpc = async () => {
    rpcCalls += 1;
    return options.rpc ? options.rpc() : { data: options.claims || [], error: null };
  };

  (supabaseAdmin as any).from = (table: string) => {
    if (table === 'notifications') {
      let notificationId = '';
      const query: any = {
        eq: (_column: string, value: string) => {
          notificationId = value;
          return query;
        },
        maybeSingle: async () =>
          options.notificationForId
            ? options.notificationForId(notificationId)
            : { data: trustedNotification, error: null },
      };
      return { select: () => query };
    }

    if (table === 'notification_preferences') {
      let userId = '';
      const query: any = {
        eq: (_column: string, value: string) => {
          userId = value;
          requestedPreferenceUserIds.push(value);
          return query;
        },
        maybeSingle: async () =>
          options.preferencesForUser
            ? options.preferencesForUser(userId)
            : { data: linkedPreferences, error: null },
      };
      return { select: () => query };
    }

    if (table === 'notification_deliveries') {
      return {
        update: (value: Record<string, unknown>) => ({
          eq: (_column: string, deliveryId: string) => {
            updates.push({ deliveryId, value });
            return { error: null };
          },
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  };

  return {
    updates,
    requestedPreferenceUserIds,
    getRpcCalls: () => rpcCalls,
  };
};

async function run(): Promise<void> {
  const originalFrom = supabaseAdmin.from;
  const originalRpc = (supabaseAdmin as any).rpc;
  const originalFetch = globalThis.fetch;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalConsoleError = console.error;
  const originalBotToken = ENV.TELEGRAM_BOT_TOKEN;

  try {
    ENV.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    let noDueFetchCalls = 0;
    (globalThis as any).fetch = async () => {
      noDueFetchCalls += 1;
      return asFetchResponse(200, { ok: true });
    };
    const noDue = setupWorkerMock();
    await TelegramRetryWorker.runOnceBestEffort();
    assert(noDue.getRpcCalls() === 1 && noDue.updates.length === 0 && noDueFetchCalls === 0, 'Test 1: no due delivery must be a no-op');
    console.log('Test 1 - No due deliveries exits without sending: passed');

    let successfulRequest: { url: string; body: Record<string, unknown> } | null = null;
    (globalThis as any).fetch = async (url: string, init: { body?: string }) => {
      successfulRequest = { url, body: JSON.parse(init.body || '{}') };
      return asFetchResponse(200, { ok: true });
    };
    const success = setupWorkerMock({ claims: [createClaim()] });
    await TelegramRetryWorker.runOnceBestEffort();
    const successfulUpdate = success.updates[0]?.value;
    const request = successfulRequest as { url: string; body: Record<string, unknown> } | null;
    assert(
      success.requestedPreferenceUserIds[0] === 'trusted-user-id' && request?.body.chat_id === 'trusted-chat-id',
      'Test 2: retry recipient and chat ID must come from trusted notification and preference data'
    );
    assert(
      successfulUpdate?.status === 'SENT' &&
        successfulUpdate?.failure_kind === null &&
        successfulUpdate?.next_retry_at === null &&
        !('attempt_count' in successfulUpdate) &&
        !('last_attempt_at' in successfulUpdate),
      'Test 2: successful retry must retain the atomically claimed attempt metadata'
    );
    console.log('Test 2 - Successful attempt-two retry marks SENT without rewriting claim metadata: passed');

    (globalThis as any).fetch = async () => asFetchResponse(429, { ok: false });
    const retryable = setupWorkerMock({ claims: [createClaim()] });
    await TelegramRetryWorker.runOnceBestEffort();
    const retryableUpdate = retryable.updates[0]?.value;
    assert(
      retryableUpdate?.status === 'FAILED' &&
        retryableUpdate?.failure_kind === 'RETRYABLE' &&
        typeof retryableUpdate?.next_retry_at === 'string' &&
        Date.parse(String(retryableUpdate.next_retry_at)) > Date.parse('2026-09-02T00:00:00.000Z'),
      'Test 3: HTTP 429 on attempt two must remain retryable with a next retry time'
    );
    console.log('Test 3 - HTTP 429 on attempt two remains RETRYABLE: passed');

    const retryLimit = setupWorkerMock({ claims: [createClaim({ attempt_count: 3 })] });
    await TelegramRetryWorker.runOnceBestEffort();
    const retryLimitUpdate = retryLimit.updates[0]?.value;
    assert(
      retryLimitUpdate?.failure_kind === 'TERMINAL' &&
        retryLimitUpdate?.next_retry_at === null &&
        retryLimitUpdate?.error_message === 'Telegram delivery retry limit reached.',
      'Test 4: HTTP 429 on attempt three must stop at the retry limit'
    );
    console.log('Test 4 - HTTP 429 on attempt three becomes TERMINAL: passed');

    for (const status of [503, 408]) {
      (globalThis as any).fetch = async () => asFetchResponse(status, { ok: false });
      const ambiguous = setupWorkerMock({ claims: [createClaim({ id: `delivery-${status}` })] });
      await TelegramRetryWorker.runOnceBestEffort();
      const ambiguousUpdate = ambiguous.updates[0]?.value;
      assert(
        ambiguousUpdate?.failure_kind === 'AMBIGUOUS' && ambiguousUpdate?.next_retry_at === null,
        `Test 5: HTTP ${status} must remain AMBIGUOUS without auto retry`
      );
    }
    console.log('Test 5 - HTTP 5xx and 408 remain AMBIGUOUS without retry scheduling: passed');

    for (const failure of [
      async () => {
        throw new Error('network failure with test-bot-token and trusted-chat-id');
      },
      async () => {
        const abortError = new Error('AbortError with test-bot-token and trusted-chat-id');
        abortError.name = 'AbortError';
        throw abortError;
      },
    ]) {
      (globalThis as any).fetch = failure;
      const ambiguous = setupWorkerMock({ claims: [createClaim()] });
      await TelegramRetryWorker.runOnceBestEffort();
      const ambiguousUpdate = ambiguous.updates[0]?.value;
      assert(
        ambiguousUpdate?.failure_kind === 'AMBIGUOUS' && ambiguousUpdate?.next_retry_at === null,
        'Test 6: network and abort failures must remain AMBIGUOUS without auto retry'
      );
    }
    console.log('Test 6 - Network and abort failures remain AMBIGUOUS: passed');

    (globalThis as any).fetch = async () => asFetchResponse(400, { ok: false });
    const terminal = setupWorkerMock({ claims: [createClaim()] });
    await TelegramRetryWorker.runOnceBestEffort();
    const terminalUpdate = terminal.updates[0]?.value;
    assert(
      terminalUpdate?.failure_kind === 'TERMINAL' && terminalUpdate?.next_retry_at === null,
      'Test 7: definite 4xx errors must remain TERMINAL'
    );
    console.log('Test 7 - HTTP 4xx remains TERMINAL: passed');

    let disabledFetchCalls = 0;
    (globalThis as any).fetch = async () => {
      disabledFetchCalls += 1;
      return asFetchResponse(200, { ok: true });
    };
    const disabled = setupWorkerMock({
      claims: [createClaim()],
      preferencesForUser: () => ({ data: { telegram_enabled: false, telegram_chat_id: 'trusted-chat-id' }, error: null }),
    });
    await TelegramRetryWorker.runOnceBestEffort();
    const disabledUpdate = disabled.updates[0]?.value;
    assert(
      disabledFetchCalls === 0 &&
        disabledUpdate?.failure_kind === 'TERMINAL' &&
        disabledUpdate?.error_message === 'Telegram delivery is no longer enabled.',
      'Test 8: disabled Telegram must not call the API and must terminate the claimed retry'
    );
    console.log('Test 8 - Disabled Telegram terminates a retry without calling Telegram: passed');

    const unlinked = setupWorkerMock({
      claims: [createClaim()],
      preferencesForUser: () => ({ data: { telegram_enabled: true, telegram_chat_id: null }, error: null }),
    });
    await TelegramRetryWorker.runOnceBestEffort();
    const unlinkedUpdate = unlinked.updates[0]?.value;
    assert(
      unlinkedUpdate?.failure_kind === 'TERMINAL' && unlinkedUpdate?.error_message === 'Telegram delivery is no longer enabled.',
      'Test 9: unlinked Telegram must terminate the claimed retry safely'
    );
    console.log('Test 9 - Unlinked Telegram terminates a retry safely: passed');

    ENV.TELEGRAM_BOT_TOKEN = '';
    let missingTokenFetchCalls = 0;
    (globalThis as any).fetch = async () => {
      missingTokenFetchCalls += 1;
      return asFetchResponse(200, { ok: true });
    };
    const missingToken = setupWorkerMock({ claims: [createClaim()] });
    await TelegramRetryWorker.runOnceBestEffort();
    const missingTokenUpdate = missingToken.updates[0]?.value;
    assert(
      missingTokenFetchCalls === 0 &&
        missingTokenUpdate?.failure_kind === 'TERMINAL' &&
        missingTokenUpdate?.next_retry_at === null,
      'Test 10: missing bot token must terminate the retry without calling Telegram'
    );
    console.log('Test 10 - Missing bot token terminates retry without a Telegram call: passed');
    ENV.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    const safeLogs: string[] = [];
    console.error = (...args: unknown[]) => safeLogs.push(args.join(' '));
    let multipleFetchCalls = 0;
    (globalThis as any).fetch = async () => {
      multipleFetchCalls += 1;
      return asFetchResponse(200, { ok: true });
    };
    const multiple = setupWorkerMock({
      claims: [
        createClaim({ id: 'delivery-bad', notification_id: 'notification-bad' }),
        createClaim({ id: 'delivery-good', notification_id: 'notification-good' }),
      ],
      notificationForId: (notificationId) =>
        notificationId === 'notification-bad'
          ? { data: null, error: new Error('raw failure for test-bot-token and trusted-chat-id') }
          : { data: { ...trustedNotification, id: notificationId }, error: null },
    });
    await TelegramRetryWorker.runOnceBestEffort();
    assert(
      multipleFetchCalls === 1 &&
        multiple.updates.some(({ deliveryId, value }) => deliveryId === 'delivery-good' && value.status === 'SENT'),
      'Test 11: one failed claimed row must not stop the rest of the batch'
    );
    assert(
      safeLogs.every((entry) => !entry.includes('test-bot-token') && !entry.includes('trusted-chat-id')),
      'Test 11: worker logs must remain generic and avoid sensitive delivery details'
    );
    console.error = originalConsoleError;
    console.log('Test 11 - Batch processing continues after a failed row with safe logs: passed');

    const claimRelease: { current: (() => void) | null } = { current: null };
    const claimGate = new Promise<void>((resolve) => {
      claimRelease.current = resolve;
    });
    const overlapping = setupWorkerMock({
      rpc: async () => {
        await claimGate;
        return { data: [], error: null };
      },
    });
    const firstRun = TelegramRetryWorker.runOnceBestEffort();
    await Promise.resolve();
    await TelegramRetryWorker.runOnceBestEffort();
    assert(overlapping.getRpcCalls() === 1, 'Test 12: in-process overlap must not claim twice');
    claimRelease.current?.();
    await firstRun;
    console.log('Test 12 - In-process overlap guard prevents duplicate worker runs: passed');

    let scheduledIntervals = 0;
    let clearedIntervals = 0;
    const scheduledCallback: { current: (() => void) | null } = { current: null };
    (globalThis as any).setInterval = (callback: () => void, intervalMs: number) => {
      assert(intervalMs === 60_000, 'Test 13: worker interval must be 60 seconds');
      scheduledIntervals += 1;
      scheduledCallback.current = callback;
      return { interval: scheduledIntervals } as unknown as NodeJS.Timeout;
    };
    (globalThis as any).clearInterval = () => {
      clearedIntervals += 1;
    };
    const lifecycle = setupWorkerMock();
    TelegramRetryWorker.start();
    TelegramRetryWorker.start();
    await Promise.resolve();
    assert(scheduledIntervals === 1 && lifecycle.getRpcCalls() === 1, 'Test 13: start must schedule once and perform an immediate run');
    scheduledCallback.current?.();
    await Promise.resolve();
    assert(lifecycle.getRpcCalls() === 2, 'Test 13: scheduled worker callback must run safely');
    TelegramRetryWorker.stop();
    TelegramRetryWorker.stop();
    assert(clearedIntervals === 1, 'Test 13: stop must be idempotent');
    console.log('Test 13 - Worker start and stop manage one safe 60-second interval: passed');

    const migration = readFileSync(join(__dirname, '../../supabase/phase10c7b-telegram-retry-claim.sql'), 'utf8');
    for (const requiredClause of [
      "delivery.channel = 'TELEGRAM'",
      "delivery.status = 'FAILED'",
      "delivery.failure_kind = 'RETRYABLE'",
      'delivery.next_retry_at <= now()',
      'delivery.attempt_count < 3',
      'for update skip locked',
      'attempt_count = delivery.attempt_count + 1',
      'next_retry_at = null',
      'least(coalesce(p_limit, 20), 100)',
      'security definer',
      'set search_path = pg_catalog',
      'grant execute on function public.claim_due_telegram_deliveries(integer) to service_role',
    ]) {
      assert(migration.toLowerCase().includes(requiredClause.toLowerCase()), `Test 14: migration must include ${requiredClause}`);
    }
    assert(
      migration.includes('revoke all on function public.claim_due_telegram_deliveries(integer) from anon') &&
        migration.includes('revoke all on function public.claim_due_telegram_deliveries(integer) from authenticated'),
      'Test 14: claim RPC must not be exposed to anon or authenticated roles'
    );
    console.log('Test 14 - Claim migration keeps retry selection, atomic claim, and service-role access constraints: passed');
  } finally {
    TelegramRetryWorker.stop();
    (supabaseAdmin as any).from = originalFrom;
    (supabaseAdmin as any).rpc = originalRpc;
    (globalThis as any).fetch = originalFetch;
    (globalThis as any).setInterval = originalSetInterval;
    (globalThis as any).clearInterval = originalClearInterval;
    console.error = originalConsoleError;
    ENV.TELEGRAM_BOT_TOKEN = originalBotToken;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
