import { Router } from 'express';
import { ProjectController } from '../controllers/project.controller';
import { ProjectManagementController } from '../controllers/project-management.controller';
import { ProjectPlanApprovalController } from '../controllers/project-plan-approval.controller';
import { MilestoneInitiationApprovalController } from '../controllers/milestone-initiation-approval.controller';
import { AssignmentPhase5Controller } from '../controllers/assignment-phase5.controller';
import { assignPicSchema } from '../validators/assignment-phase5.validator';
import { authenticateJwt, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import {
  approveProjectPlanSchema,
  rejectProjectPlanSchema,
  saveProjectTimelineSchema,
  submitProjectPlanSchema,
} from '../validators/project-plan.validator';
import {
  triggerMilestoneSchema,
} from '../validators/project.validator';

const router = Router();

// Seluruh endpoint Project diproteksi dengan JWT Authentication
router.use(authenticateJwt);

// 1. Meta / Scenarios dropdown
router.get('/meta/scenarios', ProjectController.listScenarios);

// 2. Project List & Detail (Accessible by all internal roles)
router.get('/', ProjectManagementController.list);
router.get('/:id', ProjectManagementController.get);

// 3. Create Project (Sales & Super Admin)
router.post(
  '/',
  requireRoles(['SALES']),
  ProjectManagementController.create
);

router.put(
  '/:projectId/timeline',
  requireRoles(['SALES']),
  validateBody(saveProjectTimelineSchema),
  ProjectPlanApprovalController.saveTimeline
);
router.post(
  '/:projectId/plan/submit',
  requireRoles(['SALES']),
  validateBody(submitProjectPlanSchema),
  ProjectPlanApprovalController.submit
);
router.post(
  '/:projectId/plan/approve',
  requireRoles(['HEAD_SA']),
  validateBody(approveProjectPlanSchema),
  ProjectPlanApprovalController.approve
);
router.post(
  '/:projectId/plan/reject',
  requireRoles(['HEAD_SA']),
  validateBody(rejectProjectPlanSchema),
  ProjectPlanApprovalController.reject
);
router.get(
  '/:projectId/plan-approval',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  ProjectPlanApprovalController.getCurrent
);
router.get(
  '/:projectId/plan-approval-history',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  ProjectPlanApprovalController.getHistory
);

// 4. Postpone Project (Sales, Head SA, Super Admin)
router.post(
  '/:id/postpone',
  requireRoles(['SALES']),
  ProjectManagementController.postpone
);

router.patch('/:id', ProjectManagementController.update);
router.post('/:id/resume', requireRoles(['SALES']), ProjectManagementController.resume);

router.post('/:projectId/initialize-workflow', MilestoneInitiationApprovalController.retired);
router.get('/:projectId/milestones', ProjectManagementController.milestones);
router.get('/:projectId/progress', ProjectManagementController.progress);
router.post('/:projectId/milestones/:milestoneId/trigger', MilestoneInitiationApprovalController.retired);
router.post('/:projectId/milestones/:milestoneId/start', MilestoneInitiationApprovalController.retired);
router.post('/:projectId/milestones/:milestoneId/complete', MilestoneInitiationApprovalController.retired);

router.post('/:projectId/assign-pic', requireRoles(['HEAD_SA']), validateBody(assignPicSchema), AssignmentPhase5Controller.assign);
router.get('/:projectId/assignments', AssignmentPhase5Controller.history);

// 5. Trigger Milestone (Sales, SA, Head SA, Super Admin)
router.patch(
  '/milestones/:milestoneId/trigger',
  MilestoneInitiationApprovalController.retired
);

export default router;
