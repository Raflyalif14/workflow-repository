import { Router } from 'express';
import { authenticateUser } from '../middlewares/auth.middleware';
import { ProjectManagementController } from '../controllers/project-management.controller';

const router = Router();
router.use(authenticateUser);
router.get('/', ProjectManagementController.list);
router.post('/', ProjectManagementController.create);
router.get('/:id', ProjectManagementController.get);
router.patch('/:id', ProjectManagementController.update);
router.post('/:id/postpone', ProjectManagementController.postpone);
router.post('/:id/resume', ProjectManagementController.resume);
export default router;
