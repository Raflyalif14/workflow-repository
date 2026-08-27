import { Response } from 'express';
import { AssignmentService } from '../services/assignment.service';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { getRouteParam } from '../utils/request.util';

export class AssignmentController {
  static async assignOrReassignPIC(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) { sendError(res, 'Unauthorized', null, 401); return; }
      const history = await AssignmentService.assignOrReassignPIC(getRouteParam(req, 'projectId'), req.body, req.user.userId);
      sendSuccess(res, 'PIC assigned / reassigned successfully', history);
    } catch (error: any) { sendError(res, error.message || 'Failed to assign PIC', null, 400); }
  }

  static async getAssignmentHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try { sendSuccess(res, 'Assignment history retrieved successfully', await AssignmentService.getAssignmentHistory(getRouteParam(req, 'projectId'))); }
    catch (error: any) { sendError(res, error.message || 'Failed to retrieve assignment history', null, 400); }
  }

  static async getEligibleSAs(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try { sendSuccess(res, 'Eligible Solution Architects retrieved successfully', await AssignmentService.getEligibleSolutionArchitects()); }
    catch (error: any) { sendError(res, error.message || 'Failed to retrieve architects', null, 400); }
  }
}
