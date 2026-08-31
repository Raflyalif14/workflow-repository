import { Router } from 'express';
import { ProjectPlanApprovalController } from '../controllers/project-plan-approval.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateUser);
router.get('/pending', requireRoles(['SUPER_ADMIN', 'HEAD_SA']), ProjectPlanApprovalController.getPending);

export default router;
