import { Router } from "express";
import { CreditController } from "./credit.controller";
import { validateRequest } from "../../middleware/requestValidator";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { PERMISSIONS } from "../../shared/constants/roles";
import {
  customerIdParamSchema,
  applicationIdParamSchema,
  adjustCreditSchema,
  createCreditApplicationSchema,
  listApplicationsQuerySchema,
} from "./credit.validation";

const router = Router();
const controller = new CreditController();

router.use(authMiddleware);

/**
 * @openapi
 * /credit/applications:
 *   get:
 *     tags:
 *       - Credit
 *     summary: List credit applications
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, APPROVED, REJECTED, ACTIVE, CLOSED] }
 *       - in: query
 *         name: customerId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated credit applications list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   post:
 *     tags:
 *       - Credit
 *     summary: Create a credit application
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, requestedLimit]
 *             properties:
 *               customerId: { type: string }
 *               requestedLimit: { type: number, example: 200000 }
 *               purpose: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Credit application created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /credit/applications/{id}:
 *   get:
 *     tags:
 *       - Credit
 *     summary: Get credit application by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Credit application details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /credit/customers/{customerId}/credit:
 *   get:
 *     tags:
 *       - Credit
 *     summary: Get customer's current credit account
 *     description: Returns the customer's credit limit, balance, and aging analysis.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Customer credit account details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     creditLimit: { type: number }
 *                     usedCredit: { type: number }
 *                     availableCredit: { type: number }
 *                     overdueAmount: { type: number }
 *       404:
 *         description: No credit account found for this customer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     tags:
 *       - Credit
 *     summary: Adjust customer credit account
 *     description: Update the credit limit or record a credit adjustment for a customer.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, amount]
 *             properties:
 *               type: { type: string, enum: [INCREASE_LIMIT, DECREASE_LIMIT, CREDIT, DEBIT] }
 *               amount: { type: number, example: 50000 }
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Credit adjusted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
router.get(
  "/applications",
  requirePermission(PERMISSIONS.FINANCE_READ),
  validateRequest(listApplicationsQuerySchema),
  controller.listApplications,
);
router.get(
  "/applications/:id",
  requirePermission(PERMISSIONS.FINANCE_READ),
  validateRequest(applicationIdParamSchema),
  controller.getApplication,
);
router.post(
  "/applications",
  requirePermission(PERMISSIONS.FINANCE_CREATE),
  validateRequest(createCreditApplicationSchema),
  controller.createApplication,
);

router.get(
  "/customers/:customerId/credit",
  requirePermission(PERMISSIONS.FINANCE_READ),
  validateRequest(customerIdParamSchema),
  controller.getCustomerCredit,
);
router.post(
  "/customers/:customerId/credit",
  requirePermission(PERMISSIONS.FINANCE_CREATE),
  validateRequest(adjustCreditSchema),
  controller.adjustCredit,
);

export default router;

