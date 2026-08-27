import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../validators/auth.validator';
import { supabaseAdmin } from '../config/supabase';
import { sendError } from '../utils/response.util';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
    fullName: string;
    isActive: boolean;
    must_change_password: boolean;
    mustChangePassword: boolean;
  };
}

const passwordChangeExemptPaths = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/change-initial-password',
  '/api/auth/me',
];

const isPasswordChangeExempt = (req: Request) => passwordChangeExemptPaths.includes(req.originalUrl.split('?')[0]);

export const requirePasswordChanged = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user?.must_change_password && !isPasswordChangeExempt(req)) {
    sendError(res, 'You must change your initial password before accessing this resource.', null, 403);
    return;
  }

  next();
};

export const authenticateUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) { sendError(res, 'Access denied. Missing or malformed Authorization header', null, 401); return; }
  const { data, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7).trim());
  if (error || !data.user) { sendError(res, 'Invalid or expired access token', null, 401); return; }
  const { data: profile, error: profileError } = await supabaseAdmin.from('users').select('id, email, full_name, role, is_active, must_change_password').eq('id', data.user.id).single();
  if (profileError || !profile || !profile.is_active) { sendError(res, profile ? 'User account is inactive' : 'User profile not found', null, 401); return; }
  req.user = {
    userId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    isActive: profile.is_active,
    must_change_password: profile.must_change_password ?? false,
    mustChangePassword: profile.must_change_password ?? false,
  };
  requirePasswordChanged(req, res, next);
};

export const authenticateJwt = authenticateUser;
export const requireRoles = (allowedRoles: string[]) => (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) { sendError(res, 'Unauthorized: User authentication required', null, 401); return; }
  if (!allowedRoles.includes(req.user.role)) { sendError(res, `Forbidden: Role '${req.user.role}' does not have access to this resource`, { allowedRoles }, 403); return; }
  next();
};
