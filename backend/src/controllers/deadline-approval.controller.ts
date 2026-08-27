import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { DeadlineApprovalService } from '../services/deadline-approval.service';
import { sendError, sendSuccess } from '../utils/response.util';
import { getRouteParam } from '../utils/request.util';
import { ApproveDeadlineApprovalInput, RejectDeadlineApprovalInput } from '../validators/deadline-approval.validator';

const getStatusCode = (message?: string) => {
  if (message === 'Forbidden') return 403;
  if (message?.includes('not found')) return 404;
  return 400;
};

export class DeadlineApprovalController {
  static async getCurrent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await DeadlineApprovalService.getCurrentApproval(getRouteParam(req, 'milestoneId'));
      sendSuccess(res, 'Current deadline approval retrieved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve current deadline approval', null, getStatusCode(error.message));
    }
  }

  static async getHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await DeadlineApprovalService.getApprovalHistory(getRouteParam(req, 'milestoneId'));
      sendSuccess(res, 'Deadline approval history retrieved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve deadline approval history', null, getStatusCode(error.message));
    }
  }

  static async approve(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await DeadlineApprovalService.approveDeadlineApproval(
        getRouteParam(req, 'approvalId'),
        req.body as ApproveDeadlineApprovalInput,
        req.user!
      );
      sendSuccess(res, 'Deadline approval approved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to approve deadline approval', null, getStatusCode(error.message));
    }
  }

  static async reject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await DeadlineApprovalService.rejectDeadlineApproval(
        getRouteParam(req, 'approvalId'),
        req.body as RejectDeadlineApprovalInput,
        req.user!
      );
      sendSuccess(res, 'Deadline approval rejected successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to reject deadline approval', null, getStatusCode(error.message));
    }
  }
}
