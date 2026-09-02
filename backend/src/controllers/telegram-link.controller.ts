import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { TelegramLinkService, TelegramLinkServiceError } from '../services/telegram-link.service';
import { sendError, sendSuccess } from '../utils/response.util';

const toPublicNotificationPreferences = (preferences: {
  in_app_enabled: boolean;
  telegram_enabled: boolean;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  telegram_linked_at: string | null;
}) => ({
  in_app_enabled: preferences.in_app_enabled,
  telegram_enabled: preferences.telegram_enabled,
  telegram_linked: Boolean(preferences.telegram_chat_id),
  telegram_username: preferences.telegram_username,
  telegram_linked_at: preferences.telegram_linked_at,
});

const sendTelegramLinkError = (res: Response, error: unknown, fallback: string): void => {
  if (error instanceof TelegramLinkServiceError) {
    sendError(res, error.message, null, error.statusCode);
    return;
  }

  console.error('[TelegramLinkController] Unexpected Telegram link API error', error);
  sendError(res, fallback, null, 500);
};

export class TelegramLinkController {
  static async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await TelegramLinkService.createLink(req.user!.userId);
      sendSuccess(res, 'Telegram link created successfully', result, 201);
    } catch (error) {
      sendTelegramLinkError(res, error, 'Failed to create Telegram link');
    }
  }

  static async invalidateOutstanding(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await TelegramLinkService.invalidateOutstandingTokens(req.user!.userId);
      sendSuccess(res, 'Outstanding Telegram link tokens invalidated', { invalidated: true });
    } catch (error) {
      sendTelegramLinkError(res, error, 'Failed to invalidate Telegram link tokens');
    }
  }

  static async unlink(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const preferences = await TelegramLinkService.unlink(req.user!.userId);
      sendSuccess(res, 'Telegram account unlinked successfully', toPublicNotificationPreferences(preferences));
    } catch (error) {
      sendTelegramLinkError(res, error, 'Failed to unlink Telegram account');
    }
  }
}
