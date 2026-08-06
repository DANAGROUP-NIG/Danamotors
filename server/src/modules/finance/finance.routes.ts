import { Router } from 'express';
import { FinanceController } from './finance.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  invoiceIdParamSchema,
  createPaymentSchema,
  paymentIdParamSchema,
  createReceiptSchema,
  receiptIdParamSchema,
  reportQuerySchema,
} from './finance.validation';

const router = Router();
const controller = new FinanceController();

router.use(authMiddleware);

router.post('/invoices', requirePermission(PERMISSIONS.FINANCE_CREATE), validateRequest(createInvoiceSchema), controller.createInvoice);
router.get('/invoices', requirePermission(PERMISSIONS.FINANCE_READ), controller.listInvoices);
router.get('/invoices/:id', requirePermission(PERMISSIONS.FINANCE_READ), validateRequest(invoiceIdParamSchema), controller.getInvoice);
router.put('/invoices/:id', requirePermission(PERMISSIONS.FINANCE_UPDATE), validateRequest(updateInvoiceSchema), controller.updateInvoice);
router.delete('/invoices/:id', requirePermission(PERMISSIONS.FINANCE_UPDATE), validateRequest(invoiceIdParamSchema), controller.deleteInvoice);

router.post('/payments', requirePermission(PERMISSIONS.FINANCE_CREATE), validateRequest(createPaymentSchema), controller.createPayment);
router.get('/payments', requirePermission(PERMISSIONS.FINANCE_READ), controller.listPayments);
router.get('/payments/:id', requirePermission(PERMISSIONS.FINANCE_READ), validateRequest(paymentIdParamSchema), controller.getPayment);

router.post('/receipts', requirePermission(PERMISSIONS.FINANCE_CREATE), validateRequest(createReceiptSchema), controller.createReceipt);
router.get('/receipts', requirePermission(PERMISSIONS.FINANCE_READ), controller.listReceipts);
router.get('/receipts/:id', requirePermission(PERMISSIONS.FINANCE_READ), validateRequest(receiptIdParamSchema), controller.getReceipt);

router.get('/reports/summary', requirePermission(PERMISSIONS.FINANCE_READ), validateRequest(reportQuerySchema), controller.getSummaryReport);
router.get('/reports/invoices', requirePermission(PERMISSIONS.FINANCE_READ), validateRequest(reportQuerySchema), controller.getInvoiceReport);
router.get('/dashboard/overview', requirePermission(PERMISSIONS.FINANCE_READ), controller.getDashboardOverview);

export default router;
