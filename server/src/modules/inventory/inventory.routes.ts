import { Router } from 'express';
import { InventoryController } from './inventory.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createPartMasterSchema,
  updatePartMasterSchema,
  partMasterIdParamSchema,
  listPartsQuerySchema,
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
  stockQuerySchema,
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
 *     summary: List all parts
 *     description: Retrieve a paginated list of Part Master records with optional filters.
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
 *         name: partCode
 *         schema: { type: string }
 *         description: Filter by part code (case-insensitive partial match)
 *       - in: query
 *         name: partNumber
 *         schema: { type: string }
 *         description: Filter by part number (case-insensitive partial match)
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *         description: Filter by part name (case-insensitive partial match)
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *         description: Filter by category (case-insensitive partial match)
 *       - in: query
 *         name: partStatus
 *         schema: { type: string, enum: [ACTIVE, BLOCKED] }
 *         description: Filter by part status
 *     responses:
 *       200:
 *         description: Paginated parts list
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
 *                             $ref: '#/components/schemas/PartMasterDTO'
 *                         meta:
 *                           $ref: '#/components/schemas/PaginationMeta'
 *   post:
 *     tags:
 *       - Inventory & Parts
 *     summary: Create a Part Master record
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePartMasterInput'
 *           example:
 *             partCode: TYT-OIL-5W30
 *             partNumber: ENG-OIL-5W30
 *             name: Toyota 5W-30 Engine Oil (4L)
 *             category: Lubricants
 *             uom: Litre
 *             unitRate: 4500
 *             taxCategory: VAT
 *             taxForm: Form C
 *             minLevel: 10
 *             maxLevel: 100
 *             reorderQty: 50
 *             binLocation: A-12-3
 *             storeLocation: Main Warehouse
 *             partStatus: ACTIVE
 *     responses:
 *       201:
 *         description: Part created
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
 *                         part:
 *                           $ref: '#/components/schemas/PartMasterDTO'
 *
 * /inventory/parts/{id}:
 *   get:
 *     tags:
 *       - Inventory & Parts
 *     summary: Get Part Master record by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Part details
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
 *                         part:
 *                           $ref: '#/components/schemas/PartMasterDTO'
 *   put:
 *     tags:
 *       - Inventory & Parts
 *     summary: Update a Part Master record
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdatePartMasterInput'
 *           example:
 *             name: Toyota 5W-30 Engine Oil (4L) - Updated
 *             unitRate: 4600
 *             partStatus: ACTIVE
 *     responses:
 *       200:
 *         description: Part updated
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
 *                         part:
 *                           $ref: '#/components/schemas/PartMasterDTO'
 *   delete:
 *     tags:
 *       - Inventory & Parts
 *     summary: Delete a Part Master record
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
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
 *     summary: List inventory stock
 *     description: Branch-scoped users are restricted to their assigned branch. Cross-branch results require the inventory:cross-branch permission.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema: { type: string, format: uuid }
 *         description: Filter by branch. Ignored for branch-scoped users, who are always restricted to their assigned branch.
 *       - in: query
 *         name: partId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by part number or part name.
 *     responses:
 *       200:
 *         description: Stock overview
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
 *                         stockItems:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/InventoryStockDTO'
 *       403:
 *         description: Insufficient permission or unauthorized branch access
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 * /inventory/stock/adjust:
 *   post:
 *     tags:
 *       - Inventory & Parts
 *     summary: Adjust stock quantity
 *     description: The branchId must be the authenticated user's branch unless the user has inventory:cross-branch permission.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branchId, partId, quantity, type]
 *             properties:
 *               branchId: { type: string, format: uuid }
 *               partId: { type: string, format: uuid }
 *               quantity: { type: integer, description: Positive to add, negative to deduct }
 *               type: { type: string, example: ADJUSTMENT }
 *               notes: { type: string, example: Physical count correction }
 *     responses:
 *       200:
 *         description: Stock adjusted
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
 *                         stock:
 *                           $ref: '#/components/schemas/InventoryStockDTO'
 *       403:
 *         description: Unauthorized branch access
 *
 * /inventory/stock/{branchId}:
 *   get:
 *     tags:
 *       - Inventory & Parts
 *     summary: List stock for a specific branch
 *     description: Branch-scoped users may only request their assigned branch. Cross-branch access requires inventory:cross-branch permission.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Branch stock
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
 *                         stockItems:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/InventoryStockDTO'
 *       403:
 *         description: Unauthorized branch access
 *
 * /inventory/stock/{branchId}/{partId}:
 *   get:
 *     tags:
 *       - Inventory & Parts
 *     summary: Get stock details for a part at a branch
 *     description: Branch-scoped users may only request stock from their assigned branch. Cross-branch access requires inventory:cross-branch permission.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: partId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Stock details
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
 *                         stock:
 *                           $ref: '#/components/schemas/InventoryStockDTO'
 *       403:
 *         description: Unauthorized branch access
 *
 * /inventory/transactions:
 *   get:
 *     tags:
 *       - Inventory & Parts
 *     summary: List stock transactions
 *     description: Branch-scoped users are restricted to their assigned branch. Cross-branch filtering requires inventory:cross-branch permission.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: partId
 *         schema: { type: string, format: uuid }
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
// Spare Parts / Part Master
router.get('/parts', requirePermission(PERMISSIONS.SPAREPART_READ), validateRequest(listPartsQuerySchema), controller.listParts);
router.get('/parts/:id', requirePermission(PERMISSIONS.SPAREPART_READ), validateRequest(partMasterIdParamSchema), controller.getPart);
router.post('/parts', requirePermission(PERMISSIONS.SPAREPART_CREATE), validateRequest(createPartMasterSchema), controller.createPart);
router.put('/parts/:id', requirePermission(PERMISSIONS.SPAREPART_UPDATE), validateRequest(updatePartMasterSchema), controller.updatePart);
router.delete('/parts/:id', requirePermission(PERMISSIONS.SPAREPART_DELETE), validateRequest(partMasterIdParamSchema), controller.deletePart);

// Branch Stock
router.get('/stock', requirePermission(PERMISSIONS.STOCK_READ), validateRequest(stockQuerySchema), controller.listAllStock);
router.get('/stock/:branchId', requirePermission(PERMISSIONS.STOCK_READ), validateRequest(branchIdParamSchema), controller.listBranchStock);
router.get('/stock/:branchId/:partId', requirePermission(PERMISSIONS.STOCK_READ), validateRequest(branchPartParamSchema), controller.getBranchStock);
router.post('/stock/adjust', requirePermission(PERMISSIONS.STOCK_UPDATE), validateRequest(adjustStockSchema), controller.adjustStock);

// Stock Transactions
router.get('/transactions', requirePermission(PERMISSIONS.STOCK_READ), controller.listStockTransactions);

// Purchase Requests
router.post('/purchase-requests', requirePermission(PERMISSIONS.PURCHASEREQUEST_CREATE), validateRequest(createPurchaseRequestSchema), controller.createPurchaseRequest);
router.get('/purchase-requests', requirePermission(PERMISSIONS.PURCHASEREQUEST_READ), controller.listPurchaseRequests);
router.get('/purchase-requests/:id', requirePermission(PERMISSIONS.PURCHASEREQUEST_READ), validateRequest(purchaseRequestIdParamSchema), controller.getPurchaseRequest);
router.patch('/purchase-requests/:id/status', requirePermission(PERMISSIONS.PURCHASEREQUEST_UPDATE), validateRequest(updatePurchaseRequestStatusSchema), controller.updatePurchaseRequestStatus);

// Part Issuances
router.post('/issuances', requirePermission(PERMISSIONS.PARTISSUANCE_CREATE), validateRequest(createPartIssuanceSchema), controller.createPartIssuance);
router.get('/issuances', requirePermission(PERMISSIONS.PARTISSUANCE_READ), controller.listPartIssuances);
router.get('/issuances/:id', requirePermission(PERMISSIONS.PARTISSUANCE_READ), validateRequest(partIssuanceIdParamSchema), controller.getPartIssuance);

// Part Returns
router.post('/returns', requirePermission(PERMISSIONS.PARTRETURN_CREATE), validateRequest(createPartReturnSchema), controller.createPartReturn);
router.get('/returns', requirePermission(PERMISSIONS.PARTRETURN_READ), controller.listPartReturns);
router.get('/returns/:id', requirePermission(PERMISSIONS.PARTRETURN_READ), validateRequest(partReturnIdParamSchema), controller.getPartReturn);

// Inter-Branch Transfers
router.post('/transfers', requirePermission(PERMISSIONS.TRANSFER_CREATE), validateRequest(createTransferSchema), controller.createTransfer);
router.get('/transfers', requirePermission(PERMISSIONS.TRANSFER_READ), controller.listTransfers);
router.get('/transfers/:id', requirePermission(PERMISSIONS.TRANSFER_READ), validateRequest(transferIdParamSchema), controller.getTransfer);
router.patch('/transfers/:id/approve', requirePermission(PERMISSIONS.TRANSFER_APPROVE), validateRequest(transferIdParamSchema), controller.approveTransfer);
router.patch('/transfers/:id/dispatch', requirePermission(PERMISSIONS.TRANSFER_DISPATCH), validateRequest(updateTransferStatusSchema), controller.dispatchTransfer);
router.patch('/transfers/:id/receive', requirePermission(PERMISSIONS.TRANSFER_RECEIVE), validateRequest(updateTransferStatusSchema), controller.receiveTransfer);
router.patch('/transfers/:id/reject', requirePermission(PERMISSIONS.TRANSFER_REJECT), validateRequest(updateTransferStatusSchema), controller.rejectTransfer);
router.patch('/transfers/:id/cancel', requirePermission(PERMISSIONS.TRANSFER_CANCEL), validateRequest(transferIdParamSchema), controller.cancelTransfer);

export default router;

