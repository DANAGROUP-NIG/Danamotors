import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { PartSaleController } from "./partSale.controller";
import {
  cancelSchema,
  createCounterSaleSchema,
  createOrderSchema,
  createReturnSchema,
  customerSearchSchema,
  idParamSchema,
  listCounterSalesSchema,
  listOrdersSchema,
  partSearchSchema,
  pickOrderSchema,
} from "./partSale.validation";

const router = Router();
const controller = new PartSaleController();

router.use(authMiddleware);

const read = requirePermission(PERMISSIONS.PART_SALE_READ);
const order = requirePermission(PERMISSIONS.PART_SALE_ORDER);
const bill = requirePermission(PERMISSIONS.PART_SALE_BILL);
const returns = requirePermission(PERMISSIONS.PART_SALE_RETURN);

/**
 * @openapi
 * tags:
 *   - name: Part Sale
 *     description: |
 *       CPD part sale (legacy Customer Purchase Order, Pick List, Counter Sale and Counter Sale Return).
 *
 *       1. Create a CPO for a customer. Rates come from the Part Master retail rate. `pick: true` reserves free stock at once.
 *       2. Pick (or release) stock against the CPO at any time.
 *       3. Bill one or more CPO lines of the same customer: the counter sale is an Invoice with no job card, so receipts,
 *          outstanding and party ledgers include it. Picked units are issued first, then free stock.
 *          Total = gross - cash discount + 7.5% VAT on taxable parts, rounded down to the nearest 10 naira.
 *       4. Record returns against a bill: stock comes back and a credit note is set off against the bill.
 *
 * /part-sale/customers:
 *   get:
 *     tags: [Part Sale]
 *     summary: Search parties to sell to, with their current outstanding
 *     parameters: [{ in: query, name: search, required: true, schema: { type: string } }]
 *     responses: { 200: { description: Up to 15 customers } }
 * /part-sale/parts:
 *   get:
 *     tags: [Part Sale]
 *     summary: Search parts with free stock at the selling branch and the retail rate
 *     parameters:
 *       - { in: query, name: search, required: true, schema: { type: string } }
 *       - { in: query, name: branchId, required: true, schema: { type: string, format: uuid } }
 *     responses: { 200: { description: Matching active parts } }
 * /part-sale/orders:
 *   get:
 *     tags: [Part Sale]
 *     summary: List customer purchase orders
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [OPEN, PARTLY_BILLED, BILLED, CANCELLED] } }
 *       - { in: query, name: customerId, schema: { type: string, format: uuid } }
 *       - { in: query, name: billable, schema: { type: boolean }, description: Only orders that can still be billed }
 *       - { in: query, name: search, schema: { type: string } }
 *     responses: { 200: { description: Orders } }
 *   post:
 *     tags: [Part Sale]
 *     summary: Create a customer purchase order
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             branchId: 9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d
 *             customerId: 1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e
 *             customerRefNo: "MAIL ORDER DT 15.04.2026"
 *             pick: true
 *             lines: [{ partId: 2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f, quantity: 2 }]
 *     responses: { 201: { description: CPO created (and picked when asked) } }
 * /part-sale/orders/{id}:
 *   get:
 *     tags: [Part Sale]
 *     summary: Get a CPO with free stock per line and the bills raised against it
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: CPO } }
 * /part-sale/orders/{id}/pick:
 *   patch:
 *     tags: [Part Sale]
 *     summary: Reserve stock for the CPO
 *     description: With no body, picks as much of every open line as free stock allows. Send lines to pick exact quantities.
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Units picked and units short } }
 * /part-sale/orders/{id}/release:
 *   patch:
 *     tags: [Part Sale]
 *     summary: Release everything picked on the CPO back to free stock
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: CPO } }
 * /part-sale/orders/{id}/cancel:
 *   patch:
 *     tags: [Part Sale]
 *     summary: Cancel what is left on a CPO (billed lines stay billed)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody: { content: { application/json: { example: { remark: Customer bought elsewhere } } } }
 *     responses: { 200: { description: CPO } }
 * /part-sale/counter-sales:
 *   get:
 *     tags: [Part Sale]
 *     summary: List counter-sale bills
 *     responses: { 200: { description: Counter sales } }
 *   post:
 *     tags: [Part Sale]
 *     summary: Bill CPO lines as a counter sale
 *     description: Give the cash discount as `cashDiscountPercent` or as `cashDiscountAmount` (a negotiated price), not both.
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             branchId: 9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d
 *             customerId: 1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e
 *             cashDiscountPercent: 22.5
 *             transportMode: ROAD
 *             lines: [{ orderLineId: 3d4e5f6a-7b8c-4d9e-0f1a-2b3c4d5e6f7a, quantity: 2 }]
 *     responses:
 *       201: { description: Counter sale and its invoice }
 *       409: { description: Stock or the CPO changed meanwhile }
 * /part-sale/counter-sales/{id}:
 *   get:
 *     tags: [Part Sale]
 *     summary: Get a counter sale with its bill lines and returns
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Counter sale } }
 * /part-sale/counter-sales/{id}/cancel:
 *   patch:
 *     tags: [Part Sale]
 *     summary: Cancel a bill with no receipts, returns or Tally posting
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Counter sale } }
 * /part-sale/counter-sales/{id}/returns:
 *   post:
 *     tags: [Part Sale]
 *     summary: Record a sale return against a bill
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { reason: Wrong part supplied, lines: [{ invoiceLineId: 4e5f6a7b-8c9d-4e0f-1a2b-3c4d5e6f7a8b, quantity: 1 }] }
 *     responses: { 201: { description: Counter sale with the new return } }
 * /part-sale/returns:
 *   get:
 *     tags: [Part Sale]
 *     summary: List sale returns
 *     responses: { 200: { description: Returns } }
 */
router.get("/customers", read, validateRequest(customerSearchSchema), controller.searchCustomers);
router.get("/parts", read, validateRequest(partSearchSchema), controller.searchParts);

router.get("/orders", read, validateRequest(listOrdersSchema), controller.listOrders);
router.post("/orders", order, validateRequest(createOrderSchema), controller.createOrder);
router.get("/orders/:id", read, validateRequest(idParamSchema), controller.getOrder);
router.patch("/orders/:id/pick", order, validateRequest(pickOrderSchema), controller.pickOrder);
router.patch("/orders/:id/release", order, validateRequest(idParamSchema), controller.releaseOrder);
router.patch("/orders/:id/cancel", order, validateRequest(cancelSchema), controller.cancelOrder);

router.get("/counter-sales", read, validateRequest(listCounterSalesSchema), controller.listCounterSales);
router.post("/counter-sales", bill, validateRequest(createCounterSaleSchema), controller.createCounterSale);
router.get("/counter-sales/:id", read, validateRequest(idParamSchema), controller.getCounterSale);
router.patch("/counter-sales/:id/cancel", bill, validateRequest(cancelSchema), controller.cancelCounterSale);
router.post("/counter-sales/:id/returns", returns, validateRequest(createReturnSchema), controller.createReturn);

router.get("/returns", read, controller.listReturns);

export default router;
