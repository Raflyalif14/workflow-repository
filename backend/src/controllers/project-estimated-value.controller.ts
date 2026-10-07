import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { Response } from 'express';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';
import { EstimatedValueError, ProjectEstimatedValueService } from '../services/project-estimated-value.service';

export class ProjectEstimatedValueController {
  static async update(req: AuthenticatedRequest, res: Response) {
    try {
      sendSuccess(res, 'Estimated value saved', await ProjectEstimatedValueService.update(getRouteParam(req, 'projectId'), req.body, req.user!));
    } catch (error) {
      const safe = error instanceof EstimatedValueError ? error : new EstimatedValueError(503, 'ESTIMATE_UNAVAILABLE');
      sendError(res, 'Unable to save estimated value.', { code: safe.code }, safe.statusCode);
    }
  }
}
