import { Router } from 'express';
import { ServicesController } from './services.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createServiceSchema,
  updateServiceSchema,
  serviceIdParamSchema,
} from './services.validation';

const router = Router();
const controller = new ServicesController();

router.use(authMiddleware);

router.get('/', requirePermission(PERMISSIONS.SERVICES_READ), controller.listServices);
router.get('/:id', requirePermission(PERMISSIONS.SERVICES_READ), validateRequest(serviceIdParamSchema), controller.getService);
router.post('/', requirePermission(PERMISSIONS.SERVICES_CREATE), validateRequest(createServiceSchema), controller.createService);
router.put('/:id', requirePermission(PERMISSIONS.SERVICES_UPDATE), validateRequest(updateServiceSchema), controller.updateService);
router.delete('/:id', requirePermission(PERMISSIONS.SERVICES_DELETE), validateRequest(serviceIdParamSchema), controller.deleteService);

export default router;
