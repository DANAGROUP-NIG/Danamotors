import { Router } from 'express';
import { DashboardController } from './dashboard.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { dashboardStatsQuerySchema } from './dashboard.validation';

const router = Router();
const controller = new DashboardController();

router.use(authMiddleware);

router.get(
  '/stats',
  validateRequest(dashboardStatsQuerySchema),
  controller.getStats,
);

export default router;
