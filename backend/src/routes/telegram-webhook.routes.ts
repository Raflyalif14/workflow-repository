import { Router } from 'express';
import { TelegramWebhookController } from '../controllers/telegram-webhook.controller';

const router = Router();

router.post('/webhook', TelegramWebhookController.handle);

export default router;
