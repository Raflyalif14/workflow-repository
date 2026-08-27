import { Router } from 'express';
import { DeadlineApprovalController } from '../controllers/deadline-approval.controller';
import { DeadlineController } from '../controllers/deadline.controller';
import { MilestoneApprovalController } from '../controllers/milestone-approval.controller';
import { MilestoneController } from '../controllers/milestone.controller';
import { MilestoneInitiationApprovalController } from '../controllers/milestone-initiation-approval.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { saveMilestoneDeadlineSchema } from '../validators/deadline.validator';
import { requestMilestoneInitiationApprovalSchema } from '../validators/milestone-initiation-approval.validator';
import { submitMilestoneSchema } from '../validators/milestone.validator';

const router = Router();

router.use(authenticateUser);

router.post(
  '/:milestoneId/submit',
  requireRoles(['SA']),
  validateBody(submitMilestoneSchema),
  MilestoneController.submit
);

router.post(
  '/:milestoneId/start-revision',
  requireRoles(['SA']),
  MilestoneController.startRevision
);

router.post(
  '/:milestoneId/request-initiation-approval',
  requireRoles(['SALES']),
  validateBody(requestMilestoneInitiationApprovalSchema),
  MilestoneInitiationApprovalController.request
);

router.post(
  '/:milestoneId/initiate',
  requireRoles(['SALES']),
  MilestoneInitiationApprovalController.initiate
);

router.patch(
  '/:milestoneId/deadline',
  requireRoles(['SALES']),
  validateBody(saveMilestoneDeadlineSchema),
  DeadlineController.saveMilestoneDeadline
);

router.get(
  '/:milestoneId/deadline-history',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  DeadlineController.getMilestoneDeadlineHistory
);

router.get(
  '/:milestoneId/deadline-status',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  DeadlineController.getMilestoneDeadlineStatus
);

router.get(
  '/:milestoneId/deadline-approval',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  DeadlineApprovalController.getCurrent
);

router.get(
  '/:milestoneId/deadline-approval-history',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  DeadlineApprovalController.getHistory
);

router.get(
  '/:milestoneId/approval-history',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  MilestoneApprovalController.getHistory
);

router.get(
  '/:milestoneId/initiation-approval',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  MilestoneInitiationApprovalController.getCurrent
);

router.get(
  '/:milestoneId/initiation-approval-history',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  MilestoneInitiationApprovalController.getHistory
);

export default router;
