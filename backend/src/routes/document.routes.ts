import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller';
import { OutputDocumentController } from '../controllers/output-document.controller';
import { DocumentAccessController } from '../controllers/document-access.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';
import { uploadMiddleware } from '../utils/storage.util';
import { handleMultipartUpload } from '../middlewares/multipart-upload.middleware';

const router = Router();

router.use(authenticateUser);

router.get('/access/OUTPUT/:sourceId/archive', DocumentAccessController.archive);
router.get('/access/:source/:sourceId', requireRoles(['HEAD_SA', 'SUPER_ADMIN']), DocumentAccessController.get);
router.get('/access/:source/:sourceId/users', requireRoles(['HEAD_SA', 'SUPER_ADMIN']), DocumentAccessController.users);
router.put('/access/:source/:sourceId', requireRoles(['HEAD_SA', 'SUPER_ADMIN']), DocumentAccessController.save);

router.get('/', DocumentController.listDocuments);
router.get('/outputs', requireRoles(['SUPER_ADMIN', 'HEAD_SA', 'SALES', 'SA']), OutputDocumentController.listAccessibleFiles);
router.get('/versions/:versionId/download-url', DocumentController.getDownloadUrl);
router.get('/:id', DocumentController.getDocument);
router.post('/', DocumentController.retiredCreateDocument);
router.post('/:id/versions', handleMultipartUpload(uploadMiddleware.single('file'), 'Invalid document version upload.', 500), DocumentController.uploadNewVersion);
router.post(
  '/versions/:versionId/review',
  requireRoles(['HEAD_SA', 'SUPER_ADMIN']),
  DocumentController.reviewVersion
);
router.post('/:id/comments', DocumentController.addComment);

export default router;
