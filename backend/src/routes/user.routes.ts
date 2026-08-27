import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import {
  createUserSchema,
  updateUserSchema,
} from '../validators/user.validator';

const router = Router();

router.get('/solution-architects', authenticateUser, requireRoles(['HEAD_SA', 'SUPER_ADMIN']), UserController.listSolutionArchitects);

// Seluruh endpoint User Management diproteksi khusus role SUPER_ADMIN
router.use(authenticateUser);
router.use(requireRoles(['SUPER_ADMIN']));

router.get('/', UserController.listUsers);
router.post('/', validateBody(createUserSchema), UserController.createUser);
router.patch('/:id', validateBody(updateUserSchema), UserController.updateUser);
router.patch('/:id/status', UserController.updateStatus);

export default router;
