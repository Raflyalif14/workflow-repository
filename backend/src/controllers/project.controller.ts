import { Response } from 'express';
import { ProjectService } from '../services/project.service';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { listProjectsQuerySchema } from '../validators/project.validator';
import { getRouteParam } from '../utils/request.util';

export class ProjectController {
  /**
   * GET /api/projects
   */
  static async listProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const validatedQuery = listProjectsQuerySchema.parse(req.query);
      const result = await ProjectService.listProjects(validatedQuery);
      sendSuccess(res, 'Projects retrieved successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve projects', null, 400);
    }
  }

  /**
   * GET /api/projects/:id
   */
  static async getProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const project = await ProjectService.getProjectById(getRouteParam(req, 'id'));
      sendSuccess(res, 'Project details retrieved successfully', project);
    } catch (error: any) {
      sendError(res, error.message || 'Project not found', null, 404);
    }
  }

  /**
   * POST /api/projects
   */
  static async createProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }
      const project = await ProjectService.createProject(req.body, req.user.userId);
      sendSuccess(res, 'Project created successfully with scenario milestones', project, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to create project', null, 400);
    }
  }

  /**
   * POST /api/projects/:id/postpone
   */
  static async postponeProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }
      const project = await ProjectService.postponeProject(
        getRouteParam(req, 'id'),
        req.body,
        req.user.userId
      );
      sendSuccess(res, 'Project timeline postponed and updated successfully', project);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to postpone project', null, 400);
    }
  }

  /**
   * PATCH /api/projects/milestones/:milestoneId/trigger
   */
  static async triggerMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }
      const milestone = await ProjectService.triggerMilestone(
        getRouteParam(req, 'milestoneId'),
        req.body,
        req.user.userId
      );
      sendSuccess(res, 'Milestone triggered and updated successfully', milestone);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to trigger milestone', null, 400);
    }
  }

  /**
   * GET /api/projects/meta/scenarios
   */
  static async listScenarios(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const scenarios = await ProjectService.listScenarios();
      sendSuccess(res, 'Scenarios retrieved successfully', scenarios);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve scenarios', null, 400);
    }
  }
}
