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

/**
 * @openapi
 * /finance/invoices:
 *   post:
 *     tags:
 *       - Finance
 *     summary: Create an invoice
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jobCardId]
 *             properties:
 *               jobCardId: { type: string }
 *               customerId: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     description: { type: string }
 *                     quantity: { type: integer }
 *                     unitPrice: { type: number }
 *               dueDate: { type: string, format: date }
 *     responses:
 *       201:
 *         description: Invoice created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/InvoiceDTO'
 *   get:
 *     tags:
 *       - Finance
 *     summary: List all invoices
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [DRAFT, ISSUED, PAID, OVERDUE, CANCELLED] }
 *     responses:
 *       200:
 *         description: Paginated invoice list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /finance/invoices/{id}:
 *   get:
 *     tags:
 *       - Finance
 *     summary: Get invoice by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Invoice details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/InvoiceDTO'
 *   put:
 *     tags:
 *       - Finance
 *     summary: Update invoice
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [DRAFT, ISSUED, CANCELLED] }
 *               dueDate: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Invoice updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   delete:
 *     tags:
 *       - Finance
 *     summary: Void/delete invoice
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Invoice deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /finance/payments:
 *   post:
 *     tags:
 *       - Finance
 *     summary: Record a payment
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invoiceId, amount, paymentMethod]
 *             properties:
 *               invoiceId: { type: string }
 *               amount: { type: number, example: 50000 }
 *               paymentMethod: { type: string, enum: [CASH, TRANSFER, POS, CREDIT] }
 *               reference: { type: string }
 *     responses:
 *       201:
 *         description: Payment recorded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   get:
 *     tags:
 *       - Finance
 *     summary: List all payments
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Payment list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /finance/receipts:
 *   post:
 *     tags:
 *       - Finance
 *     summary: Generate a receipt
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentId]
 *             properties:
 *               paymentId: { type: string }
 *     responses:
 *       201:
 *         description: Receipt generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   get:
 *     tags:
 *       - Finance
 *     summary: List all receipts
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Receipt list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /finance/reports/summary:
 *   get:
 *     tags:
 *       - Finance
 *     summary: Get financial summary report
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: branchId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Financial summary
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /finance/dashboard/overview:
 *   get:
 *     tags:
 *       - Finance
 *     summary: Finance dashboard overview
 *     description: Returns key financial KPIs for the dashboard.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Finance dashboard overview
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
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

