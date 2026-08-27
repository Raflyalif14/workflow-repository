import { Router } from 'express';
import { DeadlineController } from '../controllers/deadline.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { calculateDeadlineSchema } from '../validators/deadline.validator';

const router = Router();

router.use(authenticateUser);

router.post(
  '/calculate',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  validateBody(calculateDeadlineSchema),
  DeadlineController.calculate
);

export default router;
