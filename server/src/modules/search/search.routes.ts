import { Router } from 'express';
import { SearchController } from './search.controller';
import { authMiddleware } from '../../middleware/authMiddleware';

const router = Router();
const controller = new SearchController();

router.use(authMiddleware);

router.get('/', controller.search);

export default router;
