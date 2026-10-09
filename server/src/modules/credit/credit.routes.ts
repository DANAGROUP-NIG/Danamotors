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
 *             required: [customerId, invoiceId, amount]
 *             properties:
 *               customerId: { type: string }
 *               invoiceId: { type: string, format: uuid }
 *               amount: { type: number, example: 50000, description: Must not exceed the invoice outstanding or available customer credit }
 *               comments: { type: string }
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
 *     description: Returns the derived customer.creditBalance (active receipt advances plus unadjusted credit notes/opening credits) and historical compatibility transactions. This is not a separately editable wallet.
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
 *                     credit:
 *                       type: object
 *                       properties:
 *                         customer:
 *                           type: object
 *                           properties:
 *                             id: { type: string, format: uuid }
 *                             creditBalance: { type: number, readOnly: true }
 *                         transactions:
 *                           type: array
 *                           items: { type: object, description: Historical compatibility credit transaction }
 *       404:
 *         description: No credit account found for this customer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     tags:
 *       - Credit
 *     summary: Deprecated manual wallet adjustment (disabled)
 *     deprecated: true
 *     description: Credit is derived from receipts and notes. This endpoint returns 400 without financial writes; use receipt capture or an Admin opening balance.
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
 *       400:
 *         description: Manual wallet writes are disabled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
router.get(
  "/applications",
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validateRequest(listApplicationsQuerySchema),
  controller.listApplications,
);
router.get(
  "/applications/:id",
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validateRequest(applicationIdParamSchema),
  controller.getApplication,
);
router.post(
  "/applications",
  requirePermission(PERMISSIONS.CREDIT_APPLICATION_CREATE),
  validateRequest(createCreditApplicationSchema),
  controller.createApplication,
);

router.get(
  "/customers/:customerId/credit",
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validateRequest(customerIdParamSchema),
  controller.getCustomerCredit,
);
router.post(
  "/customers/:customerId/credit",
  requirePermission(PERMISSIONS.CREDIT_ADJUST),
  validateRequest(adjustCreditSchema),
  controller.adjustCredit,
);

export default router;

