import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { DocumentAccessError,DocumentAccessService } from '../services/document-access.service';
import { sendError,sendSuccess } from '../utils/response.util';
const project = z.object({ projectId:z.string().uuid() });
const input = z.object({ mode:z.enum(['RESTRICTED','SHARED_INTERNAL']),expected_revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),request_id:z.string().uuid() }).strict();
const run = async (req:AuthenticatedRequest,res:Response,write:boolean) => {
  try {
    const { projectId }=project.parse(req.params);
    const data=write ? await DocumentAccessService.saveProjectSharing(req.user!,projectId,input.parse(req.body))
      : await DocumentAccessService.getProjectSharing(req.user!,projectId);
    sendSuccess(res,'Project document sharing retrieved successfully',data);
  } catch(error) { sendError(res,error instanceof DocumentAccessError ? error.message : 'Unable to process project document sharing.',null,
    error instanceof DocumentAccessError ? error.statusCode : error instanceof ZodError ? 422 : 503); }
};
export class ProjectDocumentSharingController {
  static get=(req:AuthenticatedRequest,res:Response) => run(req,res,false);
  static save=(req:AuthenticatedRequest,res:Response) => run(req,res,true);
}
