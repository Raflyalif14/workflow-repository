import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  MilestoneContributionError,
  MilestoneContributionService,
} from '../services/milestone-contribution.service';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';

export class MilestoneContributionController {
  static async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneContributionService.create(
        getRouteParam(req, 'milestoneId'),
        req.user!,
        Array.isArray(req.files) ? req.files : [],
        req.body.note
      );
      sendSuccess(res, 'Milestone supporting input added successfully', result, 201);
    } catch (error) {
      if (error instanceof MilestoneContributionError) {
        sendError(res, error.message, null, error.statusCode);
        return;
      }
      console.error('[MilestoneContributionController] Unexpected contribution creation failure.');
      sendError(res, 'Unable to save milestone supporting input.', null, 500);
    }
  }

  static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneContributionService.list(
        getRouteParam(req, 'milestoneId'),
        req.user!
      );
      sendSuccess(res, 'Milestone supporting input retrieved successfully', result);
    } catch (error) {
      if (error instanceof MilestoneContributionError) {
        sendError(res, error.message, null, error.statusCode);
        return;
      }
      console.error('[MilestoneContributionController] Unexpected contribution read failure.');
      sendError(res, 'Unable to load milestone supporting input.', null, 500);
    }
  }

  static async getAttachmentDownloadUrl(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneContributionService.getAttachmentDownloadUrl(
        getRouteParam(req, 'milestoneId'),
        getRouteParam(req, 'contributionId'),
        getRouteParam(req, 'attachmentId'),
        req.user!
      );
      sendSuccess(res, 'Supporting attachment download URL created successfully', result);
    } catch (error) {
      if (error instanceof MilestoneContributionError) {
        sendError(res, error.message, null, error.statusCode);
        return;
      }
      console.error('[MilestoneContributionController] Unexpected contribution download failure.');
      sendError(res, 'Failed to create supporting attachment download URL.', null, 500);
    }
  }
}
