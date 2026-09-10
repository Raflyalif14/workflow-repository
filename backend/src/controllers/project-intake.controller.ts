import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { ProjectIntakeError, ProjectIntakeService } from '../services/project-intake.service';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';

export class ProjectIntakeController {
  static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await ProjectIntakeService.list(getRouteParam(req, 'projectId'), req.user!);
      sendSuccess(res, 'Project intake evidence retrieved successfully', result);
    } catch (error) {
      if (error instanceof ProjectIntakeError) {
        sendError(res, error.message, null, error.statusCode);
        return;
      }
      console.error('[ProjectIntakeController] Unexpected intake evidence read failure.');
      sendError(res, 'Unable to load project intake evidence.', null, 500);
    }
  }

  static async getDownloadUrl(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await ProjectIntakeService.getDownloadUrl(
        getRouteParam(req, 'projectId'),
        getRouteParam(req, 'attachmentId'),
        req.user!
      );
      sendSuccess(res, 'Project intake download URL created successfully', result);
    } catch (error) {
      if (error instanceof ProjectIntakeError) {
        sendError(res, error.message, null, error.statusCode);
        return;
      }
      console.error('[ProjectIntakeController] Unexpected intake attachment download failure.');
      sendError(res, 'Failed to create project intake download URL.', null, 500);
    }
  }
}
