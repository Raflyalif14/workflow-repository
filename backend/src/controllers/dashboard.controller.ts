import { Response } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class DashboardController {
  /**
   * GET /api/dashboard
   */
  static async getOverview(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const data = await DashboardService.getOverview();
      sendSuccess(res, 'Dashboard data retrieved successfully', data);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to load dashboard', null, 500);
    }
  }
}
