import { supabaseAdmin } from '../config/supabase';

type TelegramDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';
type TelegramFailureKind = 'RETRYABLE' | 'AMBIGUOUS' | 'TERMINAL';

type TelegramDeliveryRow = {
  id: string;
  notification_id: string;
  failure_kind: TelegramFailureKind | null;
  attempt_count: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
};

type NotificationTypeRow = {
  id: string;
  type: string;
};

export type TelegramDeliveryHealth = {
  generatedAt: string;
  summary: {
    total: number;
    sent: number;
    pending: number;
    failed: number;
    retryable: number;
    ambiguous: number;
    terminal: number;
    dueRetryable: number;
  };
  recentFailures: Array<{
    deliveryId: string;
    notificationId: string;
    notificationType: string;
    status: 'FAILED';
    failureKind: TelegramFailureKind | null;
    attemptCount: number;
    lastAttemptAt: string | null;
    nextRetryAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

export class TelegramDeliveryHealthServiceError extends Error {
  constructor() {
    super('Failed to retrieve Telegram delivery health.');
    this.name = 'TelegramDeliveryHealthServiceError';
  }
}

type DeliveryCountOptions = {
  status?: TelegramDeliveryStatus;
  failureKind?: TelegramFailureKind;
  dueBefore?: string;
};

const countTelegramDeliveries = async (options: DeliveryCountOptions = {}): Promise<number> => {
  let query: any = supabaseAdmin
    .from('notification_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'TELEGRAM');

  if (options.status) query = query.eq('status', options.status);
  if (options.failureKind) query = query.eq('failure_kind', options.failureKind);
  if (options.dueBefore) {
    query = query
      .not('next_retry_at', 'is', null)
      .lte('next_retry_at', options.dueBefore)
      .lt('attempt_count', 3);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
};

const getRecentFailures = async (): Promise<TelegramDeliveryRow[]> => {
  const { data, error } = await supabaseAdmin
    .from('notification_deliveries')
    .select('id,notification_id,failure_kind,attempt_count,last_attempt_at,next_retry_at,created_at,updated_at')
    .eq('channel', 'TELEGRAM')
    .eq('status', 'FAILED')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data || []) as TelegramDeliveryRow[];
};

const getNotificationTypes = async (notificationIds: string[]): Promise<Map<string, string>> => {
  if (!notificationIds.length) return new Map();

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id,type')
    .in('id', notificationIds);

  if (error) throw error;
  return new Map((data || []).map((notification) => {
    const row = notification as NotificationTypeRow;
    return [row.id, row.type];
  }));
};

export class TelegramDeliveryHealthService {
  static async getHealth(): Promise<TelegramDeliveryHealth> {
    const generatedAt = new Date().toISOString();

    try {
      const [total, sent, pending, failed, retryable, ambiguous, terminal, dueRetryable, recentFailures] = await Promise.all([
        countTelegramDeliveries(),
        countTelegramDeliveries({ status: 'SENT' }),
        countTelegramDeliveries({ status: 'PENDING' }),
        countTelegramDeliveries({ status: 'FAILED' }),
        countTelegramDeliveries({ status: 'FAILED', failureKind: 'RETRYABLE' }),
        countTelegramDeliveries({ status: 'FAILED', failureKind: 'AMBIGUOUS' }),
        countTelegramDeliveries({ status: 'FAILED', failureKind: 'TERMINAL' }),
        countTelegramDeliveries({ status: 'FAILED', failureKind: 'RETRYABLE', dueBefore: generatedAt }),
        getRecentFailures(),
      ]);
      const notificationTypes = await getNotificationTypes([
        ...new Set(recentFailures.map((delivery) => delivery.notification_id)),
      ]);

      return {
        generatedAt,
        summary: {
          total,
          sent,
          pending,
          failed,
          retryable,
          ambiguous,
          terminal,
          dueRetryable,
        },
        recentFailures: recentFailures.map((delivery) => ({
          deliveryId: delivery.id,
          notificationId: delivery.notification_id,
          notificationType: notificationTypes.get(delivery.notification_id) || 'UNKNOWN',
          status: 'FAILED',
          failureKind: delivery.failure_kind,
          attemptCount: delivery.attempt_count,
          lastAttemptAt: delivery.last_attempt_at,
          nextRetryAt: delivery.next_retry_at,
          createdAt: delivery.created_at,
          updatedAt: delivery.updated_at,
        })),
      };
    } catch {
      console.error('[TelegramDeliveryHealthService] Failed to retrieve Telegram delivery health.');
      throw new TelegramDeliveryHealthServiceError();
    }
  }
}
