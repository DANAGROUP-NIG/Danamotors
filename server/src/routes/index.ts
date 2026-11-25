import { Router } from 'express';
import stockDiscrepancyRoutes from '../modules/inventory/stockDiscrepancy.routes';
import reportRoutes from '../modules/reports/reports.routes';
import reportFrameworkRoutes from '../modules/reports/framework.routes';
import authRoutes from '../modules/auth/auth.routes';
import adminRoutes from '../modules/administration/admin.routes';
import customerRoutes from '../modules/customer/customer.routes';
import vehicleRoutes from '../modules/vehicle/vehicle.routes';
import vehicleCatalogRoutes from '../modules/vehicle-catalog/vehicle-catalog.routes';
import serviceRoutes from '../modules/service/service.routes';
import labourRateRoutes from '../modules/service/labourRate.routes';
import serviceDocumentRoutes from '../modules/service/service-document.routes';
import labourSlipRoutes from '../modules/service/labour-slip.routes';
import servicesRoutes from '../modules/services/services.routes';
import workshopRoutes from '../modules/workshop/workshop.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';
import requisitionRoutes from '../modules/requisition/requisition.routes';
import returnSlipRoutes from '../modules/requisition/return-slip.routes';
import stockTransferRoutes from '../modules/stock-transfer/stockTransfer.routes';
import mobisPurchaseRoutes from '../modules/mobis-purchase/mobisPurchase.routes';
import vendorReceiptRoutes from '../modules/vendor-receipt/vendorReceipt.routes';
import partSaleRoutes from '../modules/part-sale/partSale.routes';
import dispatchChallanRoutes from '../modules/dispatch-challan/dispatchChallan.routes';
import partsReportRoutes from '../modules/parts-report/partsReport.routes';
import stockTakeRoutes from '../modules/stock-take/stockTake.routes';
import handheldRoutes from '../modules/handheld/handheld.routes';
import handheldStationRoutes from '../modules/handheld/handheld.station.routes';
import labelRoutes from '../modules/labels/labels.routes';
import financeRoutes from '../modules/finance/finance.routes';
import mobisPricingRoutes from '../modules/finance/mobis-pricing.routes';
import branchRoutes from '../modules/branch/branch.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import searchRoutes from '../modules/search/search.routes';
import notificationRoutes from '../modules/notification/notification.routes';
import portalRoutes from '../modules/customer-portal/portal.routes';
import creditRoutes from '../modules/credit/credit.routes';
import enquiryRoutes from '../modules/enquiry/enquiry.routes';
import auditRoutes from '../modules/audit/audit.routes';
import warrantyRoutes, { vehicleModelRouter, vehicleWarrantyRouter } from '../modules/warranty/warranty.routes';
import campaignRoutes from '../modules/campaign/campaign.routes';
import { jobCardLineRouter } from '../modules/job-card-line/jobCardLine.routes';

import workshopMasterRoutes from '../modules/workshop/workshop-master.routes';
import employeeRoutes from '../modules/employee/employee.routes';
import serviceChecklistRoutes from '../modules/workshop/service-checklist.routes';
import documentTermsRoutes from '../modules/document-terms/document-terms.routes';
import companySettingsRoutes from '../modules/company-settings/company-settings.routes';
import booksClosedRoutes from '../modules/books-closed/books-closed.routes';
import pdiRoutes from '../modules/pdi/pdi.routes';
import repeatJobRoutes from '../modules/repeat-job/repeat-job.routes';
import cscRoutes from '../modules/csc/csc.routes';
import lateDeliveryRoutes from '../modules/late-delivery/late-delivery.routes';
import psfRoutes from '../modules/psf/psf.routes';
import { serviceTypeOptionsRouter, serviceTypeSettingsRouter } from '../modules/workshop/service-type.routes';

const router = Router();
router.use('/reports', reportRoutes);
router.use('/reports', reportFrameworkRoutes);
router.use('/workshop-masters', workshopMasterRoutes);
router.use('/employees', employeeRoutes);
router.use('/service-checklists', serviceChecklistRoutes);
router.use('/document-terms', documentTermsRoutes);
router.use('/company-settings', companySettingsRoutes);
router.use('/books-closed', booksClosedRoutes);
router.use('/pdi', pdiRoutes);
router.use('/repeat-jobs', repeatJobRoutes);
router.use('/csc', cscRoutes);
router.use('/late-deliveries', lateDeliveryRoutes);
router.use('/psf', psfRoutes);
router.use('/job-cards', serviceTypeOptionsRouter);
router.use('/service-type-model-settings', serviceTypeSettingsRouter);

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
router.use('/vehicles', vehicleWarrantyRouter);
router.use('/vehicles', vehicleRoutes);
router.use('/vehicle-catalog', vehicleCatalogRoutes);
router.use('/vehicle-models', vehicleModelRouter);
// Before /service: its sub-paths (/grid, /bulk, …) are matched here; GET/POST /service/labour-rates fall through.
router.use('/service/labour-rates', labourRateRoutes);
router.use('/service', jobCardLineRouter);
router.use('/service', serviceRoutes);
router.use('/service', labourSlipRoutes);
router.use('/service', serviceDocumentRoutes);
router.use('/services', servicesRoutes);
router.use('/workshop', workshopRoutes);
router.use('/part-sale', partSaleRoutes);
router.use('/dispatch-challans', dispatchChallanRoutes);
router.use('/parts-reports', partsReportRoutes);
router.use('/stock-takes', stockTakeRoutes);
// Station endpoints use a station key, not a user session; mounted before the user routes.
router.use('/handheld/station', handheldStationRoutes);
router.use('/handheld', handheldRoutes);
router.use('/labels', labelRoutes);
router.use('/inventory', stockDiscrepancyRoutes);
router.use('/inventory', mobisPurchaseRoutes);
router.use('/inventory', vendorReceiptRoutes);
router.use('/inventory', stockTransferRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/inventory', requisitionRoutes);
router.use('/inventory', returnSlipRoutes);
router.use('/finance/mobis-pricing', mobisPricingRoutes);
router.use('/finance', financeRoutes);
router.use('/branches', branchRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/search', searchRoutes);
router.use('/notifications', notificationRoutes);
router.use('/portal', portalRoutes);
router.use('/credit', creditRoutes);
router.use('/enquiries', enquiryRoutes);
router.use('/audit', auditRoutes);
router.use('/warranty', warrantyRoutes);
router.use('/campaigns', campaignRoutes);

export default router;
