import { Response } from 'express';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';
import { OutputDocumentError, OutputDocumentService } from '../services/output-document.service';
import {
  reviewOutputDocumentsSchema,
  submitOutputDocumentsSchema,
  updateOutputChecklistSchema,
} from '../validators/output-document.validator';

const actor = (req: AuthenticatedRequest) => req.user!;

const run = async (res: Response, action: () => Promise<unknown>, message: string, status = 200) => {
  try {
    sendSuccess(res, message, await action(), status);
  } catch (error: any) {
    if (error instanceof OutputDocumentError) {
      sendError(res, error.message, null, error.statusCode);
      return;
    }
    if (error instanceof ZodError) {
      sendError(res, 'Invalid output document request.', null, 400);
      return;
    }
    console.error('[OutputDocumentController] Unexpected output document error.', error);
    sendError(res, 'Unable to process output documents.', null, 500);
  }
};

export class OutputDocumentController {
  static list = (req: AuthenticatedRequest, res: Response) =>
    run(
      res,
      () => OutputDocumentService.list(getRouteParam(req, 'projectId'), actor(req)),
      'Output documents retrieved successfully'
    );

  static upload = (req: AuthenticatedRequest, res: Response) =>
    run(
      res,
      () => {
        if (!req.file) {
          throw new OutputDocumentError('No file uploaded.', 400);
        }
        return OutputDocumentService.upload(
          getRouteParam(req, 'projectId'),
          getRouteParam(req, 'key'),
          req.file,
          actor(req)
        );
      },
      'Output document uploaded successfully'
    );

  static submit = (req: AuthenticatedRequest, res: Response) =>
    run(
      res,
      () => {
        const parsed = submitOutputDocumentsSchema.parse(req.body);
        return OutputDocumentService.submitForReview(
          getRouteParam(req, 'projectId'),
          parsed,
          actor(req)
        );
      },
      'Output documents submitted for review'
    );

  static review = (req: AuthenticatedRequest, res: Response) =>
    run(
      res,
      () => {
        const parsed = reviewOutputDocumentsSchema.parse(req.body);
        return OutputDocumentService.review(
          getRouteParam(req, 'projectId'),
          parsed,
          actor(req)
        );
      },
      'Review recorded successfully'
    );

  static updateChecklist = (req: AuthenticatedRequest, res: Response) =>
    run(
      res,
      () => {
        const parsed = updateOutputChecklistSchema.parse(req.body);
        const keys = parsed.selectedDocumentKeys || parsed.selected_document_keys || [];
        return OutputDocumentService.updateChecklist(
          getRouteParam(req, 'projectId'),
          keys,
          actor(req)
        );
      },
      'Output documents checklist updated successfully'
    );

  static downloadUrl = (req: AuthenticatedRequest, res: Response) =>
    run(
      res,
      () =>
        OutputDocumentService.getDownloadUrl(
          getRouteParam(req, 'projectId'),
          getRouteParam(req, 'key'),
          actor(req)
        ),
      'Download link generated successfully'
    );

  static versions = (req: AuthenticatedRequest, res: Response) =>
    run(
      res,
      () => OutputDocumentService.listVersions(
        getRouteParam(req, 'projectId'),
        getRouteParam(req, 'key'),
        actor(req)
      ),
      'Output document versions retrieved successfully'
    );

  static versionDownloadUrl = (req: AuthenticatedRequest, res: Response) =>
    run(
      res,
      () => OutputDocumentService.getVersionDownloadUrl(
        getRouteParam(req, 'projectId'),
        getRouteParam(req, 'key'),
        getRouteParam(req, 'versionId'),
        actor(req)
      ),
      'Version download link generated successfully'
    );

  static downloadAll = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const projectId = getRouteParam(req, 'projectId');
      const { zipBuffer, fileName } = await OutputDocumentService.downloadAllApproved(
        projectId,
        actor(req)
      );

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', zipBuffer.length);
      res.status(200).send(zipBuffer);
    } catch (error: any) {
      if (error instanceof OutputDocumentError) {
        sendError(res, error.message, null, error.statusCode);
        return;
      }
      console.error('[OutputDocumentController] Unexpected archive download error.', error);
      sendError(res, 'Unable to download approved output documents.', null, 500);
    }
  };
}
