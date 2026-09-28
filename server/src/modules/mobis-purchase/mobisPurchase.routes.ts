import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { MobisPurchaseController } from "./mobisPurchase.controller";
import {
  cancelMitSchema,
  createMrnSchema,
  idParamSchema,
  importMitSchema,
  listMobisMitsSchema,
  matchPartsSchema,
} from "./mobisPurchase.validation";

const router = Router();
const controller = new MobisPurchaseController();

router.use("/mobis", authMiddleware);
router.use("/mrn", authMiddleware);

const read = requirePermission(PERMISSIONS.STOCK_READ);
const write = requirePermission(PERMISSIONS.STOCK_UPDATE);

/**
 * @openapi
 * tags:
 *   - name: Mobis Purchase
 *     description: |
 *       Receiving parts bought from Mobis (issue #62, Process B). The Mobis invoice file in MIT format is the
 *       only file ever uploaded in the app; everything else is shared through the single database.
 *
 *       1. Upload the invoice file (parsed in the browser) → MIT with `sourceType = EXTERNAL_VENDOR`.
 *       2. Generate the MRN → accepted quantities are posted to the receiving branch (CPD) once.
 *
 * /inventory/mobis/mit/match-parts:
 *   post:
 *     tags: [Mobis Purchase]
 *     summary: Check which invoice part numbers exist in Part Master
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { partNumbers: ["84710Q6020WK", "66311Q6000"] }
 *     responses:
 *       200: { description: One entry per part number, with the matching part or null }
 * /inventory/mobis/mit:
 *   post:
 *     tags: [Mobis Purchase]
 *     summary: Import a Mobis invoice (MIT format)
 *     description: |
 *       Creates the MIT. Parts missing from Part Master are rejected unless `createMissingParts` is true, in which
 *       case they are created (part code = part number, dealer rate = unit price x conversion rate). The same
 *       invoice cannot be imported twice unless the earlier MIT was cancelled. Line amounts must equal qty x unit price.
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             destinationBranchId: 9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d
 *             invoiceNumber: A6EA0567A
 *             conversionRate: 2700
 *             receivedMode: AIR
 *             sourceFileName: A6EA0567A.xls
 *             createMissingParts: true
 *             lines:
 *               - { orderNumber: AV10K6Q01R, lineNumber: "0001", partNumber: 84710Q6020WK, partName: "CRASH PAD ASSY-MAIN", quantity: 1, unitPrice: 165.08, amount: 165.08, caseNumber: SPD2APE00210 }
 *               - { orderNumber: AV10K6Q01R, lineNumber: "0002", partNumber: 66311Q6000, partName: "PANEL-FENDER,LH", quantity: 1, unitPrice: 94.77, amount: 94.77, caseNumber: SPD2APE00210 }
 *     responses:
 *       201: { description: MIT created }
 *       400: { description: Invalid lines, or parts missing from Part Master }
 *       409: { description: Invoice already imported }
 *   get:
 *     tags: [Mobis Purchase]
 *     summary: List Mobis MITs
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [IN_TRANSIT, VERIFIED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED] } }
 *       - { in: query, name: search, description: MIT, invoice, Mobis order or part number, schema: { type: string } }
 *     responses:
 *       200: { description: MITs with their MRN }
 * /inventory/mobis/mit/{id}:
 *   get:
 *     tags: [Mobis Purchase]
 *     summary: Get a Mobis MIT with lines and MRN
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: MIT } }
 * /inventory/mobis/mit/{id}/mrn:
 *   post:
 *     tags: [Mobis Purchase]
 *     summary: Generate the MRN and post stock
 *     description: |
 *       With an empty body everything on the invoice is received in good condition. Send `lines` to record
 *       damaged quantities or quantities that did not arrive; anything not received or damaged is recorded as short.
 *       Tax form defaults to P. Stock is posted once: a second call returns 409.
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { taxForm: P, lines: [{ mitLineId: 4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f8a, receivedQuantity: 0, damagedQuantity: 1 }] }
 *     responses:
 *       201: { description: MRN posted }
 *       409: { description: MRN already exists, or MIT cancelled }
 * /inventory/mobis/mit/{id}/cancel:
 *   patch:
 *     tags: [Mobis Purchase]
 *     summary: Cancel an MIT before its MRN
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: MIT cancelled } }
 * /inventory/mrn:
 *   get:
 *     tags: [Mobis Purchase]
 *     summary: List material receipt notes
 *     responses: { 200: { description: MRNs } }
 * /inventory/mrn/{id}:
 *   get:
 *     tags: [Mobis Purchase]
 *     summary: Get an MRN
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: MRN with lines } }
 */
router.post("/mobis/mit/match-parts", read, validateRequest(matchPartsSchema), controller.matchParts);
router.post("/mobis/mit", write, validateRequest(importMitSchema), controller.importMit);
router.get("/mobis/mit", read, validateRequest(listMobisMitsSchema), controller.listMits);
router.get("/mobis/mit/:id", read, validateRequest(idParamSchema), controller.getMit);
router.post("/mobis/mit/:id/mrn", write, validateRequest(createMrnSchema), controller.createMrn);
router.patch("/mobis/mit/:id/cancel", write, validateRequest(cancelMitSchema), controller.cancelMit);
router.get("/mrn", read, controller.listMrns);
router.get("/mrn/:id", read, validateRequest(idParamSchema), controller.getMrn);

export default router;
