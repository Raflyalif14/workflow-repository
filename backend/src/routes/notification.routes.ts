import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { TelegramDeliveryHealthController } from '../controllers/telegram-delivery-health.controller';
import { TelegramLinkController } from '../controllers/telegram-link.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.get(
  '/admin/telegram-delivery-health',
  authenticateUser,
  requireRoles(['SUPER_ADMIN']),
  TelegramDeliveryHealthController.getHealth
);

router.use(authenticateUser);

router.get('/unread-count', NotificationController.getUnreadCount);
router.patch('/read-all', NotificationController.markAllAsRead);
router.get('/preferences', NotificationController.getPreferences);
router.put('/preferences', NotificationController.updatePreferences);
router.post('/telegram/link', TelegramLinkController.create);
router.delete('/telegram/link', TelegramLinkController.invalidateOutstanding);
router.delete('/telegram', TelegramLinkController.unlink);
router.patch('/:notificationId/read', NotificationController.markAsRead);
router.get('/', NotificationController.list);

export default router;
