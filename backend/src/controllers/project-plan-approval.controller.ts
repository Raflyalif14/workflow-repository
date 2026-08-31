import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { ProjectPlanApprovalService } from '../services/project-plan-approval.service';
import { sendError, sendSuccess } from '../utils/response.util';
import { getRouteParam } from '../utils/request.util';
import {
  ApproveProjectPlanInput,
  RejectProjectPlanInput,
  SaveProjectTimelineInput,
  SubmitProjectPlanInput,
} from '../validators/project-plan.validator';

const getStatusCode = (message?: string) => {
  if (message === 'Forbidden' || message?.startsWith('Only ')) return 403;
  if (message?.includes('not found')) return 404;
  if (message?.includes('pending') || message?.includes('not active') || message?.includes('DRAFT')) return 409;
  return 400;
};

export class ProjectPlanApprovalController {
  static async saveTimeline(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await ProjectPlanApprovalService.saveTimeline(
        getRouteParam(req, 'projectId'),
        req.body as SaveProjectTimelineInput,
        req.user!
      );
      sendSuccess(res, 'Project timeline saved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to save project timeline', null, getStatusCode(error.message));
    }
  }

  static async submit(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await ProjectPlanApprovalService.submit(
        getRouteParam(req, 'projectId'),
        req.body as SubmitProjectPlanInput,
        req.user!
      );
      sendSuccess(res, 'Project plan submitted successfully', result, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to submit project plan', null, getStatusCode(error.message));
    }
  }

  static async approve(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await ProjectPlanApprovalService.approve(
        getRouteParam(req, 'projectId'),
        req.body as ApproveProjectPlanInput,
        req.user!
      );
      sendSuccess(res, 'Project plan approved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to approve project plan', null, getStatusCode(error.message));
    }
  }

  static async reject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await ProjectPlanApprovalService.reject(
        getRouteParam(req, 'projectId'),
        req.body as RejectProjectPlanInput,
        req.user!
      );
      sendSuccess(res, 'Project plan rejected successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to reject project plan', null, getStatusCode(error.message));
    }
  }

  static async getCurrent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await ProjectPlanApprovalService.getCurrent(getRouteParam(req, 'projectId'), req.user!);
      sendSuccess(res, 'Current project plan approval retrieved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve project plan approval', null, getStatusCode(error.message));
    }
  }

  static async getHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await ProjectPlanApprovalService.getHistory(getRouteParam(req, 'projectId'), req.user!);
      sendSuccess(res, 'Project plan approval history retrieved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve project plan approval history', null, getStatusCode(error.message));
    }
  }

  static async getPending(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await ProjectPlanApprovalService.getPending(req.user!);
      sendSuccess(res, 'Pending project plan approvals retrieved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve pending project plan approvals', null, getStatusCode(error.message));
    }
  }
}
