import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { UserService, UserServiceError } from '../services/user.service';
import { sendSuccess, sendError } from '../utils/response.util';
import { listUsersQuerySchema } from '../validators/user.validator';
import { getRouteParam } from '../utils/request.util';
import { AssignmentPhase5Service } from '../services/assignment-phase5.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const sendUserError = (res: Response, error: unknown, fallback: string): void => {
  if (error instanceof ZodError) {
    sendError(
      res,
      'Validation failed',
      error.errors.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
      422
    );
    return;
  }

  if (error instanceof UserServiceError) {
    sendError(res, error.message, null, error.statusCode);
    return;
  }

  console.error('[UserController] Unexpected user management error.');
  sendError(res, fallback, null, 500);
};

export class UserController {
  static async listSolutionArchitects(req: AuthenticatedRequest, res: Response): Promise<void> {
    try { sendSuccess(res, 'Solution Architects retrieved successfully', await AssignmentPhase5Service.availablePics(req.user!)); }
    catch { sendError(res, 'Failed to retrieve Solution Architects', null, 500); }
  }
  static async listUsers(req: Request, res: Response): Promise<void> {
    try { sendSuccess(res, 'Users retrieved successfully', await UserService.listUsers(listUsersQuerySchema.parse(req.query))); }
    catch (error) { sendUserError(res, error, 'Failed to retrieve users.'); }
  }
  static async createUser(req: Request, res: Response): Promise<void> {
    try { sendSuccess(res, 'User created successfully', await UserService.createUser(req.body), 201); }
    catch (error) { sendUserError(res, error, 'Failed to create user.'); }
  }
  static async updateUser(req: Request, res: Response): Promise<void> {
    try { sendSuccess(res, 'User updated successfully', await UserService.updateUser(getRouteParam(req, 'id'), req.body)); }
    catch (error) { sendUserError(res, error, 'Failed to update user.'); }
  }
  static async updateStatus(req: Request, res: Response): Promise<void> {
    try { sendSuccess(res, 'User status updated successfully', await UserService.updateStatus(getRouteParam(req, 'id'), req.body.isActive)); }
    catch (error) { sendUserError(res, error, 'Failed to update user status.'); }
  }
}
