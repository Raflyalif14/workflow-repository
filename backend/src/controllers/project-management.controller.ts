import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendError, sendSuccess } from '../utils/response.util';
import { getRouteParam } from '../utils/request.util';
import { ProjectManagementService } from '../services/project-management.service';
import { MilestoneService } from '../services/milestone.service';
import { createProjectManagementSchema, projectQuerySchema, updateProjectManagementSchema, postponeManagementSchema } from '../validators/project-management.validator';

const actor = (req: AuthenticatedRequest) => req.user!;
const run = async (res: Response, action: () => Promise<unknown>, message: string, status = 200) => {
  try { sendSuccess(res, message, await action(), status); }
  catch (error: any) { const code = error.message === 'Forbidden' ? 403 : error.message?.includes('not found') ? 404 : 400; sendError(res, error.message || 'Something went wrong', null, code); }
};

export class ProjectManagementController {
  static list = (req: AuthenticatedRequest, res: Response) => run(res, () => ProjectManagementService.list(projectQuerySchema.parse(req.query), actor(req)), 'Projects retrieved successfully');
  static get = (req: AuthenticatedRequest, res: Response) => run(res, () => ProjectManagementService.get(getRouteParam(req, 'id'), actor(req)), 'Project retrieved successfully');
  static create = (req: AuthenticatedRequest, res: Response) => run(res, () => ProjectManagementService.create(createProjectManagementSchema.parse(req.body), actor(req)), 'Project created successfully', 201);
  static update = (req: AuthenticatedRequest, res: Response) => run(res, () => ProjectManagementService.update(getRouteParam(req, 'id'), updateProjectManagementSchema.parse(req.body), actor(req)), 'Project updated successfully');
  static postpone = (req: AuthenticatedRequest, res: Response) => run(res, () => ProjectManagementService.postpone(getRouteParam(req, 'id'), postponeManagementSchema.parse(req.body).reason, actor(req)), 'Project postponed successfully');
  static resume = (req: AuthenticatedRequest, res: Response) => run(res, () => ProjectManagementService.resume(getRouteParam(req, 'id'), actor(req)), 'Project resumed successfully');
  static initializeWorkflow = (req: AuthenticatedRequest, res: Response) => run(res, () => MilestoneService.initialize(getRouteParam(req, 'projectId'), actor(req)), 'Workflow initialized successfully');
  static milestones = (req: AuthenticatedRequest, res: Response) => run(res, () => MilestoneService.list(getRouteParam(req, 'projectId'), actor(req)), 'Project milestones retrieved successfully');
  static progress = (req: AuthenticatedRequest, res: Response) => run(res, () => MilestoneService.progress(getRouteParam(req, 'projectId'), actor(req)), 'Project progress retrieved successfully');
  static triggerMilestone = (req: AuthenticatedRequest, res: Response) => run(res, () => MilestoneService.trigger(getRouteParam(req, 'projectId'), getRouteParam(req, 'milestoneId'), actor(req)), 'Milestone triggered successfully');
  static startMilestone = (req: AuthenticatedRequest, res: Response) => run(res, () => MilestoneService.start(getRouteParam(req, 'projectId'), getRouteParam(req, 'milestoneId'), actor(req)), 'Milestone started successfully');
  static completeMilestone = (req: AuthenticatedRequest, res: Response) => run(res, () => MilestoneService.complete(getRouteParam(req, 'projectId'), getRouteParam(req, 'milestoneId'), actor(req)), 'Milestone completed successfully');
}
