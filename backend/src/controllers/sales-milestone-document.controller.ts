import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  SalesMilestoneDocumentError,
  SalesMilestoneDocumentService,
} from '../services/sales-milestone-document.service';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';

export class SalesMilestoneDocumentController {
  static async discardEvidence(req: AuthenticatedRequest, res: Response): Promise<void> {
    const body = z.object({ documentIds: z.array(z.string().uuid()).min(1).max(10) }).strict().safeParse(req.body);
    if (!body.success) { sendError(res, 'Invalid result evidence IDs.', null, 400); return; }
    try {
      await SalesMilestoneDocumentService.discardEvidence(getRouteParam(req, 'id'), req.user!, body.data.documentIds);
      sendSuccess(res, 'Unused result evidence discarded', null);
    } catch (error) {
      if (error instanceof SalesMilestoneDocumentError) { sendError(res, error.message, null, error.statusCode); return; }
      sendError(res, 'Unable to discard result evidence.', null, 503);
    }
  }

  static async uploadEvidence(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await SalesMilestoneDocumentService.uploadEvidence(getRouteParam(req,'id'),req.user!,Array.isArray(req.files) ? req.files : []);
      sendSuccess(res,'Result evidence uploaded',result,201);
    } catch (error) {
      if (error instanceof SalesMilestoneDocumentError) { sendError(res,error.message,null,error.statusCode); return; }
      sendError(res,'Unable to upload result evidence.',null,503);
    }
  }
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
