import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller';
import { OutputDocumentController } from '../controllers/output-document.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';
import { uploadMiddleware } from '../utils/storage.util';

const router = Router();

router.use(authenticateUser);

router.get('/', DocumentController.listDocuments);
router.get('/outputs', requireRoles(['SUPER_ADMIN', 'HEAD_SA', 'SALES', 'SA']), OutputDocumentController.listAccessibleFiles);
router.get('/versions/:versionId/download-url', DocumentController.getDownloadUrl);
router.get('/:id', DocumentController.getDocument);
router.post('/', DocumentController.retiredCreateDocument);
router.post('/:id/versions', uploadMiddleware.single('file'), DocumentController.uploadNewVersion);
router.post(
  '/versions/:versionId/review',
  requireRoles(['HEAD_SA', 'SUPER_ADMIN']),
  DocumentController.reviewVersion
);
router.post('/:id/comments', DocumentController.addComment);

export default router;
