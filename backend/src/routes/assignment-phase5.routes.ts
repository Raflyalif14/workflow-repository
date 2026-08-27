import { Router } from 'express';
import { authenticateUser, requireRoles } from '../middlewares/auth.middleware';
import { AssignmentPhase5Controller } from '../controllers/assignment-phase5.controller';
import { validateBody } from '../middlewares/validate.middleware';
import { assignPicSchema } from '../validators/assignment-phase5.validator';

const router = Router();
router.use(authenticateUser);
router.post('/projects/:projectId/assign-pic', requireRoles(['HEAD_SA']), validateBody(assignPicSchema), AssignmentPhase5Controller.assign);
router.get('/projects/:projectId/assignments', AssignmentPhase5Controller.history);
export default router;