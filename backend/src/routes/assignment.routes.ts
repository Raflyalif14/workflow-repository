import { Router } from 'express';
import { AssignmentController } from '../controllers/assignment.controller';
import { authenticateJwt, requireRoles } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { assignPicSchema } from '../validators/assignment.validator';

const router = Router();

router.use(authenticateJwt);

// 1. Get eligible Solution Architects list
router.get('/eligible-sas', AssignmentController.getEligibleSAs);

// 2. Get assignment history for a project
router.get('/projects/:projectId/history', AssignmentController.getAssignmentHistory);

// 3. Assign / Reassign PIC (Head SA & Super Admin)
router.post(
  '/projects/:projectId/assign',
  requireRoles(['HEAD_SOLUTION_ARCHITECT', 'SUPER_ADMIN']),
  validateBody(assignPicSchema),
  AssignmentController.assignOrReassignPIC
);

export default router;
