import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { authenticateJwt } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJwt);

// GET /api/dashboard — Full dashboard overview
router.get('/', DashboardController.getOverview);

export default router;
