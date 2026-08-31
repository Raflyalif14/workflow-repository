import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { DocumentService, DocumentServiceError } from '../services/document.service';
import { getRouteParam } from '../utils/request.util';
import { sendError, sendSuccess } from '../utils/response.util';
import {
  createCommentSchema,
  createDocumentSchema,
  listDocumentsQuerySchema,
  reviewVersionSchema,
  uploadVersionSchema,
} from '../validators/document.validator';

const sendDocumentError = (res: Response, error: unknown, fallback: string): void => {
  const message = error instanceof Error && error.message ? error.message : fallback;
  const statusCode = error instanceof DocumentServiceError ? error.statusCode : 400;
  sendError(res, message, null, statusCode);
};

export class DocumentController {
  static async listDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const documents = await DocumentService.listDocuments(listDocumentsQuerySchema.parse(req.query), req.user!);
      sendSuccess(res, 'Documents retrieved successfully', documents);
    } catch (error) {
      sendDocumentError(res, error, 'Failed to retrieve documents');
    }
  }

  static async getDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const document = await DocumentService.getDocumentById(getRouteParam(req, 'id'), req.user!);
      sendSuccess(res, 'Document details retrieved successfully', document);
    } catch (error) {
      sendDocumentError(res, error, 'Document not found');
    }
  }

  static async createDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.file) {
        sendError(res, 'File is required for document upload', null, 400);
        return;
      }

      const document = await DocumentService.createDocument(
        createDocumentSchema.parse(req.body),
        req.file,
        req.user!
      );
      sendSuccess(res, 'Document and initial version uploaded successfully', document, 201);
    } catch (error) {
      sendDocumentError(res, error, 'Failed to upload document');
    }
  }

  static async uploadNewVersion(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.file) {
        sendError(res, 'New file version is required', null, 400);
        return;
      }

      const document = await DocumentService.uploadNewVersion(
        getRouteParam(req, 'id'),
        uploadVersionSchema.parse(req.body),
        req.file,
        req.user!
      );
      sendSuccess(res, 'New document version uploaded successfully', document, 201);
    } catch (error) {
      sendDocumentError(res, error, 'Failed to upload new document version');
    }
  }

  static async reviewVersion(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const input = reviewVersionSchema.parse(req.body);
      const document = await DocumentService.reviewVersion(getRouteParam(req, 'versionId'), input, req.user!);
      sendSuccess(res, `Document version ${input.status.toLowerCase()} successfully`, document);
    } catch (error) {
      sendDocumentError(res, error, 'Failed to review document version');
    }
  }

  static async addComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const comment = await DocumentService.addComment(
        getRouteParam(req, 'id'),
        createCommentSchema.parse(req.body),
        req.user!
      );
      sendSuccess(res, 'Comment added successfully', comment, 201);
    } catch (error) {
      sendDocumentError(res, error, 'Failed to add document comment');
    }
  }

  static async getDownloadUrl(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const download = await DocumentService.getDownloadUrl(getRouteParam(req, 'versionId'), req.user!);
      sendSuccess(res, 'Document download URL created successfully', download);
    } catch (error) {
      sendDocumentError(res, error, 'Failed to create document download URL');
    }
  }
}
