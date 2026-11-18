import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import {
  RequisitionController,
  requisitionActor,
} from "./requisition.controller";
import { requisitionPartOptionsSchema } from "./requisition.validation";
import { listRequisitionPartOptions } from "./requisition-part-options.service";
import {
  cancelRequisitionSchema,
  createRequisitionSchema,
  listRequisitionsSchema,
  requisitionIdSchema,
} from "./requisition.validation";

const router = Router();
const controller = new RequisitionController();
router.use(authMiddleware);

/**
 * @openapi
 * /inventory/requisitions/part-options:
 *   get:
 *     tags: [Inventory]
 *     summary: Find registered alternates and other source records for a requested part
 *     description: Requires requisition:create, sparepart:read and stock:read. Branch-scoped. Returns active catalogue family records with branch available stock, normal/warranty rates and source labels. Includes records with no stock so zero-issue requests can be recorded. This read does not issue parts or bypass actual-part estimate approval.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: partId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: branchId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: source, schema: { type: string, enum: [O, A, F, L, U, R] } }
 *       - { in: query, name: search, schema: { type: string, maxLength: 100 } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 10 } }
 *     responses:
 *       200: { description: 'data.requested, data.options (identity, source, relationship, available, normalRate, warrantyRate, warrantyApplicable) and data.meta pagination' }
 *       400: { description: 'Invalid filters; errors include field, message and code' }
 *       401: { description: Authentication required }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Requested part not found }
 */
router.get(
  "/requisitions/part-options",
  requirePermission(PERMISSIONS.REQUISITION_CREATE),
  requirePermission(PERMISSIONS.SPAREPART_READ),
  requirePermission(PERMISSIONS.STOCK_READ),
  validateRequest(requisitionPartOptionsSchema),
  async (req, res, next) => {
    try {
      res.json({
        status: "success",
        data: await listRequisitionPartOptions(
          requisitionPartOptionsSchema.parse({ query: req.query }).query,
          requisitionActor(req),
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /inventory/requisitions:
 *   get:
 *     tags: [Inventory]
 *     summary: List branch-scoped requisitions
 *     security: [{ bearerAuth: [] }]
 *     description: Requires requisition:read. Filters branchId, jobCardId, chargeType; page defaults to 1 and limit to 25 (maximum 100). Another branch requires branch:all.
 *     responses:
 *       200: { description: Requisitions }
 *       403: { description: Permission or branch access denied }
 *   post:
 *     tags: [Inventory]
 *     summary: Issue several parts under one branch requisition number
 *     security: [{ bearerAuth: [] }]
 *     description: Requires requisition:create. GOODWILL also requires requisition:goodwill and a reason. Optional line requestedSparePartId and substitutionReason retain original intent; different supplied parts must share a registered family and require a reason. Source record prices are snapshotted; reserved stock is unavailable. Existing approved-estimate rules apply to the actual issued part. Zero issued quantity records a request without stock effect. Dates use Africa/Lagos.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *           example:
 *             branchId: 11111111-1111-4111-8111-111111111111
 *             jobCardId: 22222222-2222-4222-8222-222222222222
 *             chargeType: GOODWILL
 *             goodwillReason: Dealer approved a partial contribution
 *             lines:
 *               - sparePartId: 33333333-3333-4333-8333-333333333333
 *                 quantityRequired: 2
 *                 quantityIssued: 2
 *                 approvalPercent: 30
 *                 customerPercent: 70
 *     responses:
 *       201: { description: Requisition with line snapshots, charges and footer totals }
 *       400: { description: Invalid split, substitute family/reason, issued quantity above requested or available stock, warranty cover or job status }
 *       403: { description: Permission or branch access denied }
 * /inventory/requisitions/{id}:
 *   get:
 *     tags: [Inventory]
 *     summary: Read a requisition and its snapshots
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Requisition }
 * /inventory/requisitions/{id}/print:
 *   get:
 *     tags: [Inventory]
 *     summary: Read the store issue-note print data
 *     description: Requires requisition:read. Internal store document includes source flags, vehicle header, requestedPartNumber and substitutionReason where recorded, line snapshots and totals; no stock effect.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Print data }
 * /inventory/requisitions/{id}/cancel:
 *   post:
 *     tags: [Inventory]
 *     summary: Cancel an unbilled requisition and reverse its stock and charges
 *     description: Requires requisition:cancel. Existing returns must be cancelled first. Claims or bill references block cancellation. Repeated cancellation returns 409; all changes and audit are atomic.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [reason], properties: { reason: { type: string } } }
 *           example: { reason: Incorrect parts requested }
 *     responses:
 *       200: { description: Cancelled requisition }
 *       409: { description: Already cancelled or referenced by returns, claims or bills }
 */
router.get(
  "/requisitions",
  requirePermission(PERMISSIONS.REQUISITION_READ),
  validateRequest(listRequisitionsSchema),
  controller.list,
);
router.post(
  "/requisitions",
  requirePermission(PERMISSIONS.REQUISITION_CREATE),
  validateRequest(createRequisitionSchema),
  controller.create,
);
router.get(
  "/requisitions/:id",
  requirePermission(PERMISSIONS.REQUISITION_READ),
  validateRequest(requisitionIdSchema),
  controller.get,
);
router.get(
  "/requisitions/:id/print",
  requirePermission(PERMISSIONS.REQUISITION_READ),
  validateRequest(requisitionIdSchema),
  controller.get,
);
router.post(
  "/requisitions/:id/cancel",
  requirePermission(PERMISSIONS.REQUISITION_CANCEL),
  validateRequest(cancelRequisitionSchema),
  controller.cancel,
);

export default router;
