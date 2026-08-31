import { Router } from 'express';
import { MilestoneInitiationApprovalController } from '../controllers/milestone-initiation-approval.controller';
import { authenticateUser } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateUser);

router.post('/:approvalId/approve', MilestoneInitiationApprovalController.retired);
router.post('/:approvalId/reject', MilestoneInitiationApprovalController.retired);

export default router;
