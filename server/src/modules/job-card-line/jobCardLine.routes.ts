import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { JobCardLineController } from "./jobCardLine.controller";
import { jobCardParamSchema, updateLineSchema } from "./jobCardLine.validation";

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
 *       Lines mirror the job card: one per stock issuance (following approved part returns) and one per
 *       labour line from the labour catalogue. Defaults: `FREE` when a linked campaign covers the item,
 *       `WARRANTY` when the vehicle was covered at creation and the part is warranty-applicable, otherwise
 *       `CUSTOMER`. The job bill (finance) charges the customer only for `CUSTOMER` lines; once the job
 *       card is billed, every line is locked.
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
 * /service/job-cards/{id}/lines/{lineId}:
 *   patch:
 *     tags: [Job Card Lines]
 *     summary: Change who pays for a line (jobcard:line:update)
 *     description: |
 *       `WARRANTY` needs coverage at creation (or a warranty case) and, for parts, a warranty-applicable part.
 *       `GOODWILL` needs `warranty:update`. `FREE` must name a campaign linked to the job card.
 *       Lines on a billed job card, or on a submitted claim, are locked (409).
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: lineId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { chargeType: GOODWILL, reason: "Approved by workshop manager — repeat repair" }
 *     responses:
 *       200: { description: Updated line }
 *       409: { description: Job card is billed or line is on a submitted claim }
 */
export const jobCardLineRouter = Router();
jobCardLineRouter.get("/job-cards/:id/lines", authMiddleware, requirePermission(P.JOBCARD_READ), validateRequest(jobCardParamSchema), controller.list);
jobCardLineRouter.patch("/job-cards/:id/lines/:lineId", authMiddleware, requirePermission(P.JOBCARD_LINE_UPDATE), validateRequest(updateLineSchema), controller.update);

