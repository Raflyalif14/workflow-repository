import { Router } from 'express';
import { ApprovalCenterController } from '../controllers/approval-center.controller';
import { authenticateJwt, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { processApprovalSchema, approvalCommentSchema } from '../validators/approval.validator';

const router = Router();

router.use(authenticateJwt);

// 1. Get statistics overview
router.get('/stats', ApprovalCenterController.getStats);

// 2. List approvals (Filtered by DEADLINE, MILESTONE, DOCUMENT)
router.get('/', ApprovalCenterController.listApprovals);

// 3. Process Decision: Approve / Reject (Head SA & Super Admin)
router.post(
  '/:id/decision',
  requireRoles(['HEAD_SOLUTION_ARCHITECT', 'SUPER_ADMIN']),
  validateBody(processApprovalSchema),
  ApprovalCenterController.processDecision
);

// 4. Add Comment on approval ticket
router.post(
  '/:id/comments',
  validateBody(approvalCommentSchema),
  ApprovalCenterController.addComment
);

export default router;
