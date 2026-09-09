import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { sendSuccess, sendError } from '../utils/response.util';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { resetLoginRateLimit } from '../middlewares/auth-rate-limit.middleware';

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    try { sendSuccess(res, 'Registration successful', await AuthService.register(req.body), 201); }
    catch (error: any) {
      const message = error.message || 'Registration failed';
      const status = message.includes('already registered') ? 409 : message.includes('internal company domain') ? 422 : 400;
      sendError(res, message, null, status);
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const result = await AuthService.login(req.body);

      resetLoginRateLimit(req);

      sendSuccess(res, 'Login successful', result);
    } catch (error: any) {
      sendError(res, error.message || 'Authentication failed', null, 401);
    }
  }

  static async forgotPassword(req: Request, res: Response): Promise<void> {
    try { sendSuccess(res, 'Password reset request processed', await AuthService.forgotPassword(req.body)); }
    catch { sendSuccess(res, 'Password reset request processed', { message: 'If an account exists, password reset instructions have been sent.' }); }
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    try { sendSuccess(res, 'Password reset successful', await AuthService.resetPassword(req.body)); }
    catch (error: any) {
      const message = error.message || 'Invalid or expired password reset token.';
      const status = message.includes('Invalid or expired') ? 400 : 400;
      sendError(res, message, null, status);
    }
  }

  static async changeInitialPassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    try { sendSuccess(res, 'Password changed successfully', await AuthService.changeInitialPassword(req.user!.userId, req.body)); }
    catch (error: any) {
      const message = error.message || 'Failed to change initial password';
      const status = message.includes('already been changed') ? 400 : message.includes('not found') ? 404 : 400;
      sendError(res, message, null, status);
    }
  }

  static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await AuthService.logout(req.headers.authorization?.slice('Bearer '.length) || '');
      sendSuccess(res, 'Logged out successfully', null);
    } catch (error: any) { sendError(res, error.message || 'Logout failed', null, 400); }
  }

  static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try { sendSuccess(res, 'Profile retrieved successfully', await AuthService.getProfile(req.user!.userId)); }
    catch (error: any) { sendError(res, error.message || 'Failed to retrieve profile', null, 404); }
  }
}
