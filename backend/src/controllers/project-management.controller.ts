import { ProjectCreationRequestError, projectCreationRequestId } from '../services/project-creation.service';
import { BusinessAuditError, businessRequestContext } from '../services/business-audit.service';
import { PhaseDecisionError, ProjectPhaseService } from '../services/project-phase.service';
import { z } from 'zod';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendError, sendSuccess } from '../utils/response.util';
import { getRouteParam } from '../utils/request.util';
import { ProjectCreationError, ProjectManagementService } from '../services/project-management.service';
import { MilestoneService } from '../services/milestone.service';
import { createProjectManagementSchema, projectDetailQuerySchema, projectOutcomeSchema, projectQuerySchema, updateProjectManagementSchema, postponeManagementSchema } from '../validators/project-management.validator';
import { getRequestTiming } from '../utils/request-timing';

const actor = (req: AuthenticatedRequest) => req.user!;
const run = async (res: Response, action: () => Promise<unknown>, message: string, status = 200) => {
  try { sendSuccess(res, message, await action(), status); }
  catch (error: any) {
    if (error instanceof ProjectCreationRequestError) { sendError(res, error.message, { code: error.code }, error.statusCode); return; }
    const code = error instanceof BusinessAuditError || error instanceof ProjectCreationError || error instanceof PhaseDecisionError
      ? error.statusCode
      : error.message === 'Forbidden'
        ? 403
        : error.message?.includes('not found')
          ? 404
          : 400;
    sendError(res, error.message || 'Something went wrong', null, code);
  }
};

export class ProjectManagementController {
  static closePraTender = (req: AuthenticatedRequest, res: Response) => run(res, () => {
    z.object({}).strict().parse(req.body);
    return ProjectPhaseService.closePraTender(getRouteParam(req, 'projectId'), actor(req));
  }, 'Pra-Tender decision saved successfully');
  static continuePhase = (req: AuthenticatedRequest, res: Response) => run(res, () => ProjectPhaseService.continue(getRouteParam(req, "projectId"), z.object({ selected_document_keys: z.array(z.string()).max(7) }).parse(req.body).selected_document_keys, actor(req)), "Phase created successfully");
  static list = (req: AuthenticatedRequest, res: Response) => run(res, () => ProjectManagementService.list(projectQuerySchema.parse(req.query), actor(req), getRequestTiming(req)), 'Projects retrieved successfully');
  static get = (req: AuthenticatedRequest, res: Response) => run(res, () => ProjectManagementService.get(getRouteParam(req, 'id'), actor(req), { includeActivity: projectDetailQuerySchema.parse(req.query).include_activity === 'true' }), 'Project retrieved successfully');
  static create = (req: AuthenticatedRequest, res: Response) => run(res, () => {
    const uploaded = (req.files || {}) as Record<string, Express.Multer.File[]>;
    return ProjectManagementService.create(
      createProjectManagementSchema.parse(req.body),
      actor(req),
      {
        mom: Array.isArray(uploaded.mom) ? uploaded.mom : [],
        photos: Array.isArray(uploaded.photos) ? uploaded.photos : [],
        documents: Array.isArray(uploaded.documents) ? uploaded.documents : [],
      }, projectCreationRequestId(req.headers['x-project-create-request-id'])
    );
  }, 'Project created successfully', 201);
  static update = (req: AuthenticatedRequest, res: Response) => run(res, () => ProjectManagementService.update(getRouteParam(req, 'id'), updateProjectManagementSchema.parse(req.body), actor(req), businessRequestContext(req.headers)), 'Project updated successfully');
  static postpone = (req: AuthenticatedRequest, res: Response) => run(res, () => ProjectManagementService.postpone(getRouteParam(req, 'id'), postponeManagementSchema.parse(req.body).reason, actor(req), businessRequestContext(req.headers)), 'Project postponed successfully');
  static resume = (req: AuthenticatedRequest, res: Response) => run(res, () => ProjectManagementService.resume(getRouteParam(req, 'id'), actor(req), businessRequestContext(req.headers)), 'Project resumed successfully');
  static setOutcome = (req: AuthenticatedRequest, res: Response) => run(
    res,
    () => ProjectManagementService.setOutcome(getRouteParam(req, 'id'), projectOutcomeSchema.parse(req.body), actor(req), businessRequestContext(req.headers)),
    'Project outcome recorded successfully'
  );
  static milestones = (req: AuthenticatedRequest, res: Response) => run(res, () => MilestoneService.list(getRouteParam(req, 'projectId'), actor(req)), 'Project milestones retrieved successfully');
  static progress = (req: AuthenticatedRequest, res: Response) => run(res, () => MilestoneService.progress(getRouteParam(req, 'projectId'), actor(req)), 'Project progress retrieved successfully');
}
