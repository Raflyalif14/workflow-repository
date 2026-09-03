import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validateBody } from '../middlewares/validate.middleware';
import { changeInitialPasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from '../validators/auth.validator';
import { authenticateUser } from '../middlewares/auth.middleware';
import { AUTH_RATE_LIMITS, createAuthRateLimiter } from '../middlewares/auth-rate-limit.middleware';

const router = Router();
router.post('/register', validateBody(registerSchema), AuthController.register);
router.post('/login', createAuthRateLimiter(AUTH_RATE_LIMITS.login), validateBody(loginSchema), AuthController.login);
router.post('/forgot-password', createAuthRateLimiter(AUTH_RATE_LIMITS.forgotPassword), validateBody(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', createAuthRateLimiter(AUTH_RATE_LIMITS.resetPassword), validateBody(resetPasswordSchema), AuthController.resetPassword);
router.post('/change-initial-password', authenticateUser, validateBody(changeInitialPasswordSchema), AuthController.changeInitialPassword);
router.post('/logout', authenticateUser, AuthController.logout);
router.get('/me', authenticateUser, AuthController.getMe);

export default router;
