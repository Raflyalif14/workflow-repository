import { Router } from 'express';
import { MilestoneApprovalController } from '../controllers/milestone-approval.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { approveMilestoneApprovalSchema, rejectMilestoneApprovalSchema } from '../validators/milestone-approval.validator';

const router = Router();

router.use(authenticateUser);
router.use(requireRoles(['HEAD_SA']));

router.post('/:approvalId/approve', validateBody(approveMilestoneApprovalSchema), MilestoneApprovalController.approve);
router.post('/:approvalId/reject', validateBody(rejectMilestoneApprovalSchema), MilestoneApprovalController.reject);

export default router;
