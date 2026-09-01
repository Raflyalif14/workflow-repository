import { Response } from 'express';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { NotificationService, NotificationServiceError } from '../services/notification.service';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';
import {
  listNotificationsQuerySchema,
  notificationIdSchema,
  updateNotificationPreferencesSchema,
} from '../validators/notification.validator';

const sendNotificationError = (res: Response, error: unknown, fallback: string): void => {
  if (error instanceof ZodError) {
    sendError(
      res,
      'Validation failed',
      error.errors.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
      400
    );
    return;
  }

  if (error instanceof NotificationServiceError) {
    sendError(res, error.message, null, error.statusCode);
    return;
  }

  console.error('[NotificationController] Unexpected notification API error', error);
  sendError(res, fallback, null, 500);
};

export class NotificationController {
  static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const notifications = await NotificationService.listForUser(
        req.user!.userId,
        listNotificationsQuerySchema.parse(req.query)
      );
      sendSuccess(res, 'Notifications retrieved successfully', notifications);
    } catch (error) {
      sendNotificationError(res, error, 'Failed to retrieve notifications');
    }
  }

  static async getUnreadCount(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await NotificationService.getUnreadCount(req.user!.userId);
      sendSuccess(res, 'Unread notification count retrieved successfully', result);
    } catch (error) {
      sendNotificationError(res, error, 'Failed to retrieve unread notification count');
    }
  }

  static async markAllAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await NotificationService.markAllAsRead(req.user!.userId);
      sendSuccess(res, 'Notifications marked as read', result);
    } catch (error) {
      sendNotificationError(res, error, 'Failed to mark notifications as read');
    }
  }

  static async markAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const notification = await NotificationService.markAsRead(
        notificationIdSchema.parse(getRouteParam(req, 'notificationId')),
        req.user!.userId
      );
      sendSuccess(res, 'Notification marked as read', notification);
    } catch (error) {
      sendNotificationError(res, error, 'Failed to mark notification as read');
    }
  }

  static async getPreferences(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const preferences = await NotificationService.getPreferences(req.user!.userId);
      sendSuccess(res, 'Notification preferences retrieved successfully', preferences);
    } catch (error) {
      sendNotificationError(res, error, 'Failed to retrieve notification preferences');
    }
  }

  static async updatePreferences(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const preferences = await NotificationService.updatePreferences(
        req.user!.userId,
        updateNotificationPreferencesSchema.parse(req.body)
      );
      sendSuccess(res, 'Notification preferences updated successfully', preferences);
    } catch (error) {
      sendNotificationError(res, error, 'Failed to update notification preferences');
    }
  }
}
