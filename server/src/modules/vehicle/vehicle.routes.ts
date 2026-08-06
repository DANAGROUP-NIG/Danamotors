import { Router } from 'express';
import { VehicleController } from './vehicle.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createVehicleSchema,
  updateVehicleSchema,
  createVehicleImageSchema,
  createVehicleOwnershipSchema,
  vehicleIdParamSchema,
} from './vehicle.validation';

const router = Router();
const controller = new VehicleController();

router.use(authMiddleware);

router.get('/', requirePermission(PERMISSIONS.VEHICLE_READ), controller.getVehicles);
router.get('/:id', requirePermission(PERMISSIONS.VEHICLE_READ), validateRequest(vehicleIdParamSchema), controller.getVehicle);
router.post('/', requirePermission(PERMISSIONS.VEHICLE_CREATE), validateRequest(createVehicleSchema), controller.createVehicle);
router.put('/:id', requirePermission(PERMISSIONS.VEHICLE_UPDATE), validateRequest(updateVehicleSchema), controller.updateVehicle);
router.delete('/:id', requirePermission(PERMISSIONS.VEHICLE_DELETE), validateRequest(vehicleIdParamSchema), controller.deleteVehicle);

router.post('/:id/images', requirePermission(PERMISSIONS.VEHICLE_UPDATE), validateRequest(createVehicleImageSchema), controller.addVehicleImage);
router.get('/:id/images', requirePermission(PERMISSIONS.VEHICLE_READ), validateRequest(vehicleIdParamSchema), controller.getVehicleImages);

router.post('/:id/ownerships', requirePermission(PERMISSIONS.VEHICLE_UPDATE), validateRequest(createVehicleOwnershipSchema), controller.addVehicleOwnership);
router.get('/:id/ownerships', requirePermission(PERMISSIONS.VEHICLE_READ), validateRequest(vehicleIdParamSchema), controller.getVehicleOwnerships);

export default router;
