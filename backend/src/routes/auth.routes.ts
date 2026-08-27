import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validateBody } from '../middlewares/validate.middleware';
import { changeInitialPasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from '../validators/auth.validator';
import { authenticateUser } from '../middlewares/auth.middleware';

const router = Router();
router.post('/register', validateBody(registerSchema), AuthController.register);
router.post('/login', validateBody(loginSchema), AuthController.login);
router.post('/forgot-password', validateBody(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', validateBody(resetPasswordSchema), AuthController.resetPassword);
router.post('/change-initial-password', authenticateUser, validateBody(changeInitialPasswordSchema), AuthController.changeInitialPassword);
router.post('/logout', authenticateUser, AuthController.logout);
router.get('/me', authenticateUser, AuthController.getMe);

export default router;
