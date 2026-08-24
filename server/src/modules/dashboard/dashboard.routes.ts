import { Router } from 'express';
import { DashboardController } from './dashboard.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { dashboardStatsQuerySchema } from './dashboard.validation';

const router = Router();
const controller = new DashboardController();

router.use(authMiddleware);

/**
 * @openapi
 * /dashboard/stats:
 *   get:
 *     tags:
 *       - Dashboard
 *     summary: Get branch dashboard statistics
 *     description: Returns KPIs, revenue summaries, stock alerts, and job card metrics for the authenticated user's branch.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [today, week, month, year], default: month }
 *       - in: query
 *         name: branchId
 *         schema: { type: string }
 *         description: Filter by specific branch (super-admin only)
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalJobCards: { type: integer }
 *                     completedJobCards: { type: integer }
 *                     pendingJobCards: { type: integer }
 *                     totalRevenue: { type: number }
 *                     collectedRevenue: { type: number }
 *                     outstandingRevenue: { type: number }
 *                     totalCustomers: { type: integer }
 *                     lowStockAlerts: { type: integer }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/stats',
  validateRequest(dashboardStatsQuerySchema),
  controller.getStats,
);

export default router;

