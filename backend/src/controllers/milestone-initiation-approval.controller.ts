import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { MilestoneInitiationApprovalService } from '../services/milestone-initiation-approval.service';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';
import {
  ApproveMilestoneInitiationApprovalInput,
  RejectMilestoneInitiationApprovalInput,
  RequestMilestoneInitiationApprovalInput,
} from '../validators/milestone-initiation-approval.validator';

const getStatusCode = (message?: string) => {
  if (message === 'Forbidden' || message?.includes('project owner')) return 403;
  if (message?.includes('not found')) return 404;
  return 400;
};

export class MilestoneInitiationApprovalController {
  static async initiate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneInitiationApprovalService.initiateMilestone(
        getRouteParam(req, 'milestoneId'),
        req.user!
      );
      sendSuccess(res, 'Milestone initiated successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to initiate milestone', null, getStatusCode(error.message));
    }
  }

  static async request(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneInitiationApprovalService.requestInitiationApproval(
        getRouteParam(req, 'milestoneId'),
        req.body as RequestMilestoneInitiationApprovalInput,
        req.user!
      );
      sendSuccess(res, 'Milestone initiation approval requested successfully', result, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to request milestone initiation approval', null, getStatusCode(error.message));
    }
  }

  static async approve(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneInitiationApprovalService.approveInitiationApproval(
        getRouteParam(req, 'approvalId'),
        req.body as ApproveMilestoneInitiationApprovalInput,
        req.user!
      );
      sendSuccess(res, 'Milestone initiation approval approved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to approve milestone initiation approval', null, getStatusCode(error.message));
    }
  }

  static async reject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneInitiationApprovalService.rejectInitiationApproval(
        getRouteParam(req, 'approvalId'),
        req.body as RejectMilestoneInitiationApprovalInput,
        req.user!
      );
      sendSuccess(res, 'Milestone initiation approval rejected successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to reject milestone initiation approval', null, getStatusCode(error.message));
    }
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
