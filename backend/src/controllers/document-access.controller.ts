import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { DocumentAccessError, DocumentAccessService } from '../services/document-access.service';
import { OutputDocumentService } from '../services/output-document.service';
import { sendError, sendSuccess } from '../utils/response.util';

const target = z.object({ source: z.enum(['OFFICIAL', 'OUTPUT']), sourceId: z.string().uuid() });
export class DocumentAccessController {
  static retired = (_req: AuthenticatedRequest,res: Response) => sendError(res,'Per-document sharing is retired. Use project sharing.',null,410);
  static get = DocumentAccessController.retired;
  static users = DocumentAccessController.retired;
  static save = DocumentAccessController.retired;
  static archive = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sourceId } = target.parse({ ...req.params, source: 'OUTPUT' });
      const access = await DocumentAccessService.read(req.user!, 'OUTPUT', sourceId);
      const result = await OutputDocumentService.downloadAllApproved(access.project_id, req.user!, sourceId);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      res.status(200).send(result.zipBuffer);
    } catch (error) {
      const code = error instanceof DocumentAccessError ? error.statusCode :
        error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 503;
      sendError(res, 'Unable to download approved output documents.', null, code);
    }
  };
}
