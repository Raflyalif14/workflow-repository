import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { MilestoneService } from '../services/milestone.service';
import { retrySaMilestoneProgression } from '../services/workflow-progression.service';
import { sendError, sendSuccess } from '../utils/response.util';
import { getRouteParam } from '../utils/request.util';

const getStatusCode = (message?: string) => {
  if (message === 'Forbidden') return 403;
  if (message?.includes('not found')) return 404;
  return 400;
};

export class MilestoneController {
  static async start(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { data, error } = await (await import('../config/supabase')).supabaseAdmin.rpc('start_parallel_milestone', { p_milestone_id: getRouteParam(req, 'milestoneId'), p_actor_id: req.user!.userId });
      if (error) { sendError(res, 'Milestone cannot start. Check the approved plan, PIC, start date, and responsible account.', null, error.code === '42501' ? 403 : 409); return; }
      sendSuccess(res, 'Milestone started', data);
    } catch { sendError(res, 'Unable to start milestone.', null, 503); }
  }
  static async retryProgression(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await retrySaMilestoneProgression(getRouteParam(req, 'milestoneId'), req.user!);
      sendSuccess(res, 'Milestone progression reconciled', result);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to reconcile milestone progression', null, getStatusCode(error.message));
    }
  }

  static async complete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneService.completeStage(getRouteParam(req, 'milestoneId'), req.user!, req.body);
      sendSuccess(res, 'Milestone completed successfully', result);
    } catch (error: any) {
      const status = error.message?.startsWith('Unable to complete the milestone and record the project result')
        || error.message?.startsWith('Unable to verify project completion')
        || error.message?.startsWith('Unable to verify milestone progression')
        || error.message === 'Project scenario is not available for completion.'
        ? 500
        : error.message === 'Forbidden' || error.message?.startsWith('Only ') ? 403 : getStatusCode(error.message);
      sendError(res, error.message || 'Failed to complete milestone', null, status);
    }
  }

}
