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

/**
 * @openapi
 * /services:
 *   get:
 *     tags:
 *       - Services Catalog
 *     summary: List all service catalog items
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Service catalog list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   post:
 *     tags:
 *       - Services Catalog
 *     summary: Create a new service type
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: Full Service }
 *               description: { type: string }
 *               basePrice: { type: number, example: 15000 }
 *               estimatedDuration: { type: integer, description: Duration in minutes }
 *     responses:
 *       201:
 *         description: Service created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /services/{id}:
 *   get:
 *     tags:
 *       - Services Catalog
 *     summary: Get service by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Service details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   put:
 *     tags:
 *       - Services Catalog
 *     summary: Update a service
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
 *               basePrice: { type: number }
 *               estimatedDuration: { type: integer }
 *     responses:
 *       200:
 *         description: Service updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   delete:
 *     tags:
 *       - Services Catalog
 *     summary: Delete a service
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Service deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
router.get('/', requirePermission(PERMISSIONS.SERVICES_READ), controller.listServices);
router.get('/:id', requirePermission(PERMISSIONS.SERVICES_READ), validateRequest(serviceIdParamSchema), controller.getService);
router.post('/', requirePermission(PERMISSIONS.SERVICES_CREATE), validateRequest(createServiceSchema), controller.createService);
router.put('/:id', requirePermission(PERMISSIONS.SERVICES_UPDATE), validateRequest(updateServiceSchema), controller.updateService);
router.delete('/:id', requirePermission(PERMISSIONS.SERVICES_DELETE), validateRequest(serviceIdParamSchema), controller.deleteService);

export default router;

