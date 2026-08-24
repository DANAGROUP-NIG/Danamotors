import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import adminRoutes from '../modules/administration/admin.routes';
import customerRoutes from '../modules/customer/customer.routes';
import vehicleRoutes from '../modules/vehicle/vehicle.routes';
import serviceRoutes from '../modules/service/service.routes';
import servicesRoutes from '../modules/services/services.routes';
import workshopRoutes from '../modules/workshop/workshop.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';
import financeRoutes from '../modules/finance/finance.routes';
import branchRoutes from '../modules/branch/branch.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import searchRoutes from '../modules/search/search.routes';
import notificationRoutes from '../modules/notification/notification.routes';
import portalRoutes from '../modules/customer-portal/portal.routes';
import creditRoutes from '../modules/credit/credit.routes';
import enquiryRoutes from '../modules/enquiry/enquiry.routes';

const router = Router();

// Base health check
/**
 * @openapi
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: API health check
 *     description: Returns the operational status and timestamp of the Dana Motors API.
 *     security: []
 *     responses:
 *       200:
 *         description: API is healthy and operational
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Dana Motors API is healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health', (_req, res) => {

  res.status(200).json({
    status: 'success',
    message: 'Dana Motors API is healthy',
    timestamp: new Date().toISOString(),
  });
});

// Module routers
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/customers', customerRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/service', serviceRoutes);
router.use('/services', servicesRoutes);
router.use('/workshop', workshopRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/finance', financeRoutes);
router.use('/branches', branchRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/search', searchRoutes);
router.use('/notifications', notificationRoutes);
router.use('/portal', portalRoutes);
router.use('/credit', creditRoutes);
router.use('/enquiries', enquiryRoutes);

export default router;
