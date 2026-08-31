import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { MilestoneService } from '../services/milestone.service';
import { sendError, sendSuccess } from '../utils/response.util';
import { getRouteParam } from '../utils/request.util';
import { SubmitMilestoneInput } from '../validators/milestone.validator';

const getStatusCode = (message?: string) => {
  if (message === 'Forbidden') return 403;
  if (message?.includes('not found')) return 404;
  return 400;
};

export class MilestoneController {
  static async start(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneService.startStage(getRouteParam(req, 'milestoneId'), req.user!);
      sendSuccess(res, 'Milestone started successfully', result);
    } catch (error: any) {
      const status = error.message === 'Forbidden' || error.message?.startsWith('Only ') ? 403 : getStatusCode(error.message);
      sendError(res, error.message || 'Failed to start milestone', null, status);
    }
  }

  static async complete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneService.completeStage(getRouteParam(req, 'milestoneId'), req.user!);
      sendSuccess(res, 'Milestone completed successfully', result);
    } catch (error: any) {
      const status = error.message === 'Forbidden' || error.message?.startsWith('Only ') ? 403 : getStatusCode(error.message);
      sendError(res, error.message || 'Failed to complete milestone', null, status);
    }
  }

  static async submit(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const input = req.body as SubmitMilestoneInput;
      const result = await MilestoneService.submitMilestone(getRouteParam(req, 'milestoneId'), req.user!, input.note);
      sendSuccess(res, 'Milestone submitted successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to submit milestone', null, getStatusCode(error.message));
    }
  }

  static async startRevision(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneService.startRevision(getRouteParam(req, 'milestoneId'), req.user!);
      sendSuccess(res, 'Milestone revision started successfully', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to start milestone revision', null, getStatusCode(error.message));
    }
  }
}
