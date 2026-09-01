import { supabaseAdmin } from '../config/supabase';
import { NotificationService, NotificationServiceError } from './notification.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const originalFrom = supabaseAdmin.from;

async function run(): Promise<void> {
  try {
    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'notification_preferences', 'Test 1: preferences must use notification_preferences');
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      };
    };
    const defaults = await NotificationService.getPreferences('user-1');
    assert(defaults.in_app_enabled && !defaults.telegram_enabled, 'Test 1: missing preferences must use application defaults');
    assert(defaults.telegram_chat_id === null, 'Test 1: default Telegram chat ID must be null');
    console.log('Test 1 - Missing notification preferences return application defaults: passed');

    let upsertCalled = false;
    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'notification_preferences', 'Test 2: preferences must use notification_preferences');
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
        upsert: () => {
          upsertCalled = true;
          return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
        },
      };
    };
    try {
      await NotificationService.updatePreferences('user-1', { telegram_enabled: true });
      throw new Error('Test 2: enabling Telegram without a chat ID must reject');
    } catch (error) {
      assert(error instanceof NotificationServiceError, 'Test 2: Telegram validation must return a service error');
      const message = error instanceof Error ? error.message : '';
      assert(message === 'Connect Telegram before enabling Telegram notifications.', 'Test 2: Telegram validation message must be clear');
      assert(!upsertCalled, 'Test 2: invalid Telegram enablement must not persist preferences');
    }
    console.log('Test 2 - Telegram cannot be enabled before a chat ID is linked: passed');

    const markReadFilters: Array<[string, unknown]> = [];
    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'notifications', 'Test 3: mark as read must use notifications');
      const updateChain: any = {
        eq: (field: string, value: unknown) => {
          markReadFilters.push([field, value]);
          return updateChain;
        },
        select: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'notification-1',
              type: 'TEST',
              title: 'Title',
              message: 'Message',
              project_id: null,
              milestone_id: null,
              action_url: null,
              is_read: true,
              read_at: '2026-09-01T00:00:00.000Z',
              created_at: '2026-09-01T00:00:00.000Z',
            },
            error: null,
          }),
        }),
      };

      return { update: () => updateChain };
    };
    await NotificationService.markAsRead('notification-1', 'user-1');
    assert(markReadFilters.some(([field, value]) => field === 'id' && value === 'notification-1'), 'Test 3: mark as read must filter by notification ID');
    assert(markReadFilters.some(([field, value]) => field === 'user_id' && value === 'user-1'), 'Test 3: mark as read must filter by authenticated user ID');
    console.log('Test 3 - Mark as read is scoped to notification ID and authenticated user ID: passed');

    const listFilters: Array<[string, unknown]> = [];
    (supabaseAdmin as any).from = (table: string) => {
      assert(table === 'notifications', 'Test 4: list must use notifications');
      const listChain: any = {
        select: () => listChain,
        eq: (field: string, value: unknown) => {
          listFilters.push([field, value]);
          return listChain;
        },
        order: () => listChain,
        range: () => listChain,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };

      return listChain;
    };
    await NotificationService.listForUser('user-1', { limit: 20, offset: 0, unread_only: true });
    assert(listFilters.some(([field, value]) => field === 'user_id' && value === 'user-1'), 'Test 4: list must filter by authenticated user ID');
    assert(listFilters.some(([field, value]) => field === 'is_read' && value === false), 'Test 4: unread filter must request unread notifications only');
    console.log('Test 4 - Notification list is user-scoped and applies unread filtering: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
