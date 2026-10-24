import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import { ReturnSlipController } from './return-slip.controller';
import { cancelReturnSlipSchema, createReturnSlipSchema, listReturnSlipsSchema, returnSlipIdSchema } from './return-slip.validation';

const router = Router();
const controller = new ReturnSlipController();
router.use(authMiddleware);

/**
 * @swagger
 * /inventory/return-slips:
 *   get:
 *     tags: [Inventory]
 *     summary: List branch-scoped item return slips
 *     description: Requires requisition:read. Filters branchId, jobCardId, requisitionId and chargeType. Another branch requires branch:all. page defaults to 1; limit defaults to 25 (maximum 100).
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Return slips }
 *       403: { description: Permission or branch access denied }
 *   post:
 *     tags: [Inventory]
 *     summary: Return issued requisition parts to branch stock
 *     description: Requires requisition:create. Branch, job and charge type come from the requisition. Returns cannot exceed issued minus active previous returns. Stock, split charges and audit update atomically, using original rate snapshots. READY jobs reopen for QC. Billed, delivered and cancelled jobs reject writes. Dates use Africa/Lagos.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *           example:
 *             requisitionId: 11111111-1111-4111-8111-111111111111
 *             lines:
 *               - requisitionLineId: 22222222-2222-4222-8222-222222222222
 *                 quantity: 1
 *     responses:
 *       201: { description: Numbered return slip with snapshots and footer totals }
 *       400: { description: Invalid line, quantity or job status }
 *       403: { description: Permission or branch access denied }
 *       409: { description: Cancelled requisition or charge linked to claims or bills }
 * /inventory/return-slips/{id}:
 *   get:
 *     tags: [Inventory]
 *     summary: Read return-slip details and original snapshots
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Return slip }
 * /inventory/return-slips/{id}/print:
 *   get:
 *     tags: [Inventory]
 *     summary: Read the internal item return-slip print data
 *     description: Requires requisition:read. Includes requisition/vehicle headers, original source, quantity/rate snapshots and footer totals; no stock effect.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Internal print data }
 * /inventory/return-slips/{id}/cancel:
 *   post:
 *     tags: [Inventory]
 *     summary: Cancel an unbilled return slip and restore its charge allocation
 *     description: Requires requisition:cancel and a reason. Removes returned stock again (excluding reserved stock) and restores the remaining charges from original snapshots. Repeated cancellation or insufficient available stock returns 409; all changes and audit are atomic.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [reason], properties: { reason: { type: string } } }
 *           example: { reason: Return entered against the wrong slip }
 *     responses:
 *       200: { description: Cancelled return slip }
 *       409: { description: Already cancelled, unavailable stock, cancelled requisition or claim/bill reference }
 */
router.get('/return-slips', requirePermission(PERMISSIONS.REQUISITION_READ), validateRequest(listReturnSlipsSchema), controller.list);
router.post('/return-slips', requirePermission(PERMISSIONS.REQUISITION_CREATE), validateRequest(createReturnSlipSchema), controller.create);
router.get('/return-slips/:id', requirePermission(PERMISSIONS.REQUISITION_READ), validateRequest(returnSlipIdSchema), controller.get);
router.get('/return-slips/:id/print', requirePermission(PERMISSIONS.REQUISITION_READ), validateRequest(returnSlipIdSchema), controller.get);
router.post('/return-slips/:id/cancel', requirePermission(PERMISSIONS.REQUISITION_CANCEL), validateRequest(cancelReturnSlipSchema), controller.cancel);

export default router;
