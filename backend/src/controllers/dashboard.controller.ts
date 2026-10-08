import { Response } from 'express';
import { DashboardService, DashboardActivityError } from '../services/dashboard.service';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { getRequestTiming } from '../utils/request-timing';
import { ZodError } from 'zod';
import { dashboardActivityQuerySchema } from '../validators/dashboard-activity.validator';

export class DashboardController {
  static async getActivityPage(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) { sendError(res, 'Unauthorized: User authentication required', null, 401); return; }
    try {
      const { cursor } = dashboardActivityQuerySchema.parse(req.query);
      const data = await DashboardService.getActivityPage({ userId: req.user.userId, role: req.user.role }, cursor, getRequestTiming(req));
      sendSuccess(res, 'Recent activities retrieved successfully', data);
    } catch (error) {
      if (error instanceof ZodError) { sendError(res, 'Invalid activity query.', null, 422); return; }
      if (error instanceof DashboardActivityError) { sendError(res, error.message, null, error.statusCode); return; }
      sendError(res, 'Failed to load recent activities.', null, 500);
    }
  }

  /**
   * GET /api/dashboard
   */
  static async getOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized: User authentication required', null, 401);
        return;
      }

      const data = await DashboardService.getOverview({
        userId: req.user.userId,
        role: req.user.role,
        fullName: req.user.fullName,
      }, getRequestTiming(req));
      sendSuccess(res, 'Dashboard data retrieved successfully', data);
    } catch {
      sendError(res, 'Failed to load dashboard data.', null, 500);
    }
  }
}
