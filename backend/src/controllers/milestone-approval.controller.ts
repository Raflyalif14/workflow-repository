import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { MilestoneApprovalService } from '../services/milestone-approval.service';
import { sendError, sendSuccess } from '../utils/response.util';
import { getRouteParam } from '../utils/request.util';
import { ApproveMilestoneApprovalInput, RejectMilestoneApprovalInput } from '../validators/milestone-approval.validator';

const getStatusCode = (message?: string) => {
  if (message === 'Forbidden') return 403;
  if (message?.includes('not found')) return 404;
  return 400;
};

export class MilestoneApprovalController {
  static async getHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneApprovalService.getApprovalHistory(getRouteParam(req, 'milestoneId'));
      sendSuccess(res, 'Milestone approval history retrieved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve milestone approval history', null, getStatusCode(error.message));
    }
  }

  static async approve(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneApprovalService.approveMilestoneApproval(
        getRouteParam(req, 'approvalId'),
        req.body as ApproveMilestoneApprovalInput,
        req.user!
      );
      sendSuccess(res, 'Milestone approved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to approve milestone', null, getStatusCode(error.message));
    }
  }

  static async reject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneApprovalService.rejectMilestoneApproval(
        getRouteParam(req, 'approvalId'),
        req.body as RejectMilestoneApprovalInput,
        req.user!
      );
      sendSuccess(res, 'Milestone rejected successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to reject milestone', null, getStatusCode(error.message));
    }
  }
}
