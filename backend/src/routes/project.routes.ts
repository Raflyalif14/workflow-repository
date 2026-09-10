import { NextFunction, Request, Response, Router } from 'express';
import { ProjectManagementController } from '../controllers/project-management.controller';
import { ProjectActivityController } from '../controllers/project-activity.controller';
import { ProjectPlanApprovalController } from '../controllers/project-plan-approval.controller';
import { MilestoneInitiationApprovalController } from '../controllers/milestone-initiation-approval.controller';
import { AssignmentPhase5Controller } from '../controllers/assignment-phase5.controller';
import { ProjectDeletionController } from '../controllers/project-deletion.controller';
import { ProjectIntakeController } from '../controllers/project-intake.controller';
import {
  MAX_PROJECT_CREATION_OPTIONAL_DOCUMENTS,
  MAX_PROJECT_CREATION_PHOTOS,
} from '../services/project-management.service';
import { assignPicSchema } from '../validators/assignment-phase5.validator';
import { authenticateJwt, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { uploadMiddleware } from '../utils/storage.util';
import {
  approveProjectPlanSchema,
  rejectProjectPlanSchema,
  saveProjectTimelineSchema,
  submitProjectPlanSchema,
} from '../validators/project-plan.validator';

const router = Router();
const projectCreationUpload = uploadMiddleware.fields([
  { name: 'mom', maxCount: 1 },
  { name: 'photos', maxCount: MAX_PROJECT_CREATION_PHOTOS },
  { name: 'documents', maxCount: MAX_PROJECT_CREATION_OPTIONAL_DOCUMENTS },
]);

const uploadProjectCreationFiles = (req: Request, res: Response, next: NextFunction): void => {
  projectCreationUpload(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    const safeError = new Error('Invalid project document upload.') as Error & { statusCode?: number };
    safeError.statusCode = 400;
    next(safeError);
  });
};

// Seluruh endpoint Project diproteksi dengan JWT Authentication
router.use(authenticateJwt);

// 1. Project List & Detail (Accessible by all internal roles)
router.get('/', ProjectManagementController.list);
router.get('/:projectId/deletion-preview', requireRoles(['SUPER_ADMIN']), ProjectDeletionController.preview);
router.delete('/:projectId', requireRoles(['SUPER_ADMIN']), ProjectDeletionController.delete);
router.post('/deletion-cleanups/:cleanupId/retry', requireRoles(['SUPER_ADMIN']), ProjectDeletionController.retry);
router.get('/:projectId/activities', ProjectActivityController.list);
router.get(
  '/:projectId/intake-attachments',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  ProjectIntakeController.list
);
router.get(
  '/:projectId/intake-attachments/:attachmentId/download-url',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  ProjectIntakeController.getDownloadUrl
);
router.get('/:id', ProjectManagementController.get);

// 2. Create Project (Sales)
router.post(
  '/',
  requireRoles(['SALES']),
  uploadProjectCreationFiles,
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

// 3. Postpone Project (Sales)
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

// Retained compatibility endpoint. The retired controller returns HTTP 410.
router.patch(
  '/milestones/:milestoneId/trigger',
  MilestoneInitiationApprovalController.retired
);

export default router;
