import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { TelegramDeliveryHealthService } from '../services/telegram-delivery-health.service';
import { sendError, sendSuccess } from '../utils/response.util';

export class TelegramDeliveryHealthController {
  static async getHealth(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const health = await TelegramDeliveryHealthService.getHealth();
      sendSuccess(res, 'Telegram delivery health retrieved successfully', health);
    } catch {
      console.error('[TelegramDeliveryHealthController] Failed to retrieve Telegram delivery health.');
      sendError(res, 'Failed to retrieve Telegram delivery health.', null, 500);
    }
  }
}
