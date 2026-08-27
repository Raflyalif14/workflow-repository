import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { sendSuccess, sendError } from '../utils/response.util';
import { listUsersQuerySchema } from '../validators/user.validator';
import { getRouteParam } from '../utils/request.util';
import { AssignmentPhase5Service } from '../services/assignment-phase5.service';

export class UserController {
  static async listSolutionArchitects(req: Request, res: Response): Promise<void> {
    try { sendSuccess(res, 'Solution Architects retrieved successfully', await AssignmentPhase5Service.availablePics()); }
    catch (error: any) { sendError(res, error.message || 'Failed to retrieve Solution Architects', null, 400); }
  }
  static async listUsers(req: Request, res: Response): Promise<void> {
    try { sendSuccess(res, 'Users retrieved successfully', await UserService.listUsers(listUsersQuerySchema.parse(req.query))); }
    catch (error: any) { sendError(res, error.message || 'Failed to retrieve users', null, 400); }
  }
  static async createUser(req: Request, res: Response): Promise<void> {
    try { sendSuccess(res, 'User created successfully', await UserService.createUser(req.body), 201); }
    catch (error: any) { sendError(res, error.message || 'Failed to create user', null, 400); }
  }
  static async updateUser(req: Request, res: Response): Promise<void> {
    try { sendSuccess(res, 'User updated successfully', await UserService.updateUser(getRouteParam(req, 'id'), req.body)); }
    catch (error: any) { sendError(res, error.message || 'Failed to update user', null, 400); }
  }
  static async updateStatus(req: Request, res: Response): Promise<void> {
    try { sendSuccess(res, 'User status updated successfully', await UserService.updateStatus(getRouteParam(req, 'id'), Boolean(req.body.isActive))); }
    catch (error: any) { sendError(res, error.message || 'Failed to update user status', null, 400); }
  }
}
