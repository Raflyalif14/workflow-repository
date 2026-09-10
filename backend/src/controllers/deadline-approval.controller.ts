import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { DeadlineApprovalService } from '../services/deadline-approval.service';
import { sendError, sendSuccess } from '../utils/response.util';
import { getRouteParam } from '../utils/request.util';
import { ApproveDeadlineApprovalInput, RejectDeadlineApprovalInput } from '../validators/deadline-approval.validator';
import { logUnexpectedDeadlineError, toSafeDeadlineError } from '../utils/deadline-error.util';

const sendDeadlineApprovalError = (res: Response, error: unknown, fallback: string, operation: string): void => {
  const safeError = toSafeDeadlineError(error, fallback);
  logUnexpectedDeadlineError(operation, safeError);
  sendError(res, safeError.message, null, safeError.statusCode);
};

export class DeadlineApprovalController {
  static async getCurrent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await DeadlineApprovalService.getCurrentApproval(getRouteParam(req, 'milestoneId'), req.user!);
      sendSuccess(res, 'Current deadline approval retrieved successfully', result);
    } catch (error) {
      sendDeadlineApprovalError(res, error, 'Failed to retrieve current deadline approval.', 'getCurrentDeadlineApproval');
    }
  }

  static async getHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await DeadlineApprovalService.getApprovalHistory(getRouteParam(req, 'milestoneId'), req.user!);
      sendSuccess(res, 'Deadline approval history retrieved successfully', result);
    } catch (error) {
      sendDeadlineApprovalError(res, error, 'Failed to retrieve deadline approval history.', 'getDeadlineApprovalHistory');
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
    } catch (error) {
      sendDeadlineApprovalError(res, error, 'Failed to approve deadline approval.', 'approveDeadlineApproval');
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
    } catch (error) {
      sendDeadlineApprovalError(res, error, 'Failed to reject deadline approval.', 'rejectDeadlineApproval');
    }
  }
}
