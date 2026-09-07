import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';
import { ProjectDeletionError, ProjectDeletionService } from '../services/project-deletion.service';
import { deleteProjectSchema } from '../validators/project-deletion.validator';

const run = async (res: Response, action: () => Promise<unknown>, message: string) => {
  try { sendSuccess(res, message, await action()); }
  catch (error) {
    const known = error instanceof ProjectDeletionError;
    sendError(res, known ? error.message : 'Unable to process project deletion.', null, known ? error.statusCode : 500);
  }
};

export class ProjectDeletionController {
  static preview = (req: AuthenticatedRequest, res: Response) =>
    run(res, () => ProjectDeletionService.preview(getRouteParam(req, 'projectId'), req.user!), 'Project deletion preview retrieved successfully');

  static delete = (req: AuthenticatedRequest, res: Response) => {
    const parsed = deleteProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'A project name confirmation is required.', null, 400);
      return;
    }
    return run(res, () => ProjectDeletionService.delete(getRouteParam(req, 'projectId'), parsed.data.confirmation, req.user!), 'Project deleted successfully');
  };
}
