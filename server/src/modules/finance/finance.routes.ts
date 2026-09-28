import { Router } from 'express';
import { FinanceController } from './finance.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  updateInvoiceSchema,
  invoiceIdParamSchema,
  paymentIdParamSchema,
  createReceiptSchema,
  receiptIdParamSchema,
  reportQuerySchema,
  jobBillPreviewSchema,
  createJobBillSchema,
  cancelDocumentSchema,
  updateReceiptSchema,
  receiptRegisterQuerySchema,
  tallyDocumentsQuerySchema,
  importTallyLedgersSchema,
  saveTallyMappingsSchema,
  exportTallyBatchSchema,
  confirmTallyBatchSchema,
  tallyLedgerSearchSchema,
} from './finance.validation';

const router = Router();
const controller = new FinanceController();

router.use(authMiddleware);

/**
 * @openapi
 * /finance/invoices:
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
 *     summary: Update invoice notes or due date
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
 *               dueDate: { type: string, format: date }
 *               notes: { type: string }
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
 *     summary: Record a receipt and allocate it to one or more invoices
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, mode, amount]
 *             properties:
 *               customerId: { type: string, format: uuid }
 *               mode: { type: string, enum: [POS, BANK_TRANSFER, CASH] }
 *               category: { type: string, enum: [SERVICE_PARTS, SALES_ENQUIRY] }
 *               bankId: { type: string, format: uuid, description: Required for POS and bank transfer }
 *               amount: { type: number, exclusiveMinimum: 0 }
 *               reference: { type: string }
 *               narration: { type: string }
 *               allocations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [invoiceId, amount]
 *                   properties:
 *                     invoiceId: { type: string, format: uuid }
 *                     amount: { type: number, exclusiveMinimum: 0 }
 *     responses:
 *       201:
 *         description: Receipt number, allocations, and any advance balance
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
/**
 * @openapi
 * /finance/job-cards/billable:
 *   get:
 *     tags: [Finance]
 *     summary: List completed job cards that can be billed
 *     responses:
 *       200: { description: Branch-scoped billable job cards }
 * /finance/job-bills/preview:
 *   post:
 *     tags: [Finance]
 *     summary: Preview server-calculated job-bill lines and totals
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jobCardId]
 *             properties:
 *               jobCardId: { type: string, format: uuid }
 *               partsDiscountPercent: { type: number, minimum: 0, maximum: 100 }
 *               labourDiscountPercent: { type: number, minimum: 0, maximum: 100 }
 *     responses:
 *       200: { description: Computed bill preview }
 * /finance/job-bills:
 *   post:
 *     tags: [Finance]
 *     summary: Create a job bill from job-card lines
 *     responses:
 *       201: { description: Bill created with generated invoice number }
 * /finance/invoices/{id}/cancel:
 *   patch:
 *     tags: [Finance]
 *     summary: Cancel a bill with a required remark
 *     responses:
 *       200: { description: Bill cancelled }
 * /finance/banks:
 *   get:
 *     tags: [Finance]
 *     summary: List active receiving banks
 *     responses:
 *       200: { description: Receiving banks }
 * /finance/receipts/{id}:
 *   patch:
 *     tags: [Finance]
 *     summary: Update receipt amount or narration before Tally posting
 *     responses:
 *       200: { description: Updated receipt and recalculated allocations }
 * /finance/receipts/{id}/cancel:
 *   patch:
 *     tags: [Finance]
 *     summary: Cancel a receipt and reverse allocations
 *     responses:
 *       200: { description: Receipt cancelled }
 * /finance/reports/receipt-register:
 *   get:
 *     tags: [Finance]
 *     summary: List receipts by date range and category with totals
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [ALL, SERVICE_PARTS, SALES_ENQUIRY] }
 *     responses:
 *       200: { description: Receipt rows, totals by mode, and grand total }
 * /finance/tally/documents:
 *   get:
 *     tags: [Tally]
 *     summary: List unexported documents for a date and type
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date, example: '2026-09-28' }
 *       - in: query
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [JOB_BILL, RECEIPT] }
 *     responses:
 *       200: { description: Documents with mapping readiness and skip reasons }
 * /finance/tally/post:
 *   post:
 *     tags: [Tally]
 *     summary: Export selected documents as Tally XML
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { documents: [{ type: JOB_BILL, id: '550e8400-e29b-41d4-a716-446655440000' }] }
 *     responses:
 *       200: { description: XML export batch with exported and skipped documents }
 * /finance/tally/post/confirm:
 *   post:
 *     tags: [Tally]
 *     summary: Record Tally voucher references after import
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { batchId: '550e8400-e29b-41d4-a716-446655440000', documents: [{ type: JOB_BILL, id: '550e8400-e29b-41d4-a716-446655440001', voucherNumber: 'TALLY-001' }] }
 *     responses:
 *       200: { description: Documents marked posted exactly once }
 * /finance/tally/ledgers/import:
 *   post:
 *     tags: [Tally]
 *     summary: Import or update Tally ledger master rows
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { ledgers: [{ code: 'LEDGER-001', name: 'Dana Motors Customer' }] }
 *     responses:
 *       200: { description: Imported, added, and updated counts }
 * /finance/tally/account-mappings:
 *   put:
 *     tags: [Tally]
 *     summary: Save Tally ledger mappings for billing accounts
 *     responses:
 *       200: { description: Updated account mappings }
 */
router.get('/job-cards/billable', requirePermission(PERMISSIONS.INVOICE_READ), controller.listBillableJobCards);
router.post('/job-bills/preview', requirePermission(PERMISSIONS.INVOICE_READ), validateRequest(jobBillPreviewSchema), controller.previewJobBill);
router.post('/job-bills', requirePermission(PERMISSIONS.JOB_BILL_CREATE), validateRequest(createJobBillSchema), controller.createJobBill);
router.patch('/invoices/:id/cancel', requirePermission(PERMISSIONS.INVOICE_CANCEL), validateRequest(cancelDocumentSchema), controller.cancelJobBill);

router.get('/invoices', requirePermission(PERMISSIONS.INVOICE_READ), controller.listInvoices);
router.get('/invoices/:id', requirePermission(PERMISSIONS.INVOICE_READ), validateRequest(invoiceIdParamSchema), controller.getInvoice);
router.put('/invoices/:id', requirePermission(PERMISSIONS.INVOICE_UPDATE), validateRequest(updateInvoiceSchema), controller.updateInvoice);

router.get('/payments', requirePermission(PERMISSIONS.PAYMENT_READ), controller.listPayments);
router.get('/payments/:id', requirePermission(PERMISSIONS.PAYMENT_READ), validateRequest(paymentIdParamSchema), controller.getPayment);

router.post('/receipts', requirePermission(PERMISSIONS.RECEIPT_CREATE), validateRequest(createReceiptSchema), controller.createReceipt);
router.get('/receipts', requirePermission(PERMISSIONS.RECEIPT_READ), controller.listReceipts);
router.patch('/receipts/:id', requirePermission(PERMISSIONS.RECEIPT_UPDATE), validateRequest(updateReceiptSchema), controller.updateReceipt);
router.patch('/receipts/:id/cancel', requirePermission(PERMISSIONS.RECEIPT_CANCEL), validateRequest(cancelDocumentSchema), controller.cancelReceipt);
router.get('/receipts/:id', requirePermission(PERMISSIONS.RECEIPT_READ), validateRequest(receiptIdParamSchema), controller.getReceipt);
router.get('/banks', requirePermission(PERMISSIONS.RECEIPT_READ), controller.listBanks);
router.get('/service-advisors', requirePermission(PERMISSIONS.JOB_BILL_CREATE), controller.listServiceAdvisors);

router.get('/tally/ledgers', requirePermission(PERMISSIONS.TALLY_IMPORT), validateRequest(tallyLedgerSearchSchema), controller.listTallyLedgers);
router.post('/tally/ledgers/import', requirePermission(PERMISSIONS.TALLY_IMPORT), validateRequest(importTallyLedgersSchema), controller.importTallyLedgers);
router.get('/tally/account-mappings', requirePermission(PERMISSIONS.TALLY_IMPORT), controller.getTallyAccountMappings);
router.put('/tally/account-mappings', requirePermission(PERMISSIONS.TALLY_IMPORT), validateRequest(saveTallyMappingsSchema), controller.saveTallyAccountMappings);
router.get('/tally/documents', requirePermission(PERMISSIONS.TALLY_POST), validateRequest(tallyDocumentsQuerySchema), controller.listTallyDocuments);
router.post('/tally/post', requirePermission(PERMISSIONS.TALLY_POST), validateRequest(exportTallyBatchSchema), controller.exportTallyBatch);
router.post('/tally/post/confirm', requirePermission(PERMISSIONS.TALLY_POST), validateRequest(confirmTallyBatchSchema), controller.confirmTallyBatch);

router.get('/reports/summary', requirePermission(PERMISSIONS.FINANCE_REPORT_READ), validateRequest(reportQuerySchema), controller.getSummaryReport);
router.get('/reports/invoices', requirePermission(PERMISSIONS.FINANCE_REPORT_READ), validateRequest(reportQuerySchema), controller.getInvoiceReport);
router.get('/reports/receipt-register', requirePermission(PERMISSIONS.RECEIPT_REGISTER_READ), validateRequest(receiptRegisterQuerySchema), controller.listReceipts);
router.get('/dashboard/overview', requirePermission(PERMISSIONS.INVOICE_READ), controller.getDashboardOverview);

export default router;

