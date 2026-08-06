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
