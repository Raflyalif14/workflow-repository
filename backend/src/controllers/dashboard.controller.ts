import { Response } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class DashboardController {
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
      });
      sendSuccess(res, 'Dashboard data retrieved successfully', data);
    } catch {
      sendError(res, 'Failed to load dashboard data.', null, 500);
    }
  }
}
