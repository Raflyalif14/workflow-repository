import { Router } from 'express';
import { ApprovalOverviewController } from '../controllers/approval-overview.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateUser);

router.get(
  '/overview',
  requireRoles(['SUPER_ADMIN', 'HEAD_SA']),
  ApprovalOverviewController.getOverview
);

export default router;
