import { ENV } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

export type TelegramDeliveryNotification = {
  notificationId: string;
  recipientUserId: string;
  title: string;
  message: string;
  actionUrl: string | null;
};

type TelegramPreferenceRow = {
  telegram_enabled: boolean;
  telegram_chat_id: string | null;
};

type DeliveryRow = { id: string };

export const TELEGRAM_MESSAGE_MAX_LENGTH = 4000;
const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000;
const DELIVERY_ERROR_MAX_LENGTH = 240;

const safeDeliveryError = (message: string): string => message.slice(0, DELIVERY_ERROR_MAX_LENGTH);

const isDuplicateDeliveryError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';

export const isSafeInternalActionUrl = (actionUrl: string | null | undefined): actionUrl is string =>
  Boolean(actionUrl) &&
  actionUrl!.startsWith('/') &&
  !actionUrl!.startsWith('//') &&
  !actionUrl!.startsWith('/\\');

export const buildAbsoluteActionUrl = (actionUrl: string | null | undefined): string | null => {
  if (!isSafeInternalActionUrl(actionUrl)) return null;

  try {
    const appUrl = new URL(ENV.APP_BASE_URL);
    if (appUrl.protocol !== 'http:' && appUrl.protocol !== 'https:') return null;
    return new URL(actionUrl, appUrl).toString();
  } catch {
    return null;
  }
};

export const buildTelegramNotificationText = (notification: Pick<TelegramDeliveryNotification, 'title' | 'message' | 'actionUrl'>): string => {
  const parts = [notification.title.trim(), notification.message.trim()];
  const absoluteActionUrl = buildAbsoluteActionUrl(notification.actionUrl);
  if (absoluteActionUrl) parts.push(`Open: ${absoluteActionUrl}`);

  const text = parts.filter(Boolean).join('\n\n');
  const characters = Array.from(text);
  return characters.length <= TELEGRAM_MESSAGE_MAX_LENGTH
    ? text
    : `${characters.slice(0, TELEGRAM_MESSAGE_MAX_LENGTH - 3).join('')}...`;
};

export class TelegramDeliveryService {
  static async dispatchBestEffort(notification: TelegramDeliveryNotification): Promise<void> {
    try {
      await this.dispatch(notification);
    } catch {
      console.error('[TelegramDelivery] Telegram notification delivery failed.');
    }
  }

  private static async dispatch(notification: TelegramDeliveryNotification): Promise<void> {
    const { data: preferences, error: preferencesError } = await supabaseAdmin
      .from('notification_preferences')
      .select('telegram_enabled,telegram_chat_id')
      .eq('user_id', notification.recipientUserId)
      .maybeSingle();

    if (preferencesError) throw preferencesError;

    const recipientPreferences = preferences as TelegramPreferenceRow | null;
    if (!recipientPreferences?.telegram_enabled || !recipientPreferences.telegram_chat_id) return;

    const delivery = await this.createPendingDelivery(notification.notificationId);
    if (!delivery) return;

    const botToken = ENV.TELEGRAM_BOT_TOKEN.trim();
    if (!botToken) {
      await this.markDeliveryFailed(delivery.id, 'Telegram bot is not configured.');
      return;
    }

    const failureMessage = await this.sendMessage(
      botToken,
      recipientPreferences.telegram_chat_id,
      buildTelegramNotificationText(notification)
    );

    if (failureMessage) {
      await this.markDeliveryFailed(delivery.id, failureMessage);
      return;
    }

    await this.markDeliverySent(delivery.id);
  }

  private static async createPendingDelivery(notificationId: string): Promise<DeliveryRow | null> {
    const { data, error } = await supabaseAdmin
      .from('notification_deliveries')
      .insert({
        notification_id: notificationId,
        channel: 'TELEGRAM',
        status: 'PENDING',
        attempt_count: 0,
      })
      .select('id')
      .maybeSingle();

    if (isDuplicateDeliveryError(error)) return null;
    if (error || !data) throw error || new Error('Failed to create Telegram delivery record.');
    return data as DeliveryRow;
  }

  private static async sendMessage(botToken: string, chatId: string, text: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok || !payload || typeof payload !== 'object' || (payload as { ok?: unknown }).ok !== true) {
        return 'Telegram API request failed.';
      }

      return null;
    } catch {
      return 'Telegram delivery request failed.';
    } finally {
      clearTimeout(timeout);
    }
  }

  private static async markDeliverySent(deliveryId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('notification_deliveries')
      .update({
        status: 'SENT',
        attempt_count: 1,
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', deliveryId);

    if (error) throw error;
  }

  private static async markDeliveryFailed(deliveryId: string, message: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('notification_deliveries')
      .update({
        status: 'FAILED',
        attempt_count: 1,
        sent_at: null,
        error_message: safeDeliveryError(message),
      })
      .eq('id', deliveryId);

    if (error) throw error;
  }
}
