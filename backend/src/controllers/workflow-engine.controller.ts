import { Response } from 'express';
import { WorkflowEngineService } from '../services/workflow-engine.service';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { getRouteParam } from '../utils/request.util';

export class WorkflowEngineController {
  /**
   * POST /api/engine/milestones/:id/start
   */
  static async startMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }
      const result = await WorkflowEngineService.startMilestone(
        getRouteParam(req, 'id'),
        req.user.userId
      );
      sendSuccess(res, 'Milestone started successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to start milestone', null, 400);
    }
  }

  /**
   * POST /api/engine/milestones/:id/submit
   */
  static async submitMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }
      const result = await WorkflowEngineService.submitMilestone(
        getRouteParam(req, 'id'),
        req.body,
        req.user.userId
      );
      sendSuccess(res, 'Milestone submitted / completed successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to submit milestone', null, 400);
    }
  }

  /**
   * POST /api/engine/milestones/:id/approve
   */
  static async approveMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }
      const result = await WorkflowEngineService.approveMilestone(
        getRouteParam(req, 'id'),
        req.body,
        req.user.userId
      );
      sendSuccess(res, 'Milestone approved and next stage unlocked', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to approve milestone', null, 400);
    }
  }

  /**
   * POST /api/engine/milestones/:id/reject
   */
  static async rejectMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }
      const result = await WorkflowEngineService.rejectMilestone(
        getRouteParam(req, 'id'),
        req.body,
        req.user.userId
      );
      sendSuccess(res, 'Milestone rejected with feedback', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to reject milestone', null, 400);
    }
  }

  /**
   * POST /api/engine/milestones/:id/assign-pic
   */
  static async assignPic(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }
      const result = await WorkflowEngineService.assignPic(
        getRouteParam(req, 'id'),
        req.body,
        req.user.userId
      );
      sendSuccess(res, result.message, result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to assign PIC', null, 400);
    }
  }
}
