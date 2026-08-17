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

/**
 * @openapi
 * /vehicles:
 *   get:
 *     tags:
 *       - Vehicles
 *     summary: List all vehicles
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
 *         description: Search by plate number, VIN, make, or model
 *       - in: query
 *         name: customerId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated vehicle list
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
 *                         vehicles:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/VehicleDTO'
 *                         meta:
 *                           $ref: '#/components/schemas/PaginationMeta'
 *   post:
 *     tags:
 *       - Vehicles
 *     summary: Register a new vehicle
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plateNumber, make, model, year]
 *             properties:
 *               plateNumber: { type: string, example: LSD-123-AB }
 *               make: { type: string, example: Toyota }
 *               model: { type: string, example: Camry }
 *               year: { type: integer, example: 2022 }
 *               vin: { type: string, example: 1HGCM82633A123456 }
 *               color: { type: string }
 *               mileage: { type: integer }
 *               engineNumber: { type: string }
 *               customerId: { type: string }
 *     responses:
 *       201:
 *         description: Vehicle registered
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/VehicleDTO'
 *
 * /vehicles/{id}:
 *   get:
 *     tags:
 *       - Vehicles
 *     summary: Get vehicle by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vehicle details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/VehicleDTO'
 *   put:
 *     tags:
 *       - Vehicles
 *     summary: Update vehicle details
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
 *               plateNumber: { type: string }
 *               make: { type: string }
 *               model: { type: string }
 *               year: { type: integer }
 *               color: { type: string }
 *               mileage: { type: integer }
 *     responses:
 *       200:
 *         description: Vehicle updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/VehicleDTO'
 *   delete:
 *     tags:
 *       - Vehicles
 *     summary: Delete a vehicle
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vehicle deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /vehicles/{id}/images:
 *   post:
 *     tags:
 *       - Vehicles
 *     summary: Add a vehicle image
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
 *             required: [url]
 *             properties:
 *               url: { type: string, format: uri }
 *               caption: { type: string }
 *     responses:
 *       201:
 *         description: Image added
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   get:
 *     tags:
 *       - Vehicles
 *     summary: List vehicle images
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vehicle images
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /vehicles/{id}/ownerships:
 *   post:
 *     tags:
 *       - Vehicles
 *     summary: Add vehicle ownership record
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
 *             required: [customerId]
 *             properties:
 *               customerId: { type: string }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date, nullable: true }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Ownership record added
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   get:
 *     tags:
 *       - Vehicles
 *     summary: Get vehicle ownership history
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Ownership history
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
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

