import { Router } from 'express';
import { WorkflowEngineController } from '../controllers/workflow-engine.controller';
import { authenticateJwt, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import {
  submitMilestoneSchema,
  approveMilestoneSchema,
  rejectMilestoneSchema,
  assignPicSchema,
} from '../validators/workflow-engine.validator';

const router = Router();

router.use(authenticateJwt);

// 1. Start Milestone (Sales, SA, Head SA, Super Admin)
router.post('/milestones/:id/start', WorkflowEngineController.startMilestone);

// 2. Submit Milestone for Review / Completion (SA, Sales, Super Admin)
router.post(
  '/milestones/:id/submit',
  validateBody(submitMilestoneSchema),
  WorkflowEngineController.submitMilestone
);

// 3. Approve Milestone (Head SA & Super Admin)
router.post(
  '/milestones/:id/approve',
  requireRoles(['HEAD_SOLUTION_ARCHITECT', 'SUPER_ADMIN']),
  validateBody(approveMilestoneSchema),
  WorkflowEngineController.approveMilestone
);

// 4. Reject Milestone (Head SA & Super Admin)
router.post(
  '/milestones/:id/reject',
  requireRoles(['HEAD_SOLUTION_ARCHITECT', 'SUPER_ADMIN']),
  validateBody(rejectMilestoneSchema),
  WorkflowEngineController.rejectMilestone
);

// 5. Assign PIC (Head SA, Sales, Super Admin)
router.post(
  '/milestones/:id/assign-pic',
  requireRoles(['HEAD_SOLUTION_ARCHITECT', 'SALES', 'SUPER_ADMIN']),
  validateBody(assignPicSchema),
  WorkflowEngineController.assignPic
);

export default router;
