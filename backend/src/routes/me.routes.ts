import { Router } from 'express';
import { authenticateUser } from '../middlewares/auth.middleware';
import { AssignmentPhase5Controller } from '../controllers/assignment-phase5.controller';
import { deadlineCalendar } from '../controllers/deadline-calendar.controller';

const router = Router();
router.use(authenticateUser);
router.get('/assigned-projects', AssignmentPhase5Controller.assignedProjects);
router.get('/assigned-milestones', AssignmentPhase5Controller.assignedMilestones);
router.get('/deadline-calendar', deadlineCalendar);
export default router;
