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

const asFetchResponse = (ok: boolean, body: unknown) => ({
  ok,
  json: async () => body,
});

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
    assert(sentUpdates.length === 1 && sentUpdates[0].status === 'SENT' && sentUpdates[0].attempt_count === 1, 'Test 3: successful send must mark delivery SENT once');
    assert(typeof sentUpdates[0].sent_at === 'string' && sentUpdates[0].error_message === null, 'Test 3: successful delivery must record sent_at without an error');
    console.log('Test 3 - Eligible linked Telegram notification creates PENDING then SENT delivery: passed');

    const failedUpdates: Array<Record<string, unknown>> = [];
    (globalThis as any).fetch = async () => asFetchResponse(false, { ok: false, description: 'Forbidden' });
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
    assert(failedUpdates.length === 1 && failedUpdates[0].status === 'FAILED' && failedUpdates[0].attempt_count === 1, 'Test 4: Telegram API failure must mark delivery FAILED once');
    assert(failedUpdates[0].sent_at === null, 'Test 4: failed delivery must not have sent_at');
    assert(typeof failedUpdates[0].error_message === 'string' && String(failedUpdates[0].error_message).length <= 240, 'Test 4: failed delivery error must be safe and bounded');
    console.log('Test 4 - Telegram API failure records a safe FAILED delivery without throwing: passed');

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
    assert(missingTokenUpdates[0]?.status === 'FAILED' && !String(missingTokenUpdates[0]?.error_message).includes('test-bot-token'), 'Test 5: missing token failure must not leak token data');
    console.log('Test 5 - Missing bot token records FAILED delivery without leaking credentials: passed');
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
    assert(deliveryInsertCount === 2 && duplicateSendCalls === 1 && duplicateUpdates.length === 1, 'Test 9: duplicate dispatch must not send a second Telegram message');
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
