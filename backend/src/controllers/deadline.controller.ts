import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { DeadlineService } from '../services/deadline.service';
import { sendError, sendSuccess } from '../utils/response.util';
import { CalculateDeadlineInput, SaveMilestoneDeadlineInput } from '../validators/deadline.validator';
import { getRouteParam } from '../utils/request.util';
import { logUnexpectedDeadlineError, toSafeDeadlineError } from '../utils/deadline-error.util';

const sendDeadlineError = (res: Response, error: unknown, fallback: string, operation: string): void => {
  const safeError = toSafeDeadlineError(error, fallback);
  logUnexpectedDeadlineError(operation, safeError);
  sendError(res, safeError.message, null, safeError.statusCode);
};

export class DeadlineController {
  static async calculate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const input = req.body as CalculateDeadlineInput;
      const result = await DeadlineService.calculateDeadline(input.start_date, input.duration_working_days);
      sendSuccess(res, 'Deadline calculated successfully', result);
    } catch (error) {
      sendDeadlineError(res, error, 'Failed to calculate deadline.', 'calculate');
    }
  }

  static async saveMilestoneDeadline(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const input = req.body as SaveMilestoneDeadlineInput;
      const result = await DeadlineService.saveMilestoneDeadline(getRouteParam(req, 'milestoneId'), input, req.user!);
      sendSuccess(res, 'Milestone deadline saved successfully', result);
    } catch (error) {
      sendDeadlineError(res, error, 'Failed to save milestone deadline.', 'saveMilestoneDeadline');
    }
  }

  static async getMilestoneDeadlineHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await DeadlineService.getMilestoneDeadlineHistory(getRouteParam(req, 'milestoneId'), req.user!);
      sendSuccess(res, 'Milestone deadline history retrieved successfully', result);
    } catch (error) {
      sendDeadlineError(res, error, 'Failed to retrieve milestone deadline history.', 'getMilestoneDeadlineHistory');
    }
  }

  static async getMilestoneDeadlineStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await DeadlineService.getMilestoneDeadlineStatus(getRouteParam(req, 'milestoneId'), req.user!);
      sendSuccess(res, 'Milestone deadline status retrieved successfully', result);
    } catch (error) {
      sendDeadlineError(res, error, 'Failed to retrieve milestone deadline status.', 'getMilestoneDeadlineStatus');
    }
  }
}
