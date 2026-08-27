import { Router } from 'express';
import { DeadlineApprovalController } from '../controllers/deadline-approval.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { approveDeadlineApprovalSchema, rejectDeadlineApprovalSchema } from '../validators/deadline-approval.validator';

const router = Router();

router.use(authenticateUser);
router.use(requireRoles(['HEAD_SA']));

router.post('/:approvalId/approve', validateBody(approveDeadlineApprovalSchema), DeadlineApprovalController.approve);
router.post('/:approvalId/reject', validateBody(rejectDeadlineApprovalSchema), DeadlineApprovalController.reject);

export default router;
