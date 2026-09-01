import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticateUser } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateUser);

router.get('/unread-count', NotificationController.getUnreadCount);
router.patch('/read-all', NotificationController.markAllAsRead);
router.get('/preferences', NotificationController.getPreferences);
router.put('/preferences', NotificationController.updatePreferences);
router.patch('/:notificationId/read', NotificationController.markAsRead);
router.get('/', NotificationController.list);

export default router;
