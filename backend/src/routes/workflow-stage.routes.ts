import { Router } from 'express';
import { ScenarioController } from '../controllers/scenario.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';

const router = Router();
router.patch('/:id', authenticateUser, requireRoles(['SUPER_ADMIN']), ScenarioController.updateStage);
router.delete('/:id', authenticateUser, requireRoles(['SUPER_ADMIN']), ScenarioController.deleteStage);
export default router;
