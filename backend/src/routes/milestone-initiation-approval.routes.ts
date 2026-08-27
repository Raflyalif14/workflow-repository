import { Router } from 'express';
import { MilestoneInitiationApprovalController } from '../controllers/milestone-initiation-approval.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import {
  approveMilestoneInitiationApprovalSchema,
  rejectMilestoneInitiationApprovalSchema,
} from '../validators/milestone-initiation-approval.validator';

const router = Router();

router.use(authenticateUser);
router.use(requireRoles(['HEAD_SA']));

router.post('/:approvalId/approve', validateBody(approveMilestoneInitiationApprovalSchema), MilestoneInitiationApprovalController.approve);
router.post('/:approvalId/reject', validateBody(rejectMilestoneInitiationApprovalSchema), MilestoneInitiationApprovalController.reject);

export default router;
