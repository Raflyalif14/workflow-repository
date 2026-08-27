import { Router } from 'express';
import { WorkflowController } from '../controllers/workflow.controller';
import { authenticateJwt } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { createWorkflowSchema, createWorkflowVersionSchema } from '../validators/workflow.validator';

const router = Router();

router.use(authenticateJwt);

router.get('/', WorkflowController.listWorkflows);
router.get('/:id', WorkflowController.getWorkflow);
router.post('/', validateBody(createWorkflowSchema), WorkflowController.createWorkflow);
router.post('/versions', validateBody(createWorkflowVersionSchema), WorkflowController.createVersion);

export default router;
