import { Response } from 'express';
import { ApprovalCenterService } from '../services/approval-center.service';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { getRouteParam } from '../utils/request.util';
import {
  listApprovalsQuerySchema,
  processApprovalSchema,
  approvalCommentSchema,
} from '../validators/approval.validator';

export class ApprovalCenterController {
  /**
   * GET /api/approvals
   */
  static async listApprovals(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const validatedQuery = listApprovalsQuerySchema.parse(req.query);
      const items = await ApprovalCenterService.listApprovals(validatedQuery);
      sendSuccess(res, 'Approvals retrieved successfully', items);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve approvals', null, 400);
    }
  }

  /**
   * GET /api/approvals/stats
   */
  static async getStats(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const stats = await ApprovalCenterService.getApprovalStats();
      sendSuccess(res, 'Approval stats retrieved successfully', stats);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve stats', null, 400);
    }
  }

  /**
   * POST /api/approvals/:id/decision (Approve / Reject)
   */
  static async processDecision(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }
      const validatedBody = processApprovalSchema.parse(req.body);
      const result = await ApprovalCenterService.processDecision(
        getRouteParam(req, 'id'),
        validatedBody,
        req.user.userId
      );
      sendSuccess(res, result.message, result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to process approval decision', null, 400);
    }
  }

  /**
   * POST /api/approvals/:id/comments
   */
  static async addComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }
      const validatedBody = approvalCommentSchema.parse(req.body);
      const comment = await ApprovalCenterService.addComment(
        getRouteParam(req, 'id'),
        validatedBody,
        req.user.userId
      );
      sendSuccess(res, 'Comment posted successfully', comment, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to post comment', null, 400);
    }
  }
}
