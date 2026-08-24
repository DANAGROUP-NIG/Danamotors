import { Router } from 'express';
import { InventoryController } from './inventory.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createSparePartSchema,
  updateSparePartSchema,
  partIdParamSchema,
  createPurchaseRequestSchema,
  purchaseRequestIdParamSchema,
  updatePurchaseRequestStatusSchema,
  createPartIssuanceSchema,
  partIssuanceIdParamSchema,
  createPartReturnSchema,
  partReturnIdParamSchema,
  adjustStockSchema,
  createTransferSchema,
  updateTransferStatusSchema,
  transferIdParamSchema,
  branchIdParamSchema,
  branchPartParamSchema,
} from './inventory.validation';

const router = Router();
const controller = new InventoryController();

router.use(authMiddleware);

/**
 * @openapi
 * /inventory/parts:
 *   get:
 *     tags:
 *       - Inventory & Parts
 *     summary: List all spare parts
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by part number or name
 *     responses:
 *       200:
 *         description: Paginated spare parts list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         parts:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/SparePartDTO'
 *                         meta:
 *                           $ref: '#/components/schemas/PaginationMeta'
 *   post:
 *     tags:
 *       - Inventory & Parts
 *     summary: Create a spare part
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [partNumber, name, unitPrice]
 *             properties:
 *               partNumber: { type: string, example: TYT-OIL-5W30 }
 *               name: { type: string, example: Toyota 5W-30 Engine Oil (4L) }
 *               description: { type: string }
 *               unitPrice: { type: number, example: 4500 }
 *               unit: { type: string, example: Litre }
 *               categoryId: { type: string }
 *     responses:
 *       201:
 *         description: Spare part created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SparePartDTO'
 *
 * /inventory/parts/{id}:
 *   get:
 *     tags:
 *       - Inventory & Parts
 *     summary: Get spare part by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Spare part details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SparePartDTO'
 *   put:
 *     tags:
 *       - Inventory & Parts
 *     summary: Update spare part
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
 *               name: { type: string }
 *               description: { type: string }
 *               unitPrice: { type: number }
 *               unit: { type: string }
 *     responses:
 *       200:
 *         description: Part updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   delete:
 *     tags:
 *       - Inventory & Parts
 *     summary: Delete spare part
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Part deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /inventory/stock:
 *   get:
 *     tags:
 *       - Inventory & Parts
 *     summary: List stock across all branches
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Stock overview
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /inventory/stock/adjust:
 *   post:
 *     tags:
 *       - Inventory & Parts
 *     summary: Adjust stock quantity
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branchId, partId, adjustment, reason]
 *             properties:
 *               branchId: { type: string }
 *               partId: { type: string }
 *               adjustment: { type: integer, description: Positive to add, negative to deduct }
 *               reason: { type: string, example: Physical count correction }
 *     responses:
 *       200:
 *         description: Stock adjusted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /inventory/stock/{branchId}:
 *   get:
 *     tags:
 *       - Inventory & Parts
 *     summary: List stock for a specific branch
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Branch stock
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /inventory/transactions:
 *   get:
 *     tags:
 *       - Inventory & Parts
 *     summary: List all stock transactions
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [ISSUANCE, RETURN, ADJUSTMENT, TRANSFER_IN, TRANSFER_OUT] }
 *     responses:
 *       200:
 *         description: Stock transactions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /inventory/purchase-requests:
 *   post:
 *     tags:
 *       - Inventory & Parts
 *     summary: Create a purchase request
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     partId: { type: string }
 *                     quantity: { type: integer }
 *                     unitPrice: { type: number }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Purchase request created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   get:
 *     tags:
 *       - Inventory & Parts
 *     summary: List purchase requests
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Purchase request list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /inventory/purchase-requests/{id}/status:
 *   patch:
 *     tags:
 *       - Inventory & Parts
 *     summary: Update purchase request status
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [APPROVED, REJECTED, ORDERED, RECEIVED] }
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /inventory/issuances:
 *   post:
 *     tags:
 *       - Inventory & Parts
 *     summary: Issue parts for a job card
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jobCardId, partId, quantity]
 *             properties:
 *               jobCardId: { type: string }
 *               partId: { type: string }
 *               quantity: { type: integer }
 *     responses:
 *       201:
 *         description: Parts issued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   get:
 *     tags:
 *       - Inventory & Parts
 *     summary: List part issuances
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Issuance list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /inventory/transfers:
 *   post:
 *     tags:
 *       - Inventory & Parts
 *     summary: Create inter-branch stock transfer
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sourceBranchId, destinationBranchId, items]
 *             properties:
 *               sourceBranchId: { type: string }
 *               destinationBranchId: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     partId: { type: string }
 *                     quantity: { type: integer }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Transfer created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   get:
 *     tags:
 *       - Inventory & Parts
 *     summary: List stock transfers
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Transfer list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /inventory/transfers/{id}/approve:
 *   patch:
 *     tags:
 *       - Inventory & Parts
 *     summary: Approve a stock transfer
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Transfer approved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /inventory/transfers/{id}/dispatch:
 *   patch:
 *     tags:
 *       - Inventory & Parts
 *     summary: Mark transfer as dispatched
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Transfer dispatched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /inventory/transfers/{id}/receive:
 *   patch:
 *     tags:
 *       - Inventory & Parts
 *     summary: Confirm transfer receipt
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Transfer received — stock updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
// Spare Parts
router.get('/parts', requirePermission(PERMISSIONS.INVENTORY_READ), controller.listSpareParts);
router.get('/parts/:id', requirePermission(PERMISSIONS.INVENTORY_READ), validateRequest(partIdParamSchema), controller.getSparePart);
router.post('/parts', requirePermission(PERMISSIONS.INVENTORY_CREATE), validateRequest(createSparePartSchema), controller.createSparePart);
router.put('/parts/:id', requirePermission(PERMISSIONS.INVENTORY_UPDATE), validateRequest(updateSparePartSchema), controller.updateSparePart);
router.delete('/parts/:id', requirePermission(PERMISSIONS.INVENTORY_DELETE), validateRequest(partIdParamSchema), controller.deleteSparePart);

// Branch Stock
router.get('/stock', requirePermission(PERMISSIONS.INVENTORY_READ), controller.listAllStock);
router.get('/stock/:branchId', requirePermission(PERMISSIONS.INVENTORY_READ), validateRequest(branchIdParamSchema), controller.listBranchStock);
router.get('/stock/:branchId/:partId', requirePermission(PERMISSIONS.INVENTORY_READ), validateRequest(branchPartParamSchema), controller.getBranchStock);
router.post('/stock/adjust', requirePermission(PERMISSIONS.INVENTORY_UPDATE), validateRequest(adjustStockSchema), controller.adjustStock);

// Stock Transactions
router.get('/transactions', requirePermission(PERMISSIONS.INVENTORY_READ), controller.listStockTransactions);

// Purchase Requests
router.post('/purchase-requests', requirePermission(PERMISSIONS.INVENTORY_CREATE), validateRequest(createPurchaseRequestSchema), controller.createPurchaseRequest);
router.get('/purchase-requests', requirePermission(PERMISSIONS.INVENTORY_READ), controller.listPurchaseRequests);
router.get('/purchase-requests/:id', requirePermission(PERMISSIONS.INVENTORY_READ), validateRequest(purchaseRequestIdParamSchema), controller.getPurchaseRequest);
router.patch('/purchase-requests/:id/status', requirePermission(PERMISSIONS.INVENTORY_UPDATE), validateRequest(updatePurchaseRequestStatusSchema), controller.updatePurchaseRequestStatus);

// Part Issuances
router.post('/issuances', requirePermission(PERMISSIONS.INVENTORY_CREATE), validateRequest(createPartIssuanceSchema), controller.createPartIssuance);
router.get('/issuances', requirePermission(PERMISSIONS.INVENTORY_READ), controller.listPartIssuances);
router.get('/issuances/:id', requirePermission(PERMISSIONS.INVENTORY_READ), validateRequest(partIssuanceIdParamSchema), controller.getPartIssuance);

// Part Returns
router.post('/returns', requirePermission(PERMISSIONS.INVENTORY_CREATE), validateRequest(createPartReturnSchema), controller.createPartReturn);
router.get('/returns', requirePermission(PERMISSIONS.INVENTORY_READ), controller.listPartReturns);
router.get('/returns/:id', requirePermission(PERMISSIONS.INVENTORY_READ), validateRequest(partReturnIdParamSchema), controller.getPartReturn);

// Inter-Branch Transfers
router.post('/transfers', requirePermission(PERMISSIONS.TRANSFER_CREATE), validateRequest(createTransferSchema), controller.createTransfer);
router.get('/transfers', requirePermission(PERMISSIONS.TRANSFER_READ), controller.listTransfers);
router.get('/transfers/:id', requirePermission(PERMISSIONS.TRANSFER_READ), validateRequest(transferIdParamSchema), controller.getTransfer);
router.patch('/transfers/:id/approve', requirePermission(PERMISSIONS.TRANSFER_APPROVE), validateRequest(transferIdParamSchema), controller.approveTransfer);
router.patch('/transfers/:id/dispatch', requirePermission(PERMISSIONS.TRANSFER_DISPATCH), validateRequest(updateTransferStatusSchema), controller.dispatchTransfer);
router.patch('/transfers/:id/receive', requirePermission(PERMISSIONS.TRANSFER_RECEIVE), validateRequest(updateTransferStatusSchema), controller.receiveTransfer);
router.patch('/transfers/:id/reject', requirePermission(PERMISSIONS.TRANSFER_APPROVE), validateRequest(updateTransferStatusSchema), controller.rejectTransfer);
router.patch('/transfers/:id/cancel', requirePermission(PERMISSIONS.TRANSFER_UPDATE), validateRequest(transferIdParamSchema), controller.cancelTransfer);

export default router;

