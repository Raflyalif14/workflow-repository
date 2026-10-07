import { Router } from 'express';
import { refreshAuthSession } from '../services/auth-session.service';
import { AuthRequestError, authUnavailable } from '../utils/auth-error';
import { refreshSessionSchema } from '../validators/auth.validator';
import { sendSuccess } from '../utils/response.util';
import { AuthController } from '../controllers/auth.controller';
import { validateBody } from '../middlewares/validate.middleware';
import { changeInitialPasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, updateLanguagePreferenceSchema } from '../validators/auth.validator';
import { authenticateUser } from '../middlewares/auth.middleware';
import {
  AUTH_RATE_LIMITS,
  createAuthRateLimiter,
  loginRateLimiter,
} from '../middlewares/auth-rate-limit.middleware';

const router = Router();
router.post('/register', createAuthRateLimiter(AUTH_RATE_LIMITS.register), validateBody(registerSchema), AuthController.register);
router.post('/refresh', createAuthRateLimiter(AUTH_RATE_LIMITS.refresh), (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}, validateBody(refreshSessionSchema), async (req, res, next) => {
  try { sendSuccess(res, 'Session refreshed', await refreshAuthSession(req.body.refreshToken)); }
  catch (error) { next(error instanceof AuthRequestError ? error : authUnavailable()); }
});
router.post(
  '/login',
  loginRateLimiter,
  validateBody(loginSchema),
  AuthController.login
);
router.post('/forgot-password', createAuthRateLimiter(AUTH_RATE_LIMITS.forgotPassword), validateBody(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', createAuthRateLimiter(AUTH_RATE_LIMITS.resetPassword), validateBody(resetPasswordSchema), AuthController.resetPassword);
router.post('/change-initial-password', authenticateUser, validateBody(changeInitialPasswordSchema), AuthController.changeInitialPassword);
router.post('/logout', authenticateUser, AuthController.logout);
router.get('/me', authenticateUser, AuthController.getMe);
router.get('/preferences/language', authenticateUser, AuthController.getLanguagePreference);
router.put('/preferences/language', authenticateUser, validateBody(updateLanguagePreferenceSchema), AuthController.updateLanguagePreference);

export default router;
