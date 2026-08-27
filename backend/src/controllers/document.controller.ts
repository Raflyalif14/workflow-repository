import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { DocumentService } from '../services/document.service';
import { StorageService } from '../utils/storage.util';
import { sendSuccess, sendError } from '../utils/response.util';
import { getRouteParam } from '../utils/request.util';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  createDocumentSchema,
  uploadVersionSchema,
  reviewVersionSchema,
  createCommentSchema,
  listDocumentsQuerySchema,
} from '../validators/document.validator';

export class DocumentController {
  /**
   * GET /api/documents
   */
  static async listDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const validatedQuery = listDocumentsQuerySchema.parse(req.query);
      const docs = await DocumentService.listDocuments(validatedQuery);
      sendSuccess(res, 'Documents retrieved successfully', docs);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to retrieve documents', null, 400);
    }
  }

  /**
   * GET /api/documents/:id
   */
  static async getDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const doc = await DocumentService.getDocumentById(getRouteParam(req, 'id'));
      sendSuccess(res, 'Document details retrieved successfully', doc);
    } catch (error: any) {
      sendError(res, error.message || 'Document not found', null, 404);
    }
  }

  /**
   * POST /api/documents (Multipart Upload)
   */
  static async createDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }

      if (!req.file) {
        sendError(res, 'File is required for document upload', null, 400);
        return;
      }

      const validatedBody = createDocumentSchema.parse(req.body);
      const newDoc = await DocumentService.createDocument(
        validatedBody,
        req.file,
        req.user.userId
      );

      sendSuccess(res, 'Document and initial version uploaded successfully', newDoc, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to upload document', null, 400);
    }
  }

  /**
   * POST /api/documents/:id/versions (Upload New Version)
   */
  static async uploadNewVersion(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }

      if (!req.file) {
        sendError(res, 'New file version is required', null, 400);
        return;
      }

      const validatedBody = uploadVersionSchema.parse(req.body);
      const updatedDoc = await DocumentService.uploadNewVersion(
        getRouteParam(req, 'id'),
        validatedBody,
        req.file,
        req.user.userId
      );

      sendSuccess(res, 'New document version uploaded successfully', updatedDoc, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to upload new version', null, 400);
    }
  }

  /**
   * POST /api/documents/versions/:versionId/review (Approve / Reject)
   */
  static async reviewVersion(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }

      const validatedBody = reviewVersionSchema.parse(req.body);
      const updatedDoc = await DocumentService.reviewVersion(
        getRouteParam(req, 'versionId'),
        validatedBody,
        req.user.userId
      );

      sendSuccess(
        res,
        `Document version ${validatedBody.status.toLowerCase()} successfully`,
        updatedDoc
      );
    } catch (error: any) {
      sendError(res, error.message || 'Failed to review document version', null, 400);
    }
  }

  /**
   * POST /api/documents/:id/comments
   */
  static async addComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Unauthorized', null, 401);
        return;
      }

      const validatedBody = createCommentSchema.parse(req.body);
      const comment = await DocumentService.addComment(
        getRouteParam(req, 'id'),
        validatedBody,
        req.user.userId
      );

      sendSuccess(res, 'Comment added successfully', comment, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to post comment', null, 400);
    }
  }

  /**
   * GET /api/documents/files/:fileName (Download / Stream File)
   */
  static async downloadFile(req: Request, res: Response): Promise<void> {
    try {
      const fileName = getRouteParam(req, 'fileName');
      const filePath = StorageService.getLocalFilePath(fileName);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ success: false, message: 'File not found on storage server' });
        return;
      }

      res.download(filePath, fileName);
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'File download error', error: error.message });
    }
  }
}
