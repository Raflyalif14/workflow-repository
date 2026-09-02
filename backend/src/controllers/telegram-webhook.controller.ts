import { Request, Response } from 'express';
import { TelegramWebhookService } from '../services/telegram-webhook.service';
import { sendError, sendSuccess } from '../utils/response.util';

export class TelegramWebhookController {
  static async handle(req: Request, res: Response): Promise<void> {
    if (!TelegramWebhookService.isWebhookSecretValid(req.get('x-telegram-bot-api-secret-token') || undefined)) {
      sendError(res, 'Unauthorized Telegram webhook', null, 401);
      return;
    }

    const result = await TelegramWebhookService.processUpdate(req.body);
    sendSuccess(res, 'Telegram webhook processed', result);
  }
}
