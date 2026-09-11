import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { MilestoneInitiationApprovalService } from '../services/milestone-initiation-approval.service';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';

const getStatusCode = (message?: string) => {
  if (message === 'Forbidden' || message?.includes('project owner')) return 403;
  if (message?.includes('not found')) return 404;
  return 400;
};

export class MilestoneInitiationApprovalController {
  static retired(_req: AuthenticatedRequest, res: Response): void {
    sendError(res, 'This workflow action has been retired. Milestones now progress automatically.', null, 410);
  }

  static async getCurrent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneInitiationApprovalService.getCurrentApproval(getRouteParam(req, 'milestoneId'));
      sendSuccess(res, 'Milestone initiation approval retrieved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve milestone initiation approval', null, getStatusCode(error.message));
    }
  }

  static async getHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneInitiationApprovalService.getApprovalHistory(getRouteParam(req, 'milestoneId'));
      sendSuccess(res, 'Milestone initiation approval history retrieved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve milestone initiation approval history', null, getStatusCode(error.message));
    }
  }
}
