import { Router } from 'express';
import { ScenarioController } from '../controllers/scenario.controller';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';

const router = Router();
const authenticated = [authenticateUser];
const admin = [authenticateUser, requireRoles(['SUPER_ADMIN'])];

router.get('/', ...authenticated, ScenarioController.list);
router.get('/:id', ...authenticated, ScenarioController.get);
router.post('/', ...admin, ScenarioController.create);
router.patch('/:id', ...admin, ScenarioController.update);
router.patch('/:id/status', ...admin, ScenarioController.status);
router.get('/:scenarioId/workflow', ...authenticated, ScenarioController.workflow);
router.post('/:scenarioId/workflow/stages', ...admin, ScenarioController.createStage);
router.patch('/:scenarioId/workflow/reorder', ...admin, ScenarioController.reorder);

export default router;
