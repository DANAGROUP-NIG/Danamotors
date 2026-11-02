import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import { RequisitionController } from './requisition.controller';
import { cancelRequisitionSchema, createRequisitionSchema, listRequisitionsSchema, requisitionIdSchema } from './requisition.validation';

const router = Router();
const controller = new RequisitionController();
router.use(authMiddleware);

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
 *     description: Requires requisition:create. GOODWILL also requires requisition:goodwill and a reason. Source record prices are snapshotted; reserved stock is unavailable. Existing approved-estimate rules apply to issued work. Zero issued quantity records a request without stock effect. Dates use Africa/Lagos.
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
 *       400: { description: Invalid split, stock, warranty cover or job status }
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
 *     description: Requires requisition:read. Internal store document includes source flags, vehicle header, line snapshots and totals; no stock effect.
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
router.get('/requisitions', requirePermission(PERMISSIONS.REQUISITION_READ), validateRequest(listRequisitionsSchema), controller.list);
router.post('/requisitions', requirePermission(PERMISSIONS.REQUISITION_CREATE), validateRequest(createRequisitionSchema), controller.create);
router.get('/requisitions/:id', requirePermission(PERMISSIONS.REQUISITION_READ), validateRequest(requisitionIdSchema), controller.get);
router.get('/requisitions/:id/print', requirePermission(PERMISSIONS.REQUISITION_READ), validateRequest(requisitionIdSchema), controller.get);
router.post('/requisitions/:id/cancel', requirePermission(PERMISSIONS.REQUISITION_CANCEL), validateRequest(cancelRequisitionSchema), controller.cancel);

export default router;
