import { Response } from 'express';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { ProjectActivityError, ProjectActivityService } from '../services/project-activity.service';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';
import { projectActivityQuerySchema } from '../validators/project-activity.validator';

export class ProjectActivityController {
  static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const activities = await ProjectActivityService.list(
        getRouteParam(req, 'projectId'),
        projectActivityQuerySchema.parse(req.query),
        req.user!
      );
      sendSuccess(res, 'Project activities retrieved successfully', activities);
    } catch (error) {
      if (error instanceof ZodError) {
        sendError(res, 'Validation failed', error.errors.map((issue) => ({ field: issue.path.join('.'), message: issue.message })), 422);
        return;
      }
      if (error instanceof ProjectActivityError) {
        sendError(res, error.message, null, error.statusCode);
        return;
      }
      console.error('[ProjectActivityController] Activity lookup failed.');
      sendError(res, 'Failed to retrieve project activities.', null, 500);
    }
  }
}
