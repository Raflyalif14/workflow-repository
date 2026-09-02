import { ENV } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import { NotificationService } from './notification.service';
import {
  buildTelegramNotificationText,
  TELEGRAM_MESSAGE_MAX_LENGTH,
  TelegramDeliveryService,
} from './telegram-delivery.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const notification = {
  notificationId: 'notification-1',
  recipientUserId: 'recipient-from-notification',
  title: 'Milestone Submitted',
  message: 'Customer Assessment is waiting for review.',
  actionUrl: '/approvals',
};

const originalFrom = supabaseAdmin.from;
const originalFetch = globalThis.fetch;
const originalBotToken = ENV.TELEGRAM_BOT_TOKEN;
const originalAppBaseUrl = ENV.APP_BASE_URL;

const asFetchResponse = (status: boolean | number, body: unknown) => {
  const resolvedStatus = typeof status === 'number' ? status : status ? 200 : 400;
  return {
  ok: resolvedStatus >= 200 && resolvedStatus < 300,
  status: resolvedStatus,
  json: async () => body,
  };
};

async function run(): Promise<void> {
  try {
    ENV.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    ENV.APP_BASE_URL = 'https://workflow.example.com';

    let disabledDeliveryTouched = false;
    let disabledFetchCalls = 0;
    (globalThis as any).fetch = async () => {
      disabledFetchCalls += 1;
      return asFetchResponse(true, { ok: true });
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'notification_preferences') {
        const query: any = {
          eq: () => query,
          maybeSingle: async () => ({ data: { telegram_enabled: false, telegram_chat_id: 'db-chat-id' }, error: null }),
        };
        return { select: () => query };
      }

      disabledDeliveryTouched = true;
      return {};
    };
    await TelegramDeliveryService.dispatchBestEffort(notification);
    assert(!disabledDeliveryTouched && disabledFetchCalls === 0, 'Test 1: disabled Telegram must not create a delivery or call Telegram');
    console.log('Test 1 - Disabled Telegram skips delivery record and API call: passed');

    let unlinkedDeliveryTouched = false;
    let unlinkedFetchCalls = 0;
    (globalThis as any).fetch = async () => {
      unlinkedFetchCalls += 1;
      return asFetchResponse(true, { ok: true });
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'notification_preferences') {
        const query: any = {
          eq: () => query,
          maybeSingle: async () => ({ data: { telegram_enabled: true, telegram_chat_id: null }, error: null }),
        };
        return { select: () => query };
      }

      unlinkedDeliveryTouched = true;
      return {};
    };
    await TelegramDeliveryService.dispatchBestEffort(notification);
    assert(!unlinkedDeliveryTouched && unlinkedFetchCalls === 0, 'Test 2: unlinked Telegram must skip delivery safely');
    console.log('Test 2 - Enabled Telegram without chat ID skips delivery safely: passed');

    let pendingDelivery: Record<string, unknown> | null = null;
    const sentUpdates: Array<Record<string, unknown>> = [];
    let telegramRequest: { url: string; body: Record<string, unknown> } | null = null;
    (globalThis as any).fetch = async (url: string, init: { body?: string }) => {
      telegramRequest = { url, body: JSON.parse(init.body || '{}') };
      return asFetchResponse(true, { ok: true });
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'notification_preferences') {
        const query: any = {
          eq: () => query,
          maybeSingle: async () => ({ data: { telegram_enabled: true, telegram_chat_id: 'chat-from-database' }, error: null }),
        };
        return { select: () => query };
      }

      assert(table === 'notification_deliveries', 'Test 3: eligible Telegram notification must use delivery records');
      return {
        insert: (value: Record<string, unknown>) => {
          pendingDelivery = value;
          return { select: () => ({ maybeSingle: async () => ({ data: { id: 'delivery-1' }, error: null }) }) };
        },
        update: (value: Record<string, unknown>) => {
          sentUpdates.push(value);
          return { eq: () => ({ error: null }) };
        },
      };
    };
    await TelegramDeliveryService.dispatchBestEffort(notification);
    const pendingRecord = pendingDelivery as Record<string, unknown> | null;
    const request = telegramRequest as { url: string; body: Record<string, unknown> } | null;
    assert(pendingRecord?.channel === 'TELEGRAM' && pendingRecord?.status === 'PENDING' && pendingRecord?.attempt_count === 0, 'Test 3: PENDING delivery record must be created first');
    assert(request?.body.chat_id === 'chat-from-database', 'Test 3: chat ID must come from trusted database preferences');
    assert(request?.body.text === buildTelegramNotificationText(notification), 'Test 3: Telegram request must use the sanitized plain-text message');
    assert(!request?.url.includes('chat-from-database'), 'Test 3: chat ID must not be placed in Telegram request URL');
    const attemptUpdate = sentUpdates[0];
    const sentUpdate = sentUpdates[1];
    assert(typeof attemptUpdate?.last_attempt_at === 'string', 'Test 3: delivery must record last_attempt_at before sending');
    assert(sentUpdates.length === 2 && sentUpdate?.status === 'SENT' && sentUpdate?.attempt_count === 1, 'Test 3: successful send must mark delivery SENT once');
    assert(
      typeof sentUpdate?.sent_at === 'string' &&
        sentUpdate?.last_attempt_at === attemptUpdate?.last_attempt_at &&
        sentUpdate?.failure_kind === null &&
        sentUpdate?.next_retry_at === null &&
        sentUpdate?.error_message === null,
      'Test 3: successful delivery must clear failure metadata and retain the attempt timestamp'
    );
    console.log('Test 3 - Eligible linked Telegram notification creates PENDING, records an attempt, then marks SENT: passed');

    const failedUpdates: Array<Record<string, unknown>> = [];
    (globalThis as any).fetch = async () =>
      asFetchResponse(429, { ok: false, description: 'raw Telegram response for chat-from-database and test-bot-token' });
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'notification_preferences') {
        const query: any = {
          eq: () => query,
          maybeSingle: async () => ({ data: { telegram_enabled: true, telegram_chat_id: 'chat-from-database' }, error: null }),
        };
        return { select: () => query };
      }

      assert(table === 'notification_deliveries', 'Test 4: Telegram failure must still update the delivery record');
      return {
        insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'delivery-failed' }, error: null }) }) }),
        update: (value: Record<string, unknown>) => {
          failedUpdates.push(value);
          return { eq: () => ({ error: null }) };
        },
      };
    };
    await TelegramDeliveryService.dispatchBestEffort(notification);
    const retryableFailure = failedUpdates[1];
    assert(failedUpdates.length === 2 && retryableFailure?.status === 'FAILED' && retryableFailure?.attempt_count === 1, 'Test 4: HTTP 429 must mark delivery FAILED once');
    assert(
      retryableFailure?.sent_at === null &&
        retryableFailure?.failure_kind === 'RETRYABLE' &&
        typeof retryableFailure?.last_attempt_at === 'string' &&
        typeof retryableFailure?.next_retry_at === 'string' &&
        Date.parse(String(retryableFailure.next_retry_at)) > Date.parse(String(retryableFailure.last_attempt_at)),
      'Test 4: HTTP 429 must produce retryable metadata with a future retry time'
    );
    assert(
      retryableFailure?.error_message === 'Telegram API temporarily unavailable.' &&
        !String(retryableFailure.error_message).includes('chat-from-database') &&
        !String(retryableFailure.error_message).includes('test-bot-token') &&
        !String(retryableFailure.error_message).includes('raw Telegram response'),
      'Test 4: retryable error message must stay generic'
    );
    console.log('Test 4 - HTTP 429 records a safe RETRYABLE failure with retry metadata: passed');

    const executeFailureScenario = async (
      deliveryId: string,
      fetchImpl: () => Promise<unknown>
    ): Promise<Array<Record<string, unknown>>> => {
      const updates: Array<Record<string, unknown>> = [];
      (globalThis as any).fetch = fetchImpl;
      (supabaseAdmin as any).from = (table: string) => {
        if (table === 'notification_preferences') {
          const query: any = {
            eq: () => query,
            maybeSingle: async () => ({ data: { telegram_enabled: true, telegram_chat_id: 'chat-from-database' }, error: null }),
          };
          return { select: () => query };
        }

        assert(table === 'notification_deliveries', 'Failure scenarios must update delivery records');
        return {
          insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: deliveryId }, error: null }) }) }),
          update: (value: Record<string, unknown>) => {
            updates.push(value);
            return { eq: () => ({ error: null }) };
          },
        };
      };
      await TelegramDeliveryService.dispatchBestEffort(notification);
      return updates;
    };

    const serviceUnavailableUpdates = await executeFailureScenario(
      'delivery-503',
      async () => asFetchResponse(503, { ok: false, description: 'temporary provider failure' })
    );
    const serviceUnavailableFailure = serviceUnavailableUpdates[1];
    assert(
      serviceUnavailableUpdates.length === 2 &&
        serviceUnavailableFailure?.failure_kind === 'AMBIGUOUS' &&
        serviceUnavailableFailure?.next_retry_at === null &&
        serviceUnavailableFailure?.error_message === 'Telegram delivery outcome is unknown.',
      'Test 4b: HTTP 5xx must be ambiguous without retry metadata'
    );
    console.log('Test 4b - HTTP 5xx records AMBIGUOUS failure metadata: passed');

    const requestTimeoutUpdates = await executeFailureScenario(
      'delivery-408',
      async () => asFetchResponse(408, { ok: false, description: 'request timeout response' })
    );
    const requestTimeoutFailure = requestTimeoutUpdates[1];
    assert(
      requestTimeoutUpdates.length === 2 &&
        requestTimeoutFailure?.failure_kind === 'AMBIGUOUS' &&
        requestTimeoutFailure?.next_retry_at === null &&
        requestTimeoutFailure?.error_message === 'Telegram delivery outcome is unknown.',
      'Test 4c: HTTP 408 must be ambiguous without retry metadata'
    );
    console.log('Test 4c - HTTP 408 records AMBIGUOUS failure metadata: passed');

    for (const status of [400, 401, 403, 404]) {
      const terminalUpdates = await executeFailureScenario(
        `delivery-terminal-${status}`,
        async () => asFetchResponse(status, { ok: false, description: `raw terminal response ${status}` })
      );
      const terminalFailure = terminalUpdates[1];
      assert(
        terminalUpdates.length === 2 &&
          terminalFailure?.status === 'FAILED' &&
          terminalFailure?.failure_kind === 'TERMINAL' &&
          terminalFailure?.next_retry_at === null &&
          terminalFailure?.error_message === 'Telegram API rejected the request.',
        `Test 4d: HTTP ${status} must be a terminal failure without retry metadata`
      );
    }
    console.log('Test 4d - HTTP 400, 401, 403, and 404 record TERMINAL failure metadata: passed');

    const networkFailureUpdates = await executeFailureScenario('delivery-network', async () => {
      throw new Error('network failure for chat-from-database with test-bot-token');
    });
    const networkFailure = networkFailureUpdates[1];
    assert(
      networkFailureUpdates.length === 2 &&
        networkFailure?.failure_kind === 'AMBIGUOUS' &&
        networkFailure?.next_retry_at === null &&
        networkFailure?.error_message === 'Telegram delivery outcome is unknown.' &&
        !String(networkFailure?.error_message).includes('chat-from-database') &&
        !String(networkFailure?.error_message).includes('test-bot-token'),
      'Test 4e: network failure must be ambiguous with no leaked exception details'
    );
    console.log('Test 4e - Network failures record AMBIGUOUS metadata without a retry time: passed');

    const abortFailureUpdates = await executeFailureScenario('delivery-abort', async () => {
      const abortError = new Error('AbortError with chat-from-database and test-bot-token');
      abortError.name = 'AbortError';
      throw abortError;
    });
    const abortFailure = abortFailureUpdates[1];
    assert(
      abortFailureUpdates.length === 2 &&
        abortFailure?.failure_kind === 'AMBIGUOUS' &&
        abortFailure?.next_retry_at === null &&
        abortFailure?.error_message === 'Telegram delivery outcome is unknown.',
      'Test 4f: timeout or abort failures must be ambiguous without retry metadata'
    );
    console.log('Test 4f - Abort or timeout failures record AMBIGUOUS metadata: passed');

    ENV.TELEGRAM_BOT_TOKEN = '';
    const missingTokenUpdates: Array<Record<string, unknown>> = [];
    let missingTokenFetchCalls = 0;
    (globalThis as any).fetch = async () => {
      missingTokenFetchCalls += 1;
      return asFetchResponse(true, { ok: true });
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'notification_preferences') {
        const query: any = {
          eq: () => query,
          maybeSingle: async () => ({ data: { telegram_enabled: true, telegram_chat_id: 'chat-from-database' }, error: null }),
        };
        return { select: () => query };
      }

      assert(table === 'notification_deliveries', 'Test 5: missing token must still record failed delivery');
      return {
        insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'delivery-no-token' }, error: null }) }) }),
        update: (value: Record<string, unknown>) => {
          missingTokenUpdates.push(value);
          return { eq: () => ({ error: null }) };
        },
      };
    };
    await TelegramDeliveryService.dispatchBestEffort(notification);
    assert(missingTokenFetchCalls === 0, 'Test 5: missing bot token must not call Telegram');
    const missingTokenFailure = missingTokenUpdates[1];
    assert(
      missingTokenUpdates.length === 2 &&
        missingTokenFailure?.status === 'FAILED' &&
        missingTokenFailure?.failure_kind === 'TERMINAL' &&
        typeof missingTokenFailure?.last_attempt_at === 'string' &&
        missingTokenFailure?.next_retry_at === null &&
        !String(missingTokenFailure?.error_message).includes('test-bot-token'),
      'Test 5: missing token must record a terminal failure without leaking credentials'
    );
    console.log('Test 5 - Missing bot token records terminal FAILED delivery without leaking credentials: passed');
    ENV.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    const unsafeDoubleSlash = buildTelegramNotificationText({ ...notification, actionUrl: '//evil.example' });
    const unsafeBackslash = buildTelegramNotificationText({ ...notification, actionUrl: '/\\evil.example' });
    assert(!unsafeDoubleSlash.includes('evil.example') && !unsafeBackslash.includes('evil.example'), 'Test 6: unsafe action URLs must be omitted');
    console.log('Test 6 - Unsafe action URLs are omitted from Telegram text: passed');

    const safeActionText = buildTelegramNotificationText({ ...notification, actionUrl: '/projects/project-1' });
    assert(safeActionText.includes('Open: https://workflow.example.com/projects/project-1'), 'Test 7: safe internal action URL must become an absolute app URL');
    console.log('Test 7 - Safe internal action URL becomes an absolute app URL: passed');

    const longText = buildTelegramNotificationText({
      ...notification,
      title: 'Title',
      message: 'x'.repeat(TELEGRAM_MESSAGE_MAX_LENGTH + 500),
      actionUrl: null,
    });
    assert(Array.from(longText).length <= TELEGRAM_MESSAGE_MAX_LENGTH, 'Test 8: Telegram text must stay within the character limit');
    console.log('Test 8 - Telegram message text is safely truncated within the limit: passed');

    let deliveryInsertCount = 0;
    let duplicateSendCalls = 0;
    const duplicateUpdates: Array<Record<string, unknown>> = [];
    (globalThis as any).fetch = async () => {
      duplicateSendCalls += 1;
      return asFetchResponse(true, { ok: true });
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'notification_preferences') {
        const query: any = {
          eq: () => query,
          maybeSingle: async () => ({ data: { telegram_enabled: true, telegram_chat_id: 'chat-from-database' }, error: null }),
        };
        return { select: () => query };
      }

      assert(table === 'notification_deliveries', 'Test 9: duplicate dispatch must use the delivery table');
      return {
        insert: () => {
          deliveryInsertCount += 1;
          if (deliveryInsertCount === 1) {
            return { select: () => ({ maybeSingle: async () => ({ data: { id: 'delivery-duplicate' }, error: null }) }) };
          }
          return { select: () => ({ maybeSingle: async () => ({ data: null, error: { code: '23505' } }) }) };
        },
        update: (value: Record<string, unknown>) => {
          duplicateUpdates.push(value);
          return { eq: () => ({ error: null }) };
        },
      };
    };
    await TelegramDeliveryService.dispatchBestEffort(notification);
    await TelegramDeliveryService.dispatchBestEffort(notification);
    assert(deliveryInsertCount === 2 && duplicateSendCalls === 1 && duplicateUpdates.length === 2, 'Test 9: duplicate dispatch must not send a second Telegram message');
    console.log('Test 9 - Duplicate Telegram dispatch is idempotent: passed');

    const dispatchRelease: { current: (() => void) | null } = { current: null };
    const dispatchGate = new Promise<void>((resolve) => {
      dispatchRelease.current = resolve;
    });
    let dispatchedNotification: Record<string, unknown> | null = null;
    const originalDispatchBestEffort = TelegramDeliveryService.dispatchBestEffort;
    (TelegramDeliveryService as any).dispatchBestEffort = async (input: Record<string, unknown>) => {
      dispatchedNotification = input;
      await dispatchGate;
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'notifications') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: {
                  id: 'notification-created',
                  type: 'TEST',
                  title: 'Created notification',
                  message: 'Telegram may fail without affecting this response.',
                  project_id: null,
                  milestone_id: null,
                  action_url: '/projects/project-from-created-row',
                  is_read: false,
                  read_at: null,
                  created_at: '2026-09-02T00:00:00.000Z',
                },
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Test 10: unexpected table ${table}`);
    };
    try {
      const createdNotification = await Promise.race([
        NotificationService.createNotification({
          userId: 'recipient-from-notification',
          type: 'TEST',
          title: 'Created notification',
          message: 'Telegram may fail without affecting this response.',
        }).then((result) => ({ result, timedOut: false })),
        new Promise<{ result: null; timedOut: true }>((resolve) => setTimeout(() => resolve({ result: null, timedOut: true }), 100)),
      ]);

      const dispatchInput = dispatchedNotification as Record<string, unknown> | null;
      assert(!createdNotification.timedOut && createdNotification.result?.id === 'notification-created', 'Test 10: notification creation must not wait for Telegram delivery completion');
      assert(
        dispatchInput?.notificationId === 'notification-created' &&
          dispatchInput?.recipientUserId === 'recipient-from-notification' &&
          dispatchInput?.title === 'Created notification' &&
          dispatchInput?.message === 'Telegram may fail without affecting this response.' &&
          dispatchInput?.actionUrl === '/projects/project-from-created-row',
        'Test 10: Telegram dispatch must use trusted created notification and backend user data'
      );
      console.log('Test 10 - Notification creation returns before Telegram dispatch completes and uses trusted data: passed');
    } finally {
      dispatchRelease.current?.();
      (TelegramDeliveryService as any).dispatchBestEffort = originalDispatchBestEffort;
    }
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (globalThis as any).fetch = originalFetch;
    ENV.TELEGRAM_BOT_TOKEN = originalBotToken;
    ENV.APP_BASE_URL = originalAppBaseUrl;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
