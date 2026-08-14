import { Router } from 'express';
import { CustomerController } from './customer.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createCustomerSchema,
  updateCustomerSchema,
  createCustomerDocumentSchema,
  createServiceHistorySchema,
  customerIdParamSchema,
  customerAccountSchema,
} from './customer.validation';

const router = Router();
const controller = new CustomerController();

router.use(authMiddleware);

router.get('/', requirePermission(PERMISSIONS.CUSTOMER_READ), controller.getCustomers);
router.get('/:id', requirePermission(PERMISSIONS.CUSTOMER_READ), validateRequest(customerIdParamSchema), controller.getCustomer);
router.post('/', requirePermission(PERMISSIONS.CUSTOMER_CREATE), validateRequest(createCustomerSchema), controller.createCustomer);
router.put('/:id', requirePermission(PERMISSIONS.CUSTOMER_UPDATE), validateRequest(updateCustomerSchema), controller.updateCustomer);

router.post('/:id/documents', requirePermission(PERMISSIONS.CUSTOMER_UPDATE), validateRequest(createCustomerDocumentSchema), controller.addCustomerDocument);
router.get('/:id/documents', requirePermission(PERMISSIONS.CUSTOMER_READ), validateRequest(customerIdParamSchema), controller.getCustomerDocuments);

router.post('/:id/service-history', requirePermission(PERMISSIONS.CUSTOMER_UPDATE), validateRequest(createServiceHistorySchema), controller.addServiceHistory);
router.get('/:id/service-history', requirePermission(PERMISSIONS.CUSTOMER_READ), validateRequest(customerIdParamSchema), controller.getServiceHistory);

router.post('/:id/account', requirePermission(PERMISSIONS.CUSTOMER_UPDATE), validateRequest(customerAccountSchema), controller.manageCustomerAccount);

export default router;
