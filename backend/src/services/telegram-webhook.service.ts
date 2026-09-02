import { timingSafeEqual } from 'crypto';
import { ENV } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import { telegramWebhookUpdateSchema } from '../validators/telegram-webhook.validator';
import { hashTelegramLinkToken } from './telegram-link.service';

type TelegramLinkTokenRow = {
  id: string;
  user_id: string;
  expires_at: string;
  consumed_at: string | null;
};

let hasWarnedAboutMissingSecret = false;

const startCommandPattern = /^\/start\s+([A-Za-z0-9_-]{32,128})\s*$/;

export const parseTelegramStartToken = (text: string | undefined): string | null => {
  const match = text?.match(startCommandPattern);
  return match?.[1] || null;
};

export class TelegramWebhookService {
  static isWebhookSecretValid(providedSecret: string | undefined): boolean {
    const configuredSecret = ENV.TELEGRAM_WEBHOOK_SECRET.trim();
    if (!configuredSecret) {
      if (ENV.NODE_ENV === 'production') {
        console.error('[TelegramWebhook] TELEGRAM_WEBHOOK_SECRET is required in production.');
        return false;
      }

      if (!hasWarnedAboutMissingSecret) {
        console.warn('[TelegramWebhook] TELEGRAM_WEBHOOK_SECRET is not configured; accepting webhook requests outside production.');
        hasWarnedAboutMissingSecret = true;
      }
      return true;
    }

    if (!providedSecret) return false;

    const expected = Buffer.from(configuredSecret);
    const received = Buffer.from(providedSecret);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  static async processUpdate(payload: unknown): Promise<{ linked: boolean }> {
    const parsed = telegramWebhookUpdateSchema.safeParse(payload);
    if (!parsed.success) return { linked: false };

    const message = parsed.data.message;
    const rawToken = parseTelegramStartToken(message?.text);
    if (!message || !rawToken) return { linked: false };

    try {
      return { linked: await this.linkTelegramAccount(rawToken, String(message.chat.id), message.from?.username ?? null) };
    } catch (error) {
      console.error('[TelegramWebhook] Failed to process Telegram link request', error);
      return { linked: false };
    }
  }

  private static async linkTelegramAccount(
    rawToken: string,
    chatId: string,
    username: string | null
  ): Promise<boolean> {
    const tokenHash = hashTelegramLinkToken(rawToken);
    const { data: token, error: tokenError } = await supabaseAdmin
      .from('telegram_link_tokens')
      .select('id,user_id,expires_at,consumed_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (tokenError) throw tokenError;
    if (!token || token.consumed_at || new Date(token.expires_at).getTime() <= Date.now()) return false;

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id,is_active')
      .eq('id', token.user_id)
      .maybeSingle();

    if (userError) throw userError;
    if (!user || !user.is_active) return false;

    const linkedAt = new Date().toISOString();
    const { data: consumedToken, error: consumeError } = await supabaseAdmin
      .from('telegram_link_tokens')
      .update({ consumed_at: linkedAt })
      .eq('id', token.id)
      .is('consumed_at', null)
      .gt('expires_at', linkedAt)
      .select('id,user_id')
      .maybeSingle();

    if (consumeError) throw consumeError;
    if (!consumedToken) return false;

    try {
      const { data: existingPreferences, error: preferencesError } = await supabaseAdmin
        .from('notification_preferences')
        .select('in_app_enabled')
        .eq('user_id', user.id)
        .maybeSingle();

      if (preferencesError) throw preferencesError;

      const { error: upsertError } = await supabaseAdmin
        .from('notification_preferences')
        .upsert(
          {
            user_id: user.id,
            in_app_enabled: existingPreferences?.in_app_enabled ?? true,
            telegram_enabled: false,
            telegram_chat_id: chatId,
            telegram_username: username?.trim() || null,
            telegram_linked_at: linkedAt,
          },
          { onConflict: 'user_id' }
        );

      if (upsertError) throw upsertError;
      return true;
    } catch (error) {
      await this.restoreTokenClaim(token.id, linkedAt);
      throw error;
    }
  }

  private static async restoreTokenClaim(tokenId: string, linkedAt: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('telegram_link_tokens')
        .update({ consumed_at: null })
        .eq('id', tokenId)
        .eq('consumed_at', linkedAt);

      if (error) throw error;
    } catch (error) {
      console.error('[TelegramWebhook] Failed to restore Telegram link token claim', error);
    }
  }
}
