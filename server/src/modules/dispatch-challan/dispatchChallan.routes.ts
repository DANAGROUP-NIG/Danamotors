import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { DispatchChallanController } from "./dispatchChallan.controller";
import { createChallanSchema, createReturnSchema, idParamSchema, listSchema } from "./dispatchChallan.validation";
import { customerSearchSchema, partSearchSchema } from "../part-sale/partSale.validation";

const router = Router();
const controller = new DispatchChallanController();

router.use(authMiddleware);

const read = requirePermission(PERMISSIONS.CHALLAN_READ);
const issue = requirePermission(PERMISSIONS.CHALLAN_ISSUE);
const returns = requirePermission(PERMISSIONS.CHALLAN_RETURN);

/**
 * @openapi
 * tags:
 *   - name: Dispatch Challans
 *     description: |
 *       Legacy Dispatch Challan and Dispatch Challan Return: unbilled issues of fuel and consumables
 *       to internal cost centres (a party, e.g. ALLEN 5 - OPEBI). The challan takes the stock out at
 *       retail rate with a gate pass; a return puts it back. Never billed.
 * /dispatch-challans:
 *   get:
 *     tags: [Dispatch Challans]
 *     summary: List challans (newest first)
 *     parameters:
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: customerId, schema: { type: string, format: uuid } }
 *       - { in: query, name: search, schema: { type: string }, description: Challan, gate pass, cost centre or part number }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *     responses: { 200: { description: Challans } }
 *   post:
 *     tags: [Dispatch Challans]
 *     summary: Issue a challan
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { branchId: 3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f, customerId: 9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d, remarks: Generator 350KVA, lines: [{ partId: 4e5f6a7b-8c9d-4e0f-1a2b-3c4d5e6f7a8b, quantity: 40 }] }
 *     responses: { 201: { description: The challan } }
 * /dispatch-challans/cost-centres:
 *   get:
 *     tags: [Dispatch Challans]
 *     summary: Search cost centres (parties) by code, name or phone
 *     parameters: [{ in: query, name: search, required: true, schema: { type: string } }]
 *     responses: { 200: { description: "{ customers }" } }
 * /dispatch-challans/parts:
 *   get:
 *     tags: [Dispatch Challans]
 *     summary: Search parts with free stock at the issuing branch and their retail rate
 *     parameters:
 *       - { in: query, name: search, required: true, schema: { type: string } }
 *       - { in: query, name: branchId, required: true, schema: { type: string, format: uuid } }
 *     responses: { 200: { description: "{ parts }" } }
 * /dispatch-challans/returns:
 *   get:
 *     tags: [Dispatch Challans]
 *     summary: List challan returns (same filters as challans)
 *     responses: { 200: { description: Returns } }
 * /dispatch-challans/{id}:
 *   get:
 *     tags: [Dispatch Challans]
 *     summary: One challan with its lines and returns
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: The challan } }
 * /dispatch-challans/{id}/returns:
 *   post:
 *     tags: [Dispatch Challans]
 *     summary: Record a challan return (chosen lines, or fullReturn for everything still out)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { reason: Not used, lines: [{ challanLineId: 4e5f6a7b-8c9d-4e0f-1a2b-3c4d5e6f7a8b, quantity: 5 }] }
 *     responses: { 201: { description: The challan with the new return } }
 */
router.get("/", read, validateRequest(listSchema), controller.list);
router.post("/", issue, validateRequest(createChallanSchema), controller.create);
router.get("/cost-centres", read, validateRequest(customerSearchSchema), controller.searchCostCentres);
router.get("/parts", read, validateRequest(partSearchSchema), controller.searchParts);
router.get("/returns", read, validateRequest(listSchema), controller.listReturns);
router.get("/:id", read, validateRequest(idParamSchema), controller.get);
router.post("/:id/returns", returns, validateRequest(createReturnSchema), controller.createReturn);

export default router;
