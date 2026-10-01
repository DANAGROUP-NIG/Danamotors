import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { JobCardLineController } from "./jobCardLine.controller";
import { addLabourLineSchema, generateInvoiceSchema, jobCardParamSchema, lineParamSchema, updateLineSchema } from "./jobCardLine.validation";

const controller = new JobCardLineController();
const P = PERMISSIONS;

/**
 * @openapi
 * tags:
 *   - name: Job Card Lines
 *     description: |
 *       Priced part and labour lines on a job card, and who pays for each (`chargeType`):
 *       `CUSTOMER` (legacy N), `WARRANTY` (W), `GOODWILL` (G) or `FREE` (F, charged to a campaign).
 *
 *       Part lines are created from stock issued to the job card (one line per issuance) and follow
 *       approved part returns. Defaults: `FREE` when a linked campaign covers the item, `WARRANTY` when
 *       the vehicle was covered at creation and the part is warranty-applicable, otherwise `CUSTOMER`.
 *       Only `CUSTOMER` lines are invoiced.
 *
 * /service/job-cards/{id}/lines:
 *   get:
 *     tags: [Job Card Lines]
 *     summary: Lines with totals by payer
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Lines
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 lines:
 *                   - { id: "…", kind: PART, sparePart: { partNumber: 27310-2E601, name: Ignition coil assembly }, quantity: 1, rate: 64300, amount: 64300, chargeType: WARRANTY, locked: false }
 *                   - { id: "…", kind: LABOUR, operationCode: SRV-60K, description: Periodic service 60k, quantity: 2, rate: 24000, amount: 48000, chargeType: CUSTOMER, locked: false }
 *                 totals: { customer: 86500, warranty: 214300, goodwill: 0, free: 35000, customerTax: 6487.5, customerInvoiceTotal: 92987.5 }
 *                 vatRate: 0.075
 *                 coverageAtCreation: ACTIVE
 *                 warrantyCase: { id: "…", caseNumber: WTY2026000031, status: SUBMITTED }
 *                 linkedCampaigns: [{ id: "…", code: FF-2026-003, title: Infotainment software update, type: FREE_FIX }]
 *   post:
 *     tags: [Job Card Lines]
 *     summary: Add a labour line (jobcard:line:update)
 *     description: Parts are added by issuing stock to the job card. Omit `chargeType` to use the default.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { operationCode: SRV-60K, description: Periodic service 60k, hours: 2, rate: 24000 }
 *     responses:
 *       201: { description: Line added }
 * /service/job-cards/{id}/lines/{lineId}:
 *   patch:
 *     tags: [Job Card Lines]
 *     summary: Change who pays for a line, or edit a labour line (jobcard:line:update)
 *     description: |
 *       `WARRANTY` needs coverage at creation (or a warranty case) and, for parts, a warranty-applicable part.
 *       `GOODWILL` needs `warranty:update`. `FREE` must name a campaign linked to the job card.
 *       Lines already invoiced, or on a submitted claim, are locked (409).
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: lineId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { chargeType: GOODWILL, reason: "Approved by workshop manager — repeat repair" }
 *     responses:
 *       200: { description: Updated line }
 *       409: { description: Line is invoiced or on a submitted claim }
 *   delete:
 *     tags: [Job Card Lines]
 *     summary: Remove a labour line (jobcard:line:update)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: lineId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Removed }
 */
export const jobCardLineRouter = Router();
jobCardLineRouter.get("/job-cards/:id/lines", authMiddleware, requirePermission(P.JOBCARD_READ), validateRequest(jobCardParamSchema), controller.list);
jobCardLineRouter.post("/job-cards/:id/lines", authMiddleware, requirePermission(P.JOBCARD_LINE_UPDATE), validateRequest(addLabourLineSchema), controller.addLabour);
jobCardLineRouter.patch("/job-cards/:id/lines/:lineId", authMiddleware, requirePermission(P.JOBCARD_LINE_UPDATE), validateRequest(updateLineSchema), controller.update);
jobCardLineRouter.delete("/job-cards/:id/lines/:lineId", authMiddleware, requirePermission(P.JOBCARD_LINE_UPDATE), validateRequest(lineParamSchema), controller.remove);

/**
 * @openapi
 * /finance/invoices/from-job-card/{jobCardId}:
 *   post:
 *     tags: [Job Card Lines]
 *     summary: Generate the customer invoice from a job card (invoice:create)
 *     description: |
 *       Bills only `CUSTOMER` lines, with VAT on taxable lines, and snapshots them as invoice lines.
 *       A job card can have one live invoice (409 otherwise). Warranty, goodwill and free lines are never billed.
 *     parameters:
 *       - { in: path, name: jobCardId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { dueDate: "2026-10-15", notes: "Warranty parts claimed on WTY2026000031" }
 *     responses:
 *       201:
 *         description: Invoice
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               message: Invoice INV2026000211 created
 *               data: { invoice: { invoiceNumber: INV2026000211, subtotal: 86500, tax: 6487.5, total: 92987.5, status: Unpaid, lines: [{ description: Engine oil and filter kit, quantity: 1, rate: 38500, amount: 38500 }] } }
 *       400: { description: No customer lines }
 *       409: { description: Already invoiced }
 */
export const jobCardInvoiceRouter = Router();
jobCardInvoiceRouter.post(
  "/invoices/from-job-card/:jobCardId",
  authMiddleware,
  requirePermission(P.INVOICE_CREATE),
  validateRequest(generateInvoiceSchema),
  controller.generateInvoice,
);
