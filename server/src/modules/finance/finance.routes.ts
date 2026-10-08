import { z } from 'zod';
import { PartyReportController, requirePartyReport, requireAnyPartyReport } from './party-report.controller';
import { partyReportSchema, reportSettingsSchema, reportPartySearchSchema } from './party-report.validation';
import { Router } from 'express';
import { PartyAccountController } from './party-account.controller';
import { partyAccountSchema, partySearchSchema, partyDocumentsSchema, fifoAdjustmentSchema, createAdjustmentSchema, reverseAdjustmentSchema, openingBalanceSchema } from './party-account.validation';
import { FinanceController } from './finance.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission, requireRole } from '../../middleware/authorize';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
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
const partyReports = new PartyReportController();
router.get('/party-reports/parties', requireAnyPartyReport, validateRequest(reportPartySearchSchema), partyReports.search);
router.get('/party-reports/export', requirePartyReport, validateRequest(partyReportSchema), partyReports.export);
router.get('/party-reports/print', requirePartyReport, validateRequest(partyReportSchema), partyReports.print);
router.get('/party-reports', requirePartyReport, validateRequest(partyReportSchema), partyReports.report);
router.get('/settings/party-reports', requireAnyPartyReport, validateRequest(z.object({query:z.object({}).strict()})), partyReports.settings);
router.put('/settings/party-reports', requireRole(ROLES.ADMIN,ROLES.SUPER_ADMIN), requirePermission(PERMISSIONS.PARTY_OUTSTANDING_AGE_READ), validateRequest(reportSettingsSchema), partyReports.saveSettings);


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
router.get('/receipts', requirePermission(PERMISSIONS.RECEIPT_READ), validateRequest(receiptRegisterQuerySchema), controller.listReceipts);
router.patch('/receipts/:id', requirePermission(PERMISSIONS.RECEIPT_UPDATE), validateRequest(updateReceiptSchema), controller.updateReceipt);
router.patch('/receipts/:id/cancel', requirePermission(PERMISSIONS.RECEIPT_CANCEL), validateRequest(cancelDocumentSchema), controller.cancelReceipt);
router.get('/receipts/:id', requirePermission(PERMISSIONS.RECEIPT_READ), validateRequest(receiptIdParamSchema), controller.getReceipt);
router.get('/banks', requirePermission(PERMISSIONS.RECEIPT_READ), controller.listBanks);
router.get('/service-advisors', requirePermission(PERMISSIONS.JOB_BILL_CREATE), controller.listServiceAdvisors);

router.get('/tally/ledgers', requirePermission(PERMISSIONS.TALLY_IMPORT), validateRequest(tallyLedgerSearchSchema), controller.listTallyLedgers);
router.post('/tally/ledgers/import', requirePermission(PERMISSIONS.TALLY_IMPORT), validateRequest(importTallyLedgersSchema), controller.importTallyLedgers);
router.get('/tally/account-mappings', requirePermission(PERMISSIONS.TALLY_IMPORT), controller.getTallyAccountMappings);
router.put('/tally/account-mappings', requirePermission(PERMISSIONS.TALLY_IMPORT), validateRequest(saveTallyMappingsSchema), controller.saveTallyAccountMappings);
router.get('/tally/batches', requirePermission(PERMISSIONS.TALLY_POST), controller.pendingTallyBatches);
router.get('/tally/documents', requirePermission(PERMISSIONS.TALLY_POST), validateRequest(tallyDocumentsQuerySchema), controller.listTallyDocuments);
router.post('/tally/post', requirePermission(PERMISSIONS.TALLY_POST), validateRequest(exportTallyBatchSchema), controller.exportTallyBatch);
router.post('/tally/post/confirm', requirePermission(PERMISSIONS.TALLY_POST), validateRequest(confirmTallyBatchSchema), controller.confirmTallyBatch);

router.get('/reports/summary', requirePermission(PERMISSIONS.FINANCE_REPORT_READ), validateRequest(reportQuerySchema), controller.getSummaryReport);
router.get('/reports/invoices', requirePermission(PERMISSIONS.FINANCE_REPORT_READ), validateRequest(reportQuerySchema), controller.getInvoiceReport);
router.get('/reports/receipt-register', requirePermission(PERMISSIONS.RECEIPT_REGISTER_READ), validateRequest(receiptRegisterQuerySchema), controller.listReceipts);
router.get('/dashboard/overview', requirePermission(PERMISSIONS.INVOICE_READ), controller.getDashboardOverview);


/**
 * @openapi
 * /finance/parties:
 *   get:
 *     tags: [Finance]
 *     summary: Search debtor parties by name or code
 *     description: "Requires receipt:adjust. Merged customers and vendors are excluded. Admin/SuperAdmin may select any branch; other users are restricted to their assigned branch."
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - {"in":"query","name":"branchId","schema":{"type":"string","format":"uuid"}}
 *       - {"in":"query","name":"order","schema":{"type":"string","enum":["name","code"],"default":"name"}}
 *       - {"in":"query","name":"search","schema":{"type":"string","maxLength":100}}
 *       - {"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":100,"default":50}}
 *     responses:
 *       200: { description: "customers array (id, code, name), bounded by limit" }
 *       400: { description: Invalid input or document state }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Party or document not found }
 *       409: { description: Stale balance, duplicate reversal, or changed retry details }
 * /finance/parties/{customerId}/account:
 *   get:
 *     tags: [Finance]
 *     summary: Read the current party debit and credit totals
 *     description: "Requires customer:read and party branch access. outstanding is invoices plus opening debits; availableCredit is receipt advances plus active credit notes/opening credits; netOutstanding is debit minus credit."
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - {"in":"path","name":"customerId","required":true,"schema":{"type":"string","format":"uuid"}}
 *       - {"in":"query","name":"branchId","schema":{"type":"string","format":"uuid"}}
 *     responses:
 *       200: { description: "account with customer, outstanding, availableCredit and netOutstanding" }
 *       400: { description: Invalid input or document state }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Party or document not found }
 *       409: { description: Stale balance, duplicate reversal, or changed retry details }
 * /finance/parties/{customerId}/documents:
 *   get:
 *     tags: [Finance]
 *     summary: Read a paginated debit or credit document grid
 *     description: "Requires receipt:adjust and branch access. These are current balances. Historical as-on reports ship separately."
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - {"in":"path","name":"customerId","required":true,"schema":{"type":"string","format":"uuid"}}
 *       - {"in":"query","name":"branchId","schema":{"type":"string","format":"uuid"}}
 *       - {"in":"query","name":"side","schema":{"type":"string","enum":["DEBIT","CREDIT"],"default":"DEBIT"}}
 *       - {"in":"query","name":"openOnly","schema":{"type":"string","enum":["true","false"],"default":"true"}}
 *       - {"in":"query","name":"page","schema":{"type":"integer","minimum":1,"default":1}}
 *       - {"in":"query","name":"pageSize","schema":{"type":"integer","minimum":1,"maximum":100,"default":25}}
 *     responses:
 *       200: { description: "documents array (id, kind, number, date, amount, balance) and pagination meta" }
 *       400: { description: Invalid input or document state }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Party or document not found }
 *       409: { description: Stale balance, duplicate reversal, or changed retry details }
 * /finance/parties/{customerId}/adjustments:
 *   get:
 *     tags: [Finance]
 *     summary: Read the latest 20 party adjustment batches
 *     description: "Requires receipt:adjust and party/branch access. Returns reversal metadata. No adjustment batch creates a Tally journal."
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - {"in":"path","name":"customerId","required":true,"schema":{"type":"string","format":"uuid"}}
 *       - {"in":"query","name":"branchId","schema":{"type":"string","format":"uuid"}}
 *     responses:
 *       200: { description: "batches array, latest first" }
 *       400: { description: Invalid input or document state }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Party or document not found }
 *       409: { description: Stale balance, duplicate reversal, or changed retry details }
 * /finance/adjustments/fifo-preview:
 *   post:
 *     tags: [Finance]
 *     summary: Preview editable FIFO allocations without saving
 *     description: "Requires receipt:adjust. Matches at most 200 open documents per side, oldest date then number. Excludes documents after the effective date; balances are revalidated on save."
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: {"type":"object","required":["customerId","branchId","date"],"properties":{"customerId":{"type":"string","format":"uuid"},"branchId":{"type":"string","format":"uuid"},"date":{"type":"string","format":"date-time"}}}
 *     responses:
 *       200: { description: "preview with debit/credit selections, matched amount and both document arrays" }
 *       400: { description: Invalid input or document state }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Party or document not found }
 *       409: { description: Stale balance, duplicate reversal, or changed retry details }
 *       503: { description: Database busy; check balances and reuse the same key and details }
 * /finance/adjustments:
 *   post:
 *     tags: [Finance]
 *     summary: Save a manual or FIFO party adjustment
 *     description: "Requires receipt:adjust. Each side contains 1-200 unique documents. Debit and credit totals must be equal and positive, at most two decimal places, within current balances, owned by the same party/branch. Date cannot precede a selected document or be in the future. Serializable transaction, row locks and at most two P2034 retries. Reuse the same UUID key and identical details after an uncertain response; a changed request returns 409. No Tally journal or duplicate Payment row is created."
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: {"type":"object","required":["customerId","branchId","date","idempotencyKey","debits","credits"],"properties":{"customerId":{"type":"string","format":"uuid"},"branchId":{"type":"string","format":"uuid"},"date":{"type":"string","format":"date-time"},"idempotencyKey":{"type":"string","format":"uuid"},"source":{"type":"string","enum":["ADVANCE_ADJUSTMENT","FIFO"],"default":"ADVANCE_ADJUSTMENT"},"debits":{"$ref":"#/components/schemas/PartyAdjustmentSelections"},"credits":{"$ref":"#/components/schemas/PartyAdjustmentSelections"}}}
 *     responses:
 *       201: { description: "batch with effective date, amount, source and retry key" }
 *       400: { description: Invalid input or document state }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Party or document not found }
 *       409: { description: Stale balance, duplicate reversal, or changed retry details }
 *       503: { description: Database busy; check balances and reuse the same key and details }
 * /finance/adjustments/{id}/reverse:
 *   post:
 *     tags: [Finance]
 *     summary: Reverse an unposted party adjustment with a remark
 *     description: "Admin/SuperAdmin only, with receipt:adjust:reverse. Restores original document balances once and retains allocation rows with reversedAt. Any involved document or batch exported/posted to Tally blocks reversal. Original customer approval remains decision history."
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - {"in":"path","name":"id","required":true,"schema":{"type":"string","format":"uuid"}}
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: {"type":"object","required":["remark"],"properties":{"remark":{"type":"string","minLength":1,"maxLength":1000}}}
 *     responses:
 *       200: { description: "batch with reversedAt, reversedById and reverseRemark" }
 *       400: { description: Invalid input or document state }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Party or document not found }
 *       409: { description: Stale balance, duplicate reversal, or changed retry details }
 *       503: { description: Database busy; check balances and reuse the same key and details }
 * /finance/opening-balances:
 *   post:
 *     tags: [Finance]
 *     summary: Record an opening debit or credit balance
 *     description: "Admin/SuperAdmin only, with party:opening:create. The branch must be the customer branch. Creates a numbered OPENING PartyNote, excluded from Tally, with positive currency, effective date and narration. Reuse the same UUID key and identical details for retries."
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: {"type":"object","required":["customerId","branchId","direction","date","amount","narration","idempotencyKey"],"properties":{"customerId":{"type":"string","format":"uuid"},"branchId":{"type":"string","format":"uuid"},"direction":{"type":"string","enum":["DEBIT","CREDIT"]},"date":{"type":"string","format":"date-time"},"amount":{"type":"number","minimum":0.01,"maximum":1000000000000,"multipleOf":0.01},"narration":{"type":"string","minLength":1,"maxLength":2000},"idempotencyKey":{"type":"string","format":"uuid"}}}
 *     responses:
 *       201: { description: "note with number, direction, type OPENING, amount, remainingAmount and tallyExcluded true" }
 *       400: { description: Invalid input or document state }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Party or document not found }
 *       409: { description: Stale balance, duplicate reversal, or changed retry details }
 *       503: { description: Database busy; check balances and reuse the same key and details }
 * components:
 *   schemas:
 *     PartyAdjustmentSelections:
 *       type: array
 *       minItems: 1
 *       maxItems: 200
 *       items:
 *         type: object
 *         required: [id, kind, amount]
 *         properties:
 *           id: { type: string, format: uuid }
 *           kind: { type: string, enum: [INVOICE, RECEIPT, NOTE] }
 *           amount: { type: number, minimum: 0.01, maximum: 1000000000000, multipleOf: 0.01 }
 */
const partyAccount = new PartyAccountController();
router.get('/parties', requirePermission(PERMISSIONS.RECEIPT_ADJUST), validateRequest(partySearchSchema), partyAccount.search);
router.get('/parties/:customerId/account', requirePermission(PERMISSIONS.CUSTOMER_READ), validateRequest(partyAccountSchema), partyAccount.account);
router.get('/parties/:customerId/documents', requirePermission(PERMISSIONS.RECEIPT_ADJUST), validateRequest(partyDocumentsSchema), partyAccount.documents);
router.get('/parties/:customerId/adjustments', requirePermission(PERMISSIONS.RECEIPT_ADJUST), validateRequest(partyAccountSchema), partyAccount.batches);
router.post('/adjustments/fifo-preview', requirePermission(PERMISSIONS.RECEIPT_ADJUST), validateRequest(fifoAdjustmentSchema), partyAccount.fifo);
router.post('/adjustments', requirePermission(PERMISSIONS.RECEIPT_ADJUST), validateRequest(createAdjustmentSchema), partyAccount.create);
router.post('/adjustments/:id/reverse', requireRole(ROLES.ADMIN,ROLES.SUPER_ADMIN), requirePermission(PERMISSIONS.RECEIPT_ADJUST_REVERSE), validateRequest(reverseAdjustmentSchema), partyAccount.reverse);
router.post('/opening-balances', requireRole(ROLES.ADMIN,ROLES.SUPER_ADMIN), requirePermission(PERMISSIONS.PARTY_OPENING_CREATE), validateRequest(openingBalanceSchema), partyAccount.opening);

export default router;


/**
 * @openapi
 * components:
 *   parameters:
 *     PartyReportKind:
 *       in: query
 *       name: kind
 *       description: "Report-specific permission is required."
 *       schema: {"type":"string","enum":["ledger","outstanding","age","bill"],"default":"outstanding"}
 *     PartyReportBranch:
 *       in: query
 *       name: branchId
 *       description: "Admin may omit for all branches; other roles are forced to their assigned branch."
 *       schema: {"type":"string","format":"uuid"}
 *     PartyReportCustomer:
 *       in: query
 *       name: customerId
 *       description: "Optional single party, including the customer Account tab ledger link."
 *       schema: {"type":"string","format":"uuid"}
 *     PartyReportFromParty:
 *       in: query
 *       name: fromCustomerId
 *       description: "Inclusive range start in the selected name/code order."
 *       schema: {"type":"string","format":"uuid"}
 *     PartyReportToParty:
 *       in: query
 *       name: toCustomerId
 *       description: "Inclusive range end in the selected name/code order."
 *       schema: {"type":"string","format":"uuid"}
 *     PartyReportOrder:
 *       in: query
 *       name: order
 *       description: "Stable ordering by selected value then party ID."
 *       schema: {"type":"string","enum":["name","code"],"default":"name"}
 *     PartyReportStatus:
 *       in: query
 *       name: partyStatus
 *       description: "Party classification; vendors excluded."
 *       schema: {"type":"string","enum":["ALL","CUSTOMER","DEALER","FA_PARTY"],"default":"ALL"}
 *     PartyReportSide:
 *       in: query
 *       name: side
 *       description: "Creditors remain disabled until vendor parties exist."
 *       schema: {"type":"string","enum":["DEBTORS"],"default":"DEBTORS"}
 *     PartyReportFrom:
 *       in: query
 *       name: from
 *       description: "Required for ledger; opening balance excludes this day's events."
 *       schema: {"type":"string","format":"date"}
 *     PartyReportTo:
 *       in: query
 *       name: to
 *       description: "Required for ledger; inclusive Africa/Lagos calendar date."
 *       schema: {"type":"string","format":"date"}
 *     PartyReportAsOn:
 *       in: query
 *       name: asOn
 *       description: "Required for outstanding, age and bill. Inclusive Africa/Lagos date; future dates rejected."
 *       schema: {"type":"string","format":"date"}
 *     PartyReportCredit:
 *       in: query
 *       name: showCredit
 *       description: "Age and bill hide net-credit parties unless true."
 *       schema: {"type":"string","enum":["true","false"],"default":"false"}
 *     PartyReportAges:
 *       in: query
 *       name: ageLimits
 *       description: "Exactly five increasing whole days (1–3650); omitted uses company settings."
 *       schema: {"type":"string","example":"30,60,90,120,180"}
 *     PartyReportPage:
 *       in: query
 *       name: page
 *       description: "JSON page; print/export include all matching rows."
 *       schema: {"type":"integer","minimum":1,"maximum":100000,"default":1}
 *     PartyReportPageSize:
 *       in: query
 *       name: pageSize
 *       description: "Rows per JSON page. Ledger/bill pages may continue a party."
 *       schema: {"type":"integer","minimum":1,"maximum":100,"default":25}
 *   schemas:
 *     PartyReportRow:
 *       type: object
 *       description: Monetary values are numeric NGN from PostgreSQL numeric aggregation; negative net means credit balance.
 *       properties:
 *         customerId: { type: string, format: uuid }
 *         code: { type: string, nullable: true }
 *         name: { type: string }
 *         date: { type: string, format: date-time }
 *         number: { type: string }
 *         kind: { type: string }
 *         narration: { type: string }
 *         side: { type: string, enum: [DEBIT, CREDIT] }
 *         debits: { type: number }
 *         credits: { type: number }
 *         net: { type: number }
 *         amount: { type: number }
 *         adjusted: { type: number }
 *         balance: { type: number }
 *         age: { type: integer }
 *         opening: { type: number }
 *         closing: { type: number }
 *         debit: { type: number }
 *         credit: { type: number }
 *         runningBalance: { type: number }
 *         bucket0: { type: number }
 *         bucket1: { type: number }
 *         bucket2: { type: number }
 *         bucket3: { type: number }
 *         bucket4: { type: number }
 *         bucket5: { type: number }
 *     PartyReportResult:
 *       type: object
 *       properties:
 *         rows: { type: array, items: { $ref: '#/components/schemas/PartyReportRow' } }
 *         totals: { type: object, additionalProperties: { type: number }, description: Totals cover all filtered rows, not the page }
 *         ageLimits: { type: array, minItems: 5, maxItems: 5, items: { type: integer } }
 *         meta:
 *           type: object
 *           properties:
 *             page: { type: integer }
 *             pageSize: { type: integer }
 *             total: { type: integer }
 *             totalPages: { type: integer }
 * /finance/party-reports:
 *   get:
 *     tags: [Finance]
 *     summary: Paginated party ledger or outstanding report
 *     description: Dated documents and allocations reconstruct history. Receipt edits and cancellation reversals are retained. Africa/Lagos inclusive dates. One snapshot per result/export; 500-row streaming chunks. Example ledger query - kind=ledger&from=2026-01-01&to=2026-01-31.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/PartyReportKind'
 *       - $ref: '#/components/parameters/PartyReportBranch'
 *       - $ref: '#/components/parameters/PartyReportCustomer'
 *       - $ref: '#/components/parameters/PartyReportFromParty'
 *       - $ref: '#/components/parameters/PartyReportToParty'
 *       - $ref: '#/components/parameters/PartyReportOrder'
 *       - $ref: '#/components/parameters/PartyReportStatus'
 *       - $ref: '#/components/parameters/PartyReportSide'
 *       - $ref: '#/components/parameters/PartyReportFrom'
 *       - $ref: '#/components/parameters/PartyReportTo'
 *       - $ref: '#/components/parameters/PartyReportAsOn'
 *       - $ref: '#/components/parameters/PartyReportCredit'
 *       - $ref: '#/components/parameters/PartyReportAges'
 *       - $ref: '#/components/parameters/PartyReportPage'
 *       - $ref: '#/components/parameters/PartyReportPageSize'
 *     responses:
 *       200:
 *         description: Paginated party ledger or outstanding report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data: { $ref: '#/components/schemas/PartyReportResult' }
 *       400: { description: Invalid dates, limits or filters }
 *       403: { description: Missing report permission or foreign branch }
 *       404: { description: Party range endpoint unavailable }
 * /finance/party-reports/export:
 *   get:
 *     tags: [Finance]
 *     summary: Stream all matching rows as an Excel XML workbook (.xml), with a numeric total row
 *     description: Dated documents and allocations reconstruct history. Receipt edits and cancellation reversals are retained. UTC inclusive dates. One snapshot per result/export; 500-row streaming chunks. Example ledger query - kind=ledger&from=2026-01-01&to=2026-01-31.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/PartyReportKind'
 *       - $ref: '#/components/parameters/PartyReportBranch'
 *       - $ref: '#/components/parameters/PartyReportCustomer'
 *       - $ref: '#/components/parameters/PartyReportFromParty'
 *       - $ref: '#/components/parameters/PartyReportToParty'
 *       - $ref: '#/components/parameters/PartyReportOrder'
 *       - $ref: '#/components/parameters/PartyReportStatus'
 *       - $ref: '#/components/parameters/PartyReportSide'
 *       - $ref: '#/components/parameters/PartyReportFrom'
 *       - $ref: '#/components/parameters/PartyReportTo'
 *       - $ref: '#/components/parameters/PartyReportAsOn'
 *       - $ref: '#/components/parameters/PartyReportCredit'
 *       - $ref: '#/components/parameters/PartyReportAges'
 *       - $ref: '#/components/parameters/PartyReportPage'
 *       - $ref: '#/components/parameters/PartyReportPageSize'
 *     responses:
 *       200:
 *         description: Stream all matching rows as an Excel XML workbook (.xml), with a numeric total row
 *         content:
 *           application/vnd.ms-excel:
 *             schema:
 *               type: string
 *       400: { description: Invalid dates, limits or filters }
 *       403: { description: Missing report permission or foreign branch }
 *       404: { description: Party range endpoint unavailable }
 * /finance/party-reports/print:
 *   get:
 *     tags: [Finance]
 *     summary: Stream professional HTML print layout; ledger and bill start each party on a new page
 *     description: Dated documents and allocations reconstruct history. Receipt edits and cancellation reversals are retained. UTC inclusive dates. One snapshot per result/export; 500-row streaming chunks. Example ledger query - kind=ledger&from=2026-01-01&to=2026-01-31.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/PartyReportKind'
 *       - $ref: '#/components/parameters/PartyReportBranch'
 *       - $ref: '#/components/parameters/PartyReportCustomer'
 *       - $ref: '#/components/parameters/PartyReportFromParty'
 *       - $ref: '#/components/parameters/PartyReportToParty'
 *       - $ref: '#/components/parameters/PartyReportOrder'
 *       - $ref: '#/components/parameters/PartyReportStatus'
 *       - $ref: '#/components/parameters/PartyReportSide'
 *       - $ref: '#/components/parameters/PartyReportFrom'
 *       - $ref: '#/components/parameters/PartyReportTo'
 *       - $ref: '#/components/parameters/PartyReportAsOn'
 *       - $ref: '#/components/parameters/PartyReportCredit'
 *       - $ref: '#/components/parameters/PartyReportAges'
 *       - $ref: '#/components/parameters/PartyReportPage'
 *       - $ref: '#/components/parameters/PartyReportPageSize'
 *     responses:
 *       200:
 *         description: Stream professional HTML print layout; ledger and bill start each party on a new page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       400: { description: Invalid dates, limits or filters }
 *       403: { description: Missing report permission or foreign branch }
 *       404: { description: Party range endpoint unavailable }
 * /finance/party-reports/parties:
 *   get:
 *     tags: [Finance]
 *     summary: Bounded debtor lookup for report ranges
 *     description: Any party report permission; add kind to require one specific report permission.
 *     parameters:
 *       - $ref: '#/components/parameters/PartyReportKind'
 *       - $ref: '#/components/parameters/PartyReportBranch'
 *       - $ref: '#/components/parameters/PartyReportOrder'
 *       - { in: query, name: search, schema: { type: string, maxLength: 100 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 50 } }
 *     responses:
 *       200:
 *         description: Scoped code/name choices
 *         content:
 *           application/json:
 *             example: { status: success, data: { customers: [{ id: '00000000-0000-4000-8000-000000000001', code: 'C0001', name: 'Example Party' }] } }
 *       403: { description: Missing report permission or foreign branch }
 * /finance/settings/party-reports:
 *   get:
 *     tags: [Finance]
 *     summary: Read company ageing defaults
 *     description: Requires any party report permission.
 *     responses:
 *       200:
 *         description: Five default day limits
 *         content:
 *           application/json:
 *             example: { status: success, data: { ageLimits: [30,60,90,120,180] } }
 *       403: { description: Missing report permission }
 *   put:
 *     tags: [Finance]
 *     summary: Save company ageing defaults with audit
 *     description: Admin or SuperAdmin with report:party-outstanding-age permission.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ageLimits]
 *             properties:
 *               ageLimits: { type: array, minItems: 5, maxItems: 5, items: { type: integer, minimum: 1, maximum: 3650 }, example: [30,60,90,120,180] }
 *     responses:
 *       200: { description: Settings saved }
 *       400: { description: Limits must be strictly increasing }
 *       403: { description: Admin role and age report permission required }
 */
