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
} from './inventory.validation';

const router = Router();
const controller = new InventoryController();

router.use(authMiddleware);

router.get('/parts', requirePermission(PERMISSIONS.INVENTORY_READ), controller.listSpareParts);
router.get('/parts/:id', requirePermission(PERMISSIONS.INVENTORY_READ), validateRequest(partIdParamSchema), controller.getSparePart);
router.post('/parts', requirePermission(PERMISSIONS.INVENTORY_CREATE), validateRequest(createSparePartSchema), controller.createSparePart);
router.put('/parts/:id', requirePermission(PERMISSIONS.INVENTORY_UPDATE), validateRequest(updateSparePartSchema), controller.updateSparePart);
router.delete('/parts/:id', requirePermission(PERMISSIONS.INVENTORY_DELETE), validateRequest(partIdParamSchema), controller.deleteSparePart);

router.post('/purchase-requests', requirePermission(PERMISSIONS.INVENTORY_CREATE), validateRequest(createPurchaseRequestSchema), controller.createPurchaseRequest);
router.get('/purchase-requests', requirePermission(PERMISSIONS.INVENTORY_READ), controller.listPurchaseRequests);
router.get('/purchase-requests/:id', requirePermission(PERMISSIONS.INVENTORY_READ), validateRequest(purchaseRequestIdParamSchema), controller.getPurchaseRequest);
router.patch('/purchase-requests/:id/status', requirePermission(PERMISSIONS.INVENTORY_UPDATE), validateRequest(updatePurchaseRequestStatusSchema), controller.updatePurchaseRequestStatus);

router.post('/issuances', requirePermission(PERMISSIONS.INVENTORY_CREATE), validateRequest(createPartIssuanceSchema), controller.createPartIssuance);
router.get('/issuances', requirePermission(PERMISSIONS.INVENTORY_READ), controller.listPartIssuances);
router.get('/issuances/:id', requirePermission(PERMISSIONS.INVENTORY_READ), validateRequest(partIssuanceIdParamSchema), controller.getPartIssuance);

router.post('/returns', requirePermission(PERMISSIONS.INVENTORY_CREATE), validateRequest(createPartReturnSchema), controller.createPartReturn);
router.get('/returns', requirePermission(PERMISSIONS.INVENTORY_READ), controller.listPartReturns);
router.get('/returns/:id', requirePermission(PERMISSIONS.INVENTORY_READ), validateRequest(partReturnIdParamSchema), controller.getPartReturn);

export default router;
