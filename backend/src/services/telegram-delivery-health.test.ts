import { supabaseAdmin } from '../config/supabase';
import { authenticateUser } from '../middlewares/auth.middleware';
import notificationRoutes from '../routes/notification.routes';
import {
  TelegramDeliveryHealthService,
  TelegramDeliveryHealthServiceError,
} from './telegram-delivery-health.service';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

type DeliveryRow = {
  id: string;
  notification_id: string;
  channel: string;
  status: string;
  failure_kind: 'RETRYABLE' | 'AMBIGUOUS' | 'TERMINAL' | null;
  attempt_count: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
  error_message?: string | null;
  user_id?: string;
  telegram_chat_id?: string;
  telegram_username?: string;
};

type QueryState = {
  filters: Array<{ operator: string; field: string; value?: unknown }>;
  order?: { field: string; ascending: boolean };
  limit?: number;
  head: boolean;
};

const createHealthRows = (): DeliveryRow[] => {
  const now = Date.now();
  const past = new Date(now - 60_000).toISOString();
  const future = new Date(now + 60_000).toISOString();

  return [
    {
      id: 'sent-1', notification_id: 'notification-sent', channel: 'TELEGRAM', status: 'SENT', failure_kind: null,
      attempt_count: 1, last_attempt_at: past, next_retry_at: null, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:01:00.000Z',
    },
    {
      id: 'pending-1', notification_id: 'notification-pending', channel: 'TELEGRAM', status: 'PENDING', failure_kind: null,
      attempt_count: 0, last_attempt_at: null, next_retry_at: null, created_at: '2026-09-01T00:02:00.000Z', updated_at: '2026-09-01T00:02:00.000Z',
    },
    {
      id: 'retryable-due', notification_id: 'notification-retryable-due', channel: 'TELEGRAM', status: 'FAILED', failure_kind: 'RETRYABLE',
      attempt_count: 1, last_attempt_at: past, next_retry_at: past, created_at: '2026-09-01T00:03:00.000Z', updated_at: '2026-09-01T00:03:00.000Z',
    },
    {
      id: 'retryable-future', notification_id: 'notification-retryable-future', channel: 'TELEGRAM', status: 'FAILED', failure_kind: 'RETRYABLE',
      attempt_count: 1, last_attempt_at: past, next_retry_at: future, created_at: '2026-09-01T00:04:00.000Z', updated_at: '2026-09-01T00:04:00.000Z',
    },
    {
      id: 'retryable-limit', notification_id: 'notification-retryable-limit', channel: 'TELEGRAM', status: 'FAILED', failure_kind: 'RETRYABLE',
      attempt_count: 3, last_attempt_at: past, next_retry_at: past, created_at: '2026-09-01T00:05:00.000Z', updated_at: '2026-09-01T00:05:00.000Z',
    },
    {
      id: 'ambiguous', notification_id: 'notification-ambiguous', channel: 'TELEGRAM', status: 'FAILED', failure_kind: 'AMBIGUOUS',
      attempt_count: 1, last_attempt_at: past, next_retry_at: past, created_at: '2026-09-01T00:06:00.000Z', updated_at: '2026-09-01T00:06:00.000Z',
    },
    {
      id: 'terminal', notification_id: 'notification-terminal', channel: 'TELEGRAM', status: 'FAILED', failure_kind: 'TERMINAL',
      attempt_count: 1, last_attempt_at: past, next_retry_at: past, created_at: '2026-09-01T00:07:00.000Z', updated_at: '2026-09-01T00:07:00.000Z',
    },
    {
      id: 'historical', notification_id: 'notification-historical', channel: 'TELEGRAM', status: 'FAILED', failure_kind: null,
      attempt_count: 1, last_attempt_at: past, next_retry_at: past, created_at: '2026-09-01T00:08:00.000Z', updated_at: '2026-09-01T00:08:00.000Z',
    },
    {
      id: 'other-channel', notification_id: 'notification-other', channel: 'EMAIL', status: 'FAILED', failure_kind: 'RETRYABLE',
      attempt_count: 1, last_attempt_at: past, next_retry_at: past, created_at: '2026-09-01T00:09:00.000Z', updated_at: '2026-09-01T00:09:00.000Z',
    },
  ];
};

const matchesQuery = (row: DeliveryRow, state: QueryState): boolean =>
  state.filters.every((filter) => {
    if (filter.operator === 'eq') return row[filter.field as keyof DeliveryRow] === filter.value;
    if (filter.operator === 'not-null') return row[filter.field as keyof DeliveryRow] !== null;
    if (filter.operator === 'lte') return String(row[filter.field as keyof DeliveryRow]) <= String(filter.value);
    if (filter.operator === 'lt') return Number(row[filter.field as keyof DeliveryRow]) < Number(filter.value);
    return false;
  });

const setupSupabaseMock = (
  rows: DeliveryRow[],
  options: { deliveryError?: Error; notificationError?: Error } = {}
) => {
  const deliveryQueries: QueryState[] = [];
  const notificationSelects: string[] = [];

  (supabaseAdmin as any).from = (table: string) => {
    if (table === 'notification_deliveries') {
      const state: QueryState = { filters: [], head: false };
      const query: any = {
        eq: (field: string, value: unknown) => {
          state.filters.push({ operator: 'eq', field, value });
          return query;
        },
        not: (field: string) => {
          state.filters.push({ operator: 'not-null', field });
          return query;
        },
        lte: (field: string, value: unknown) => {
          state.filters.push({ operator: 'lte', field, value });
          return query;
        },
        lt: (field: string, value: unknown) => {
          state.filters.push({ operator: 'lt', field, value });
          return query;
        },
        order: (field: string, order: { ascending?: boolean }) => {
          state.order = { field, ascending: order.ascending !== false };
          return query;
        },
        limit: (limit: number) => {
          state.limit = limit;
          return query;
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          deliveryQueries.push({ ...state, filters: [...state.filters] });
          if (options.deliveryError) {
            return Promise.resolve({ data: null, count: null, error: options.deliveryError }).then(resolve, reject);
          }

          let data = rows.filter((row) => matchesQuery(row, state));
          if (state.order) {
            data = [...data].sort((a, b) => {
              const comparison = String(a[state.order!.field as keyof DeliveryRow]).localeCompare(
                String(b[state.order!.field as keyof DeliveryRow])
              );
              return state.order!.ascending ? comparison : -comparison;
            });
          }
          if (state.limit !== undefined) data = data.slice(0, state.limit);

          return Promise.resolve(state.head ? { data: null, count: data.length, error: null } : { data, error: null }).then(resolve, reject);
        },
      };

      return {
        select: (_fields: string, selectOptions?: { head?: boolean }) => {
          state.head = Boolean(selectOptions?.head);
          return query;
        },
      };
    }

    if (table === 'notifications') {
      return {
        select: (fields: string) => {
          notificationSelects.push(fields);
          return {
            in: (_field: string, notificationIds: string[]) => {
              if (options.notificationError) return Promise.resolve({ data: null, error: options.notificationError });
              return Promise.resolve({
                data: notificationIds.map((id) => ({ id, type: `TYPE_${id}` })),
                error: null,
              });
            },
          };
        },
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  };

  return { deliveryQueries, notificationSelects };
};

async function run(): Promise<void> {
  const originalFrom = supabaseAdmin.from;
  const originalConsoleError = console.error;

  try {
    const summaryMock = setupSupabaseMock(createHealthRows());
    const health = await TelegramDeliveryHealthService.getHealth();
    assert(
      health.summary.total === 8 && health.summary.sent === 1 && health.summary.pending === 1 && health.summary.failed === 6,
      'Test 1: total, SENT, PENDING, and FAILED Telegram counts must map correctly'
    );
    assert(
      health.summary.retryable === 3 && health.summary.ambiguous === 1 && health.summary.terminal === 1,
      'Test 2: failure-kind breakdown must exclude historical NULL failure kinds'
    );
    assert(
      health.summary.dueRetryable === 1,
      'Test 3: only due retryable failures below the three-attempt limit may be due'
    );
    const dueQuery = summaryMock.deliveryQueries.find((query) =>
      query.filters.some((filter) => filter.operator === 'lt' && filter.field === 'attempt_count')
    );
    assert(
      Boolean(
        dueQuery?.filters.some((filter) => filter.operator === 'not-null' && filter.field === 'next_retry_at') &&
          dueQuery.filters.some((filter) => filter.operator === 'lte' && filter.field === 'next_retry_at') &&
          dueQuery.filters.some((filter) => filter.operator === 'eq' && filter.field === 'failure_kind' && filter.value === 'RETRYABLE')
      ),
      'Test 3: due query must require next_retry_at, RETRYABLE, and attempt_count < 3'
    );
    console.log('Test 1-3 - Summary maps statuses, preserves historical NULLs, and only counts valid due retries: passed');

    const failureRows: DeliveryRow[] = Array.from({ length: 25 }, (_, index) => ({
      id: `delivery-${index}`,
      notification_id: `notification-${index}`,
      channel: 'TELEGRAM',
      status: 'FAILED',
      failure_kind: index % 3 === 0 ? 'RETRYABLE' : index % 3 === 1 ? 'AMBIGUOUS' : 'TERMINAL',
      attempt_count: 1,
      last_attempt_at: '2026-09-01T00:00:00.000Z',
      next_retry_at: null,
      created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 8, 1, 0, 1, index)).toISOString(),
      error_message: 'raw Telegram response must never be exposed',
      user_id: 'private-user-id',
      telegram_chat_id: 'private-chat-id',
      telegram_username: 'private-username',
    }));
    failureRows.push({
      ...failureRows[0],
      id: 'not-a-failure',
      notification_id: 'notification-not-a-failure',
      status: 'PENDING',
      created_at: '2026-09-02T00:00:00.000Z',
    });
    const recentMock = setupSupabaseMock(failureRows);
    const recentHealth = await TelegramDeliveryHealthService.getHealth();
    assert(
      recentHealth.recentFailures.length === 20 &&
        recentHealth.recentFailures[0]?.deliveryId === 'delivery-24' &&
        recentHealth.recentFailures.at(-1)?.deliveryId === 'delivery-5',
      'Test 4: recent failures must be Telegram FAILED rows, newest first, and bounded to 20'
    );
    const recentSerialized = JSON.stringify(recentHealth.recentFailures);
    assert(
      recentHealth.recentFailures.every((failure) => failure.notificationType.startsWith('TYPE_')) &&
        !recentSerialized.includes('private-user-id') &&
        !recentSerialized.includes('private-chat-id') &&
        !recentSerialized.includes('private-username') &&
        !recentSerialized.includes('raw Telegram response') &&
        !recentSerialized.includes('notification title') &&
        !recentSerialized.includes('notification message') &&
        !recentSerialized.includes('action_url'),
      'Test 5: recent failures may contain notificationType but must exclude private/message/error fields'
    );
    assert(
      recentMock.notificationSelects.every((fields) => fields === 'id,type'),
      'Test 5: notification lookup must read only id and type'
    );
    console.log('Test 4-5 - Recent failures are bounded, newest-first, and privacy-safe: passed');

    const safeLogs: string[] = [];
    console.error = (...args: unknown[]) => safeLogs.push(args.join(' '));
    setupSupabaseMock(createHealthRows(), { deliveryError: new Error('raw Supabase secret and provider response') });
    try {
      await TelegramDeliveryHealthService.getHealth();
      throw new Error('Test 6: failed delivery query must reject safely');
    } catch (error) {
      assert(error instanceof TelegramDeliveryHealthServiceError, 'Test 6: database error must become a safe service error');
      const message = error instanceof Error ? error.message : '';
      assert(
        message === 'Failed to retrieve Telegram delivery health.' &&
          safeLogs.every((entry) => !entry.includes('raw Supabase secret') && !entry.includes('provider response')),
        'Test 6: database error details must not be exposed or logged'
      );
    }
    console.error = originalConsoleError;
    console.log('Test 6 - Database failures remain generic and do not leak raw details: passed');

    const routerStack = (notificationRoutes as any).stack as any[];
    const adminLayer = routerStack.find((layer) => layer.route?.path === '/admin/telegram-delivery-health');
    assert(adminLayer, 'Test 7: Telegram delivery health route must exist');
    const handlers = adminLayer.route.stack.map((layer: any) => layer.handle);
    assert(handlers[0] === authenticateUser, 'Test 7: health route must authenticate users before handling data');

    let headSaStatus = 0;
    const headSaResponse: any = {
      status: (status: number) => {
        headSaStatus = status;
        return headSaResponse;
      },
      json: () => headSaResponse,
    };
    let superAdminNextCalled = false;
    handlers[1]({ user: { role: 'HEAD_SA' } }, headSaResponse, () => undefined);
    handlers[1]({ user: { role: 'SUPER_ADMIN' } }, {}, () => {
      superAdminNextCalled = true;
    });
    assert(headSaStatus === 403 && superAdminNextCalled, 'Test 7: health route must allow only SUPER_ADMIN');
    for (const path of ['/unread-count', '/read-all', '/preferences', '/telegram/link', '/:notificationId/read', '/']) {
      assert(routerStack.some((layer) => layer.route?.path === path), `Test 7: existing notification route ${path} must remain present`);
    }
    console.log('Test 7 - Route explicitly authenticates and restricts health data to SUPER_ADMIN: passed');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    console.error = originalConsoleError;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
