import { Router } from 'express';
import { ProjectController } from '../controllers/project.controller';
import { ProjectManagementController } from '../controllers/project-management.controller';
import { AssignmentPhase5Controller } from '../controllers/assignment-phase5.controller';
import { assignPicSchema } from '../validators/assignment-phase5.validator';
import { authenticateJwt, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
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
  requireRoles(['SALES', 'SUPER_ADMIN']),
  ProjectManagementController.create
);

// 4. Postpone Project (Sales, Head SA, Super Admin)
router.post(
  '/:id/postpone',
  requireRoles(['SALES', 'SUPER_ADMIN']),
  ProjectManagementController.postpone
);

router.patch('/:id', ProjectManagementController.update);
router.post('/:id/resume', ProjectManagementController.resume);

router.post('/:projectId/initialize-workflow', requireRoles(['SALES', 'SUPER_ADMIN']), ProjectManagementController.initializeWorkflow);
router.get('/:projectId/milestones', ProjectManagementController.milestones);
router.get('/:projectId/progress', ProjectManagementController.progress);
router.post('/:projectId/milestones/:milestoneId/trigger', requireRoles(['SALES', 'SUPER_ADMIN']), ProjectManagementController.triggerMilestone);
router.post('/:projectId/milestones/:milestoneId/start', requireRoles(['SALES', 'SUPER_ADMIN']), ProjectManagementController.startMilestone);
router.post('/:projectId/milestones/:milestoneId/complete', requireRoles(['SALES', 'SUPER_ADMIN']), ProjectManagementController.completeMilestone);

router.post('/:projectId/assign-pic', requireRoles(['HEAD_SA']), validateBody(assignPicSchema), AssignmentPhase5Controller.assign);
router.get('/:projectId/assignments', AssignmentPhase5Controller.history);

// 5. Trigger Milestone (Sales, SA, Head SA, Super Admin)
router.patch(
  '/milestones/:milestoneId/trigger',
  requireRoles(['SALES', 'SOLUTION_ARCHITECT', 'HEAD_SOLUTION_ARCHITECT', 'SUPER_ADMIN']),
  validateBody(triggerMilestoneSchema),
  ProjectController.triggerMilestone
);

export default router;
