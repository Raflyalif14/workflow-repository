import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { getRouteParam } from '../utils/request.util';
import { sendError,sendSuccess } from '../utils/response.util';
import { ProjectScopeChangeService,ScopeChangeError } from '../services/project-scope-change.service';

export class ProjectScopeChangeController {
  static async list(req:AuthenticatedRequest,res:Response){
    try{sendSuccess(res,'Scope change requests',await ProjectScopeChangeService.list(getRouteParam(req,'projectId'),req.user!));}
    catch(error){ProjectScopeChangeController.fail(res,error);}
  }
  static async save(req:AuthenticatedRequest,res:Response){
    try{sendSuccess(res,'Scope change saved',await ProjectScopeChangeService.mutate(getRouteParam(req,'projectId'),
      req.params.changeId ? getRouteParam(req,'changeId'):undefined,req.body,req.user!));}
    catch(error){ProjectScopeChangeController.fail(res,error);}
  }
  private static fail(res:Response,error:unknown){
    const safe=error instanceof ScopeChangeError?error:new ScopeChangeError(503,'SCOPE_UNAVAILABLE');
    sendError(res,'Unable to process project plan change.',{code:safe.code},safe.statusCode);
  }
}
