import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller';
import { authenticateJwt, requireRoles } from '../middlewares/auth.middleware';
import { uploadMiddleware } from '../utils/storage.util';

const router = Router();

// 1. Download File (Public / Token via query or stream)
router.get('/files/:fileName', DocumentController.downloadFile);

// Protected routes below
router.use(authenticateJwt);

// 2. Document List & Detail
router.get('/', DocumentController.listDocuments);
router.get('/:id', DocumentController.getDocument);

// 3. Upload New Document (Multipart)
router.post(
  '/',
  uploadMiddleware.single('file'),
  DocumentController.createDocument
);

// 4. Upload New Version for existing Document
router.post(
  '/:id/versions',
  uploadMiddleware.single('file'),
  DocumentController.uploadNewVersion
);

// 5. Approve or Reject Document Version (Head SA & Super Admin)
router.post(
  '/versions/:versionId/review',
  requireRoles(['HEAD_SOLUTION_ARCHITECT', 'SUPER_ADMIN']),
  DocumentController.reviewVersion
);

// 6. Discussion Comments Thread
router.post('/:id/comments', DocumentController.addComment);

export default router;
