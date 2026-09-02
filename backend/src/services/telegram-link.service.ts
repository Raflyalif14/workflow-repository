import { createHash, randomBytes } from 'crypto';
import { ENV } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

type NotificationPreferenceRow = {
  in_app_enabled: boolean;
  telegram_enabled: boolean;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  telegram_linked_at: string | null;
};

export class TelegramLinkServiceError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'TelegramLinkServiceError';
  }
}

export const TELEGRAM_LINK_TOKEN_TTL_MS = 10 * 60 * 1000;

const preferenceFields = 'in_app_enabled,telegram_enabled,telegram_chat_id,telegram_username,telegram_linked_at';

const databaseError = (context: string, error: unknown): TelegramLinkServiceError => {
  console.error(`[TelegramLinkService] ${context}`, error);
  return new TelegramLinkServiceError(`Failed to ${context}.`, 500);
};

export const generateTelegramLinkToken = (): string => randomBytes(32).toString('base64url');

export const hashTelegramLinkToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const normalizeTelegramBotUsername = (value: string): string => {
  const username = value.trim().replace(/^@+/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    throw new TelegramLinkServiceError('Telegram bot username is not configured.', 503);
  }

  return username;
};

const buildTelegramLinkUrl = (botUsername: string, rawToken: string): string =>
  `https://t.me/${botUsername}?start=${rawToken}`;

export class TelegramLinkService {
  static async invalidateOutstandingTokens(userId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('telegram_link_tokens')
      .delete()
      .eq('user_id', userId)
      .is('consumed_at', null);

    if (error) throw databaseError('invalidate outstanding Telegram link tokens', error);
  }

  static async createLink(userId: string): Promise<{ linkUrl: string; expiresAt: string }> {
    const botUsername = normalizeTelegramBotUsername(ENV.TELEGRAM_BOT_USERNAME);
    const rawToken = generateTelegramLinkToken();
    const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TOKEN_TTL_MS).toISOString();

    await this.invalidateOutstandingTokens(userId);

    const { error } = await supabaseAdmin.from('telegram_link_tokens').insert({
      user_id: userId,
      token_hash: hashTelegramLinkToken(rawToken),
      expires_at: expiresAt,
    });

    if (error) throw databaseError('create Telegram link token', error);

    return {
      linkUrl: buildTelegramLinkUrl(botUsername, rawToken),
      expiresAt,
    };
  }

  static async unlink(userId: string): Promise<NotificationPreferenceRow> {
    await this.invalidateOutstandingTokens(userId);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('notification_preferences')
      .select('in_app_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingError) throw databaseError('retrieve notification preferences', existingError);

    const { data, error } = await supabaseAdmin
      .from('notification_preferences')
      .upsert(
        {
          user_id: userId,
          in_app_enabled: existing?.in_app_enabled ?? true,
          telegram_enabled: false,
          telegram_chat_id: null,
          telegram_username: null,
          telegram_linked_at: null,
        },
        { onConflict: 'user_id' }
      )
      .select(preferenceFields)
      .single();

    if (error || !data) throw databaseError('unlink Telegram account', error);
    return data as NotificationPreferenceRow;
  }
}
