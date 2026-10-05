import { Router } from 'express';
import { DeadlineApprovalController } from '../controllers/deadline-approval.controller';
import { DeadlineController } from '../controllers/deadline.controller';
import { MilestoneController } from '../controllers/milestone.controller';
import { MilestoneContributionController } from '../controllers/milestone-contribution.controller';
import { MilestoneInitiationApprovalController } from '../controllers/milestone-initiation-approval.controller';
import { SalesMilestoneDocumentController } from '../controllers/sales-milestone-document.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { saveMilestoneDeadlineSchema } from '../validators/deadline.validator';
import { createMilestoneContributionSchema } from '../validators/milestone-contribution.validator';
import { MAX_MILESTONE_FILES, uploadMiddleware } from '../utils/storage.util';
import { handleMultipartUpload } from '../middlewares/multipart-upload.middleware';

const router = Router();
const salesMilestoneDocumentsUpload = uploadMiddleware.array('files', MAX_MILESTONE_FILES);
const milestoneContributionUpload = uploadMiddleware.array('files', MAX_MILESTONE_FILES);

const uploadSalesMilestoneDocuments = handleMultipartUpload(salesMilestoneDocumentsUpload, 'Invalid milestone document upload.');
const uploadMilestoneContribution = handleMultipartUpload(milestoneContributionUpload, 'Invalid milestone supporting input upload.');

router.use(authenticateUser);

router.post(
  '/:milestoneId/contributions',
  requireRoles(['SALES']),
  uploadMilestoneContribution,
  validateBody(createMilestoneContributionSchema),
  MilestoneContributionController.create
);

router.get(
  '/:milestoneId/contributions',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  MilestoneContributionController.list
);

router.get(
  '/:milestoneId/contributions/:contributionId/attachments/:attachmentId/download-url',
  requireRoles(['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA']),
  MilestoneContributionController.getAttachmentDownloadUrl
);

router.post(
  '/:milestoneId/contributions/:contributionId/attachments/:attachmentId/promote',
  requireRoles(['SUPER_ADMIN', 'HEAD_SA']),
  MilestoneContributionController.promoteAttachment
);

router.post(
  '/:milestoneId/documents',
  requireRoles(['SALES', 'SUPER_ADMIN']),
  uploadSalesMilestoneDocuments,
  SalesMilestoneDocumentController.upload
);

router.post(
  '/:milestoneId/start',
  MilestoneInitiationApprovalController.retired
);

router.post(
  '/:milestoneId/complete',
  requireRoles(['SALES', 'HEAD_SA', 'SA']),
  MilestoneController.complete
);

router.post('/:milestoneId/retry-progression', requireRoles(['SA', 'HEAD_SA']), MilestoneController.retryProgression);

router.post(
  '/:milestoneId/request-initiation-approval',
  MilestoneInitiationApprovalController.retired
);

router.post(
  '/:milestoneId/initiate',
  MilestoneInitiationApprovalController.retired
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
