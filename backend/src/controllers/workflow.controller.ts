import { Response, NextFunction } from 'express';
import { WorkflowService } from '../services/workflow.service';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { getRouteParam } from '../utils/request.util';

export class WorkflowController {
  static async listWorkflows(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repositoryId, search } = req.query;
      const workflows = await WorkflowService.listWorkflows({
        repositoryId: repositoryId as string,
        search: search as string,
      });
      sendSuccess(res, 'Workflows retrieved successfully', workflows);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to list workflows', null, 500);
    }
  }

  static async getWorkflow(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const workflow = await WorkflowService.getWorkflowById(getRouteParam(req, 'id'));
      sendSuccess(res, 'Workflow retrieved successfully', workflow);
    } catch (error: any) {
      sendError(res, error.message || 'Workflow not found', null, 404);
    }
  }

  static async createWorkflow(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }
      const workflow = await WorkflowService.createWorkflow(req.body, req.user.userId);
      sendSuccess(res, 'Workflow created successfully', workflow, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to create workflow', null, 400);
    }
  }

  static async createVersion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const version = await WorkflowService.createVersion(req.body);
      sendSuccess(res, 'Workflow version published successfully', version, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to publish version', null, 400);
    }
  }
}
