import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  MilestoneSubmissionPackageReviewError,
  MilestoneSubmissionPackageReviewService,
} from '../services/milestone-submission-package-review.service';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';

const getStatusCode = (error: unknown): number =>
  error instanceof MilestoneSubmissionPackageReviewError ? error.statusCode : 500;

export class MilestoneSubmissionPackageController {
  static async getCurrent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneSubmissionPackageReviewService.getCurrentPackage(
        getRouteParam(req, 'milestoneId'),
        req.user!
      );
      sendSuccess(res, 'Milestone submission package retrieved successfully', result);
    } catch (error) {
      sendError(res, 'Failed to retrieve milestone submission package.', null, getStatusCode(error));
    }
  }

  static async getAttachmentDownloadUrl(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await MilestoneSubmissionPackageReviewService.getPendingAttachmentDownloadUrl(
        getRouteParam(req, 'milestoneId'),
        getRouteParam(req, 'attachmentId'),
        req.user!
      );
      sendSuccess(res, 'Milestone submission download URL created successfully', result);
    } catch (error) {
      sendError(res, 'Failed to create milestone submission download URL.', null, getStatusCode(error));
    }
  }
}
