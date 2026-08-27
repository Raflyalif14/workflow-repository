import { Request, Response } from 'express';
import { ScenarioService } from '../services/scenario.service';
import { sendError, sendSuccess } from '../utils/response.util';
import { getRouteParam } from '../utils/request.util';
import { createScenarioSchema, updateScenarioSchema, scenarioQuerySchema, scenarioStatusSchema, createStageSchema, updateStageSchema, reorderSchema } from '../validators/scenario.validator';

const handle = async (res: Response, action: () => Promise<unknown>, message: string, status = 200) => {
  try { sendSuccess(res, message, await action(), status); }
  catch (error: any) { sendError(res, error.message || 'Something went wrong', null, error.message?.includes('not found') ? 404 : 400); }
};

export class ScenarioController {
  static list = (req: Request, res: Response) => handle(res, () => ScenarioService.list(scenarioQuerySchema.parse(req.query)), 'Scenarios retrieved successfully');
  static get = (req: Request, res: Response) => handle(res, () => ScenarioService.get(getRouteParam(req, 'id')), 'Scenario retrieved successfully');
  static create = (req: any, res: Response) => handle(res, () => ScenarioService.create(createScenarioSchema.parse(req.body), req.user?.userId), 'Scenario created successfully', 201);
  static update = (req: any, res: Response) => handle(res, () => ScenarioService.update(getRouteParam(req, 'id'), updateScenarioSchema.parse(req.body), req.user?.userId), 'Scenario updated successfully');
  static status = (req: any, res: Response) => handle(res, () => ScenarioService.updateStatus(getRouteParam(req, 'id'), scenarioStatusSchema.parse(req.body).is_active, req.user?.userId), 'Scenario status updated successfully');
  static workflow = (req: Request, res: Response) => handle(res, () => ScenarioService.workflow(getRouteParam(req, 'scenarioId')), 'Workflow retrieved successfully');
  static createStage = (req: any, res: Response) => handle(res, () => ScenarioService.createStage(getRouteParam(req, 'scenarioId'), createStageSchema.parse(req.body), req.user?.userId), 'Workflow stage created successfully', 201);
  static updateStage = (req: any, res: Response) => handle(res, () => ScenarioService.updateStage(getRouteParam(req, 'id'), updateStageSchema.parse(req.body), req.user?.userId), 'Workflow stage updated successfully');
  static deleteStage = (req: any, res: Response) => handle(res, () => ScenarioService.deleteStage(getRouteParam(req, 'id'), req.user?.userId), 'Workflow stage deactivated successfully');
  static reorder = (req: any, res: Response) => handle(res, () => ScenarioService.reorder(getRouteParam(req, 'scenarioId'), reorderSchema.parse(req.body).stages, req.user?.userId), 'Workflow reordered successfully');
}
