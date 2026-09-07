import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  SalesMilestoneDocumentError,
  SalesMilestoneDocumentService,
} from '../services/sales-milestone-document.service';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';

export class SalesMilestoneDocumentController {
  static async upload(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      const result = await SalesMilestoneDocumentService.upload(
        getRouteParam(req, 'milestoneId'),
        req.user!,
        files
      );
      sendSuccess(res, 'Milestone documents uploaded successfully', result, 201);
    } catch (error) {
      if (error instanceof SalesMilestoneDocumentError) {
        sendError(res, error.message, null, error.statusCode);
        return;
      }

      console.error('[SalesMilestoneDocumentController] Unexpected milestone document upload failure.');
      sendError(res, 'Failed to upload milestone documents.', null, 500);
    }
  }
}
