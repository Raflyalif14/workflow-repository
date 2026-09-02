import { ENV } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import {
  buildTelegramNotificationText,
  getTelegramRetryAt,
  safeTelegramDeliveryError,
  TelegramDeliveryFailureKind,
  TelegramDeliveryService,
  TelegramSendResult,
} from './telegram-delivery.service';

type ClaimedTelegramDelivery = {
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

type TelegramPreferenceRow = {
  telegram_enabled: boolean;
  telegram_chat_id: string | null;
};

const RETRY_CLAIM_LIMIT = 20;
const RETRY_WORKER_INTERVAL_MS = 60_000;
const MAX_TELEGRAM_DELIVERY_ATTEMPTS = 3;

export class TelegramRetryWorker {
  private static interval: NodeJS.Timeout | null = null;
  private static isRunning = false;

  static start(): void {
    if (this.interval) return;

    this.interval = setInterval(() => {
      void this.runOnceBestEffort();
    }, RETRY_WORKER_INTERVAL_MS);
    void this.runOnceBestEffort();
  }

  static stop(): void {
    if (!this.interval) return;

    clearInterval(this.interval);
    this.interval = null;
  }

  static async runOnceBestEffort(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    try {
      const { data, error } = await supabaseAdmin.rpc('claim_due_telegram_deliveries', {
        p_limit: RETRY_CLAIM_LIMIT,
      });

      if (error) throw error;

      for (const claimedDelivery of (data || []) as ClaimedTelegramDelivery[]) {
        try {
          await this.processClaimedDelivery(claimedDelivery);
        } catch {
          console.error('[TelegramRetryWorker] Failed to process a claimed Telegram delivery.');
        }
      }
    } catch {
      console.error('[TelegramRetryWorker] Failed to claim due Telegram deliveries.');
    } finally {
      this.isRunning = false;
    }
  }

  private static async processClaimedDelivery(claimedDelivery: ClaimedTelegramDelivery): Promise<void> {
    const notification = await this.getNotification(claimedDelivery.notification_id);
    if (!notification) {
      await this.markTerminalFailure(claimedDelivery.id, 'Telegram notification is no longer available.');
      return;
    }

    const preferences = await this.getPreferences(notification.user_id);
    if (!preferences?.telegram_enabled || !preferences.telegram_chat_id) {
      await this.markTerminalFailure(claimedDelivery.id, 'Telegram delivery is no longer enabled.');
      return;
    }

    const botToken = ENV.TELEGRAM_BOT_TOKEN.trim();
    if (!botToken) {
      await this.markTerminalFailure(claimedDelivery.id, 'Telegram bot is not configured.');
      return;
    }

    const sendResult = await TelegramDeliveryService.sendMessage(
      botToken,
      preferences.telegram_chat_id,
      buildTelegramNotificationText({
        title: notification.title,
        message: notification.message,
        actionUrl: notification.action_url,
      })
    );

    if (sendResult.status === 'SUCCESS') {
      await this.markSent(claimedDelivery.id);
      return;
    }

    await this.markFailure(claimedDelivery, sendResult);
  }

  private static async getNotification(notificationId: string): Promise<NotificationRow | null> {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('id,user_id,title,message,action_url')
      .eq('id', notificationId)
      .maybeSingle();

    if (error) throw error;
    return data as NotificationRow | null;
  }

  private static async getPreferences(userId: string): Promise<TelegramPreferenceRow | null> {
    const { data, error } = await supabaseAdmin
      .from('notification_preferences')
      .select('telegram_enabled,telegram_chat_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data as TelegramPreferenceRow | null;
  }

  private static async markSent(deliveryId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('notification_deliveries')
      .update({
        status: 'SENT',
        sent_at: new Date().toISOString(),
        failure_kind: null,
        next_retry_at: null,
        error_message: null,
      })
      .eq('id', deliveryId);

    if (error) throw error;
  }

  private static async markTerminalFailure(deliveryId: string, message: string): Promise<void> {
    await this.updateFailedDelivery(deliveryId, 'TERMINAL', null, message);
  }

  private static async markFailure(
    claimedDelivery: ClaimedTelegramDelivery,
    failure: Extract<TelegramSendResult, { status: 'FAILURE' }>
  ): Promise<void> {
    if (failure.kind === 'RETRYABLE' && claimedDelivery.attempt_count >= MAX_TELEGRAM_DELIVERY_ATTEMPTS) {
      await this.markTerminalFailure(claimedDelivery.id, 'Telegram delivery retry limit reached.');
      return;
    }

    const nextRetryAt = failure.kind === 'RETRYABLE' ? getTelegramRetryAt(claimedDelivery.last_attempt_at) : null;
    await this.updateFailedDelivery(claimedDelivery.id, failure.kind, nextRetryAt, failure.message);
  }

  private static async updateFailedDelivery(
    deliveryId: string,
    failureKind: TelegramDeliveryFailureKind,
    nextRetryAt: string | null,
    message: string
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('notification_deliveries')
      .update({
        status: 'FAILED',
        sent_at: null,
        failure_kind: failureKind,
        next_retry_at: nextRetryAt,
        error_message: safeTelegramDeliveryError(message),
      })
      .eq('id', deliveryId);

    if (error) throw error;
  }
}
