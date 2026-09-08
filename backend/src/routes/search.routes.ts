import { Router } from 'express';
import { SearchController } from '../controllers/search.controller';
import { authenticateUser } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateUser);
router.get('/', SearchController.search);

export default router;
