import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { AssignmentPhase5Service } from '../services/assignment-phase5.service';
import { sendError, sendSuccess } from '../utils/response.util';
import { getRouteParam } from '../utils/request.util';

const run = async (res: Response, action: () => Promise<unknown>, message: string, status = 200) => {
  try { sendSuccess(res, message, await action(), status); }
  catch (error: any) { sendError(res, error.message || 'Something went wrong', null, error.message === 'Forbidden' ? 403 : error.message?.includes('not found') ? 404 : 400); }
};

export class AssignmentPhase5Controller {
  static assign = (req: AuthenticatedRequest, res: Response) => run(res, () => AssignmentPhase5Service.assign(getRouteParam(req, 'projectId'), req.body.pic_id, req.body.reason, req.user!), 'Project PIC assigned successfully');
  static history = (req: AuthenticatedRequest, res: Response) => run(res, () => AssignmentPhase5Service.history(getRouteParam(req, 'projectId'), req.user!), 'Assignment history retrieved successfully');
  static assignedProjects = (req: AuthenticatedRequest, res: Response) => run(res, () => AssignmentPhase5Service.assignedProjects(req.user!), 'Assigned projects retrieved successfully');
  static assignedMilestones = (req: AuthenticatedRequest, res: Response) => run(res, () => AssignmentPhase5Service.assignedMilestones(req.user!), 'Assigned milestones retrieved successfully');
  static availablePics = (req: AuthenticatedRequest, res: Response) => run(res, () => AssignmentPhase5Service.availablePics(req.user!), 'Solution Architects retrieved successfully');
}
