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

/**
 * @openapi
 * /customers:
 *   get:
 *     tags:
 *       - Customers
 *     summary: List all customers
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
 *         description: Search by name, email, or phone
 *     responses:
 *       200:
 *         description: Paginated customer list
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
 *                         customers:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/CustomerDTO'
 *                         meta:
 *                           $ref: '#/components/schemas/PaginationMeta'
 *   post:
 *     tags:
 *       - Customers
 *     summary: Create a new customer
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName]
 *             properties:
 *               firstName: { type: string, example: Adaeze }
 *               lastName: { type: string, example: Okafor }
 *               email: { type: string, format: email }
 *               phoneNumber: { type: string, example: "+2348012345678" }
 *               address: { type: string }
 *               branchId: { type: string }
 *     responses:
 *       201:
 *         description: Customer created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/CustomerDTO'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *
 * /customers/{id}:
 *   get:
 *     tags:
 *       - Customers
 *     summary: Get customer by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Customer details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/CustomerDTO'
 *       404:
 *         description: Customer not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   put:
 *     tags:
 *       - Customers
 *     summary: Update customer
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
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               phoneNumber: { type: string }
 *               address: { type: string }
 *     responses:
 *       200:
 *         description: Customer updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/CustomerDTO'
 *
 * /customers/{id}/documents:
 *   post:
 *     tags:
 *       - Customers
 *     summary: Upload a customer document
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
 *             required: [documentType, url]
 *             properties:
 *               documentType: { type: string, example: NATIONAL_ID }
 *               url: { type: string, format: uri }
 *     responses:
 *       201:
 *         description: Document added
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   get:
 *     tags:
 *       - Customers
 *     summary: List customer documents
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Customer documents list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /customers/{id}/service-history:
 *   post:
 *     tags:
 *       - Customers
 *     summary: Add a service history record
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
 *             required: [description]
 *             properties:
 *               description: { type: string }
 *               date: { type: string, format: date }
 *     responses:
 *       201:
 *         description: History record added
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   get:
 *     tags:
 *       - Customers
 *     summary: Get customer service history
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Service history records
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /customers/{id}/account:
 *   post:
 *     tags:
 *       - Customers
 *     summary: Manage customer account (activate/deactivate portal access)
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
 *             required: [action]
 *             properties:
 *               action: { type: string, enum: [ACTIVATE, DEACTIVATE] }
 *     responses:
 *       200:
 *         description: Account status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
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

