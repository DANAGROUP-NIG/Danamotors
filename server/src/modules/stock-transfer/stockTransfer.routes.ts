import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { StockTransferController } from "./stockTransfer.controller";
import {
  approveIndentSchema,
  cancelIndentSchema,
  createIndentSchema,
  dispatchIndentSchema,
  emptyQuerySchema,
  idParamSchema,
  listIndentsSchema,
  listMitsSchema,
  listPickingListsSchema,
  listStnsSchema,
  partLookupSchema,
  pickIndentSchema,
  receiveIndentSchema,
  rejectIndentSchema,
} from "./stockTransfer.validation";

const router = Router();
const controller = new StockTransferController();

router.use("/indents", authMiddleware);
router.use("/picking-lists", authMiddleware);
router.use("/stn", authMiddleware);
router.use("/cases", authMiddleware);
router.use("/packing-lists", authMiddleware);
router.use("/mit", authMiddleware);
router.use("/srn", authMiddleware);

const read = requirePermission(PERMISSIONS.TRANSFER_READ);

/**
 * @openapi
 * tags:
 *   - name: Stock Transfers
 *     description: |
 *       CPD / inter-branch stock transfer workflow (issue #62, Process A).
 *
 *       Four actions drive the whole flow. Every document in between is created by the system:
 *
 *       1. **Create indent** (requesting branch) → indent number, status SUBMITTED.
 *       2. **Approve** (supplying branch) → picking list, stock reserved, unavailable quantities on back order.
 *       3. **Dispatch** (supplying branch) → STN, cases, packing list, MIT; source stock deducted exactly once.
 *       4. **Receive** (requesting branch) → SRN; stock posted to the requesting branch. Supports partial,
 *          damaged and short receipts.
 *
 *       Document numbers use the legacy format `YYYY` + 6 digits, for example `2026000132`.
 *
 * components:
 *   schemas:
 *     IndentDetail:
 *       type: object
 *       description: Full indent with every linked document, per-line quantity summary and progress stepper.
 *       example:
 *         id: 8d7f0c55-5b0e-4c1e-9d0c-2f0f1b0c6a11
 *         indentNumber: "2026000132"
 *         status: IN_TRANSIT
 *         requestingBranch: { id: "b1c2...", name: "Kia Plaza" }
 *         sourceBranch: { id: "c3d4...", name: "Central Parts Department" }
 *         authorisedBy: SM
 *         lines:
 *           - id: "0f1e..."
 *             lineNumber: 1
 *             part: { partNumber: "2630035505", name: "FILTER ASSY-ENGINE OIL", uom: "UNIT" }
 *             partFlag: O
 *             urgentQuantity: 5
 *             stockQuantity: 0
 *             requestedQuantity: 5
 *             approvedQuantity: 5
 *             backOrderQuantity: 0
 *             unitRate: 9056.34
 *             amount: 45281.7
 *             currentStock: 52
 *             jobNumber: "000356"
 *             registrationNumber: AGL504HA
 *             vin: KNARH81EDM5094767
 *             vehicleModel: SOR
 *             summary: { requested: 5, approved: 5, rejected: 0, picked: 5, backOrder: 0, dispatched: 5, received: 0, damaged: 0, short: 0, inTransit: 5, suppliedWithAlternate: false }
 *         progress:
 *           - { key: SUBMITTED, label: Indent submitted, completed: true, at: "2026-09-24T09:00:00Z" }
 *           - { key: APPROVED, label: Approved, completed: true, at: "2026-09-24T10:00:00Z" }
 *           - { key: PICKED, label: Picked, completed: true }
 *           - { key: STN_CREATED, label: STN created, completed: true }
 *           - { key: PACKED, label: Cases packed, completed: true }
 *           - { key: DISPATCHED, label: Dispatched (in transit), completed: true }
 *           - { key: SRN_CREATED, label: SRN created, completed: false }
 *           - { key: RECEIVED, label: Received, completed: false }
 *         pickingList: { pickingNumber: "2026000045", status: COMPLETED }
 *         stn:
 *           stnNumber: "2026000105"
 *           status: DISPATCHED
 *           stockDeducted: true
 *           cases: [{ caseNumber: "2026000310", totalQuantity: 5 }]
 *           packingList: { packingNumber: "2026000090", waybillNumber: "WB-7781", dispatchMode: ROAD }
 *           mit: { mitNumber: "2026000077", sourceType: INTERNAL_TRANSFER, status: IN_TRANSIT }
 *           srns: []
 *         statusHistory:
 *           - { fromStatus: null, toStatus: DRAFT }
 *           - { fromStatus: DRAFT, toStatus: SUBMITTED }
 */

/**
 * @openapi
 * /inventory/indents/part-lookup:
 *   get:
 *     tags: [Stock Transfers]
 *     summary: Prefill data for an indent line
 *     description: Returns Part Master fields (description, UOM, rate, bin and store location), stock at both branches and active alternates with their stock at the supplying branch.
 *     parameters:
 *       - { in: query, name: partId, schema: { type: string, format: uuid } }
 *       - { in: query, name: partNumber, schema: { type: string, example: "96611P2700" } }
 *       - { in: query, name: requestingBranchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: sourceBranchId, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Part information
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 part: { partNumber: "2630035505", name: "FILTER ASSY-ENGINE OIL", uom: "UNIT", unitRate: 9056.34, binLocation: "A-12" }
 *                 requestingBranchStock: { quantity: 52, reserved: 0, available: 52 }
 *                 sourceBranchStock: { quantity: 300, reserved: 10, available: 290 }
 *                 alternates: [{ part: { partNumber: "2630035504" }, sourceBranchStock: { available: 12 } }]
 */
router.get("/indents/part-lookup", read, validateRequest(partLookupSchema), controller.lookupPart);

/**
 * @openapi
 * /inventory/indents:
 *   post:
 *     tags: [Stock Transfers]
 *     summary: Create a branch indent (transfer request)
 *     description: |
 *       Rate, current stock and amount are filled from Part Master and branch stock. When a line carries
 *       `jobCardId`, the job number, job date, VIN, registration and model are filled from the job card.
 *       The indent is submitted straight away unless `submit` is false.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             requestingBranchId: 3f1c1d2e-7a55-4a0b-9d2b-1f2e3d4c5b6a
 *             sourceBranchId: 9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d
 *             authorisedBy: SM
 *             remarks: Urgent vehicle order
 *             lines:
 *               - partId: 5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e
 *                 partFlag: O
 *                 urgentQuantity: 5
 *                 jobNumber: "000356"
 *                 jobDate: "2026-02-11"
 *                 vin: KNARH81EDM5094767
 *                 registrationNumber: AGL504HA
 *                 vehicleModel: SOR
 *               - partId: 6c7d8e9f-0a1b-4c2d-9e3f-4a5b6c7d8e9f
 *                 stockQuantity: 5
 *     responses:
 *       201:
 *         description: Indent created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: object, properties: { indent: { $ref: '#/components/schemas/IndentDetail' } } }
 *   get:
 *     tags: [Stock Transfers]
 *     summary: List indents
 *     description: Branch users see indents where their branch is the requester or the supplier.
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [DRAFT, SUBMITTED, APPROVED, PICKED, IN_TRANSIT, PARTIALLY_RECEIVED, COMPLETED, REJECTED, CANCELLED] } }
 *       - { in: query, name: requestingBranchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: sourceBranchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: search, description: Indent number, STN number, part number or registration, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: Paginated indents }
 */
router.post("/indents", requirePermission(PERMISSIONS.TRANSFER_CREATE), validateRequest(createIndentSchema), controller.createIndent);
router.get("/indents", read, validateRequest(listIndentsSchema), controller.listIndents);

/**
 * @openapi
 * /inventory/indents/{id}:
 *   get:
 *     tags: [Stock Transfers]
 *     summary: Get an indent with all its documents and progress
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200:
 *         description: Indent detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: object, properties: { indent: { $ref: '#/components/schemas/IndentDetail' } } }
 */
router.get("/indents/:id", read, validateRequest(idParamSchema), controller.getIndent);

/**
 * @openapi
 * /inventory/indents/{id}/submit:
 *   patch:
 *     tags: [Stock Transfers]
 *     summary: Submit a draft indent
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Indent submitted; the supplying branch and general store manager are notified }
 *       409: { description: Indent is not a draft }
 */
router.patch("/indents/:id/submit", requirePermission(PERMISSIONS.TRANSFER_CREATE), validateRequest(idParamSchema), controller.submitIndent);

/**
 * @openapi
 * /inventory/indents/{id}/approve:
 *   patch:
 *     tags: [Stock Transfers]
 *     summary: Approve an indent (picks and reserves stock automatically)
 *     description: |
 *       Approves every line in full unless `lines` says otherwise. The system then picks what the supplying
 *       branch has available, reserves it, and puts the rest on back order. The general store manager is
 *       notified about missing parts. Use `supplyPartId` to supply an alternate part; the requested part is kept
 *       for traceability.
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             remarks: Approved. Horn supplied with partner part.
 *             lines:
 *               - lineId: 0f1e2d3c-4b5a-4968-8776-655443322110
 *                 approvedQuantity: 4
 *               - lineId: 1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d
 *                 supplyPartId: 7d8e9f0a-1b2c-4d3e-8f4a-5b6c7d8e9f0a
 *     responses:
 *       200: { description: Indent approved. Status is PICKED, or APPROVED when nothing was available. }
 *       409: { description: Indent is not SUBMITTED }
 */
router.patch("/indents/:id/approve", requirePermission(PERMISSIONS.TRANSFER_APPROVE), validateRequest(approveIndentSchema), controller.approveIndent);

/**
 * @openapi
 * /inventory/indents/{id}/pick:
 *   patch:
 *     tags: [Stock Transfers]
 *     summary: Retry picking for an approved indent that had no stock
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { lines: [{ lineId: 0f1e2d3c-4b5a-4968-8776-655443322110, supplyPartId: 7d8e9f0a-1b2c-4d3e-8f4a-5b6c7d8e9f0a }] }
 *     responses:
 *       200: { description: Picking list created }
 *       409: { description: Still no stock, or already picked }
 */
router.patch("/indents/:id/pick", requirePermission(PERMISSIONS.TRANSFER_APPROVE), validateRequest(pickIndentSchema), controller.pickIndent);

/**
 * @openapi
 * /inventory/indents/{id}/reject:
 *   patch:
 *     tags: [Stock Transfers]
 *     summary: Reject a submitted indent
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { reason: Parts reserved for another branch }
 *     responses:
 *       200: { description: Indent rejected; the requester is notified }
 */
router.patch("/indents/:id/reject", requirePermission(PERMISSIONS.TRANSFER_REJECT), validateRequest(rejectIndentSchema), controller.rejectIndent);

/**
 * @openapi
 * /inventory/indents/{id}/cancel:
 *   patch:
 *     tags: [Stock Transfers]
 *     summary: Cancel an indent before dispatch
 *     description: Allowed from DRAFT, SUBMITTED, APPROVED or PICKED. Reserved stock is released.
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { reason: Vehicle left the workshop }
 *     responses:
 *       200: { description: Indent cancelled }
 */
router.patch("/indents/:id/cancel", requirePermission(PERMISSIONS.TRANSFER_CANCEL), validateRequest(cancelIndentSchema), controller.cancelIndent);

/**
 * @openapi
 * /inventory/indents/{id}/dispatch:
 *   patch:
 *     tags: [Stock Transfers]
 *     summary: Dispatch a picked indent in one step
 *     description: |
 *       Creates the STN, cases, packing list and internal MIT (`sourceType = INTERNAL_TRANSFER`), deducts
 *       source stock exactly once and releases the reservation. Every field is optional:
 *
 *       - Without `lines`, the full picked quantity ships. Use `lines` only to ship less; the difference goes to back order.
 *       - Without `cases`, everything is packed into one case. When given, the cases must hold exactly the dispatched quantities, and one case may hold any number of parts.
 *
 *       A second dispatch of the same indent returns 409 and changes nothing.
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             transportMode: ROAD
 *             taxForm: X
 *             waybillNumber: WB-7781
 *             courierName: GIG Logistics
 *             packerName: RAMANANDA
 *             cases:
 *               - weight: 12.5
 *                 lines:
 *                   - { pickingLineId: 2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e, quantity: 3 }
 *                   - { pickingLineId: 3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f, quantity: 5 }
 *               - weight: 4
 *                 lines:
 *                   - { pickingLineId: 2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e, quantity: 2 }
 *     responses:
 *       200:
 *         description: Dispatched. Status is IN_TRANSIT.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: object, properties: { indent: { $ref: '#/components/schemas/IndentDetail' } } }
 *       409: { description: Not in PICKED status (for example, already dispatched), or stock changed underneath }
 */
router.patch("/indents/:id/dispatch", requirePermission(PERMISSIONS.TRANSFER_DISPATCH), validateRequest(dispatchIndentSchema), controller.dispatchIndent);

/**
 * @openapi
 * /inventory/indents/{id}/receive:
 *   patch:
 *     tags: [Stock Transfers]
 *     summary: Receive a dispatched indent (creates an SRN)
 *     description: |
 *       With an empty body everything outstanding is received in good condition and the transfer closes.
 *       Send `lines` to record partial, damaged or missing quantities per MIT line. Good quantities are posted
 *       to the requesting branch as `TRANSFER_IN`; damaged quantities are recorded but not added to stock.
 *       With `closeShort: true`, anything still outstanding is recorded as short and the transfer closes.
 *       Otherwise the indent becomes PARTIALLY_RECEIVED and can be received again.
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             remarks: One filter crushed in transit
 *             closeShort: true
 *             lines:
 *               - { mitLineId: 4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f8a, receivedQuantity: 4, damagedQuantity: 1 }
 *     responses:
 *       200: { description: SRN created. Status is COMPLETED or PARTIALLY_RECEIVED. }
 *       400: { description: Quantities exceed what is outstanding }
 *       409: { description: Nothing in transit for this indent }
 */
router.patch("/indents/:id/receive", requirePermission(PERMISSIONS.TRANSFER_RECEIVE), validateRequest(receiveIndentSchema), controller.receiveIndent);

/**
 * @openapi
 * /inventory/picking-lists:
 *   get:
 *     tags: [Stock Transfers]
 *     summary: List picking lists
 *     parameters: [{ in: query, name: status, schema: { type: string, enum: [OPEN, COMPLETED, CANCELLED] } }]
 *     responses: { 200: { description: Picking lists } }
 * /inventory/picking-lists/{id}:
 *   get:
 *     tags: [Stock Transfers]
 *     summary: Get a picking list
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Picking list with requested and supplied parts } }
 * /inventory/stn:
 *   get:
 *     tags: [Stock Transfers]
 *     summary: List stock transfer notes
 *     parameters: [{ in: query, name: status, schema: { type: string, enum: [CREATED, DISPATCHED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED] } }]
 *     responses: { 200: { description: STNs } }
 * /inventory/stn/{id}:
 *   get:
 *     tags: [Stock Transfers]
 *     summary: Get an STN with lines, cases, packing list, MIT and SRNs
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: STN } }
 * /inventory/cases/{id}:
 *   get:
 *     tags: [Stock Transfers]
 *     summary: Get a case and its parts
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Case } }
 * /inventory/packing-lists/{id}:
 *   get:
 *     tags: [Stock Transfers]
 *     summary: Get a packing list with its cases
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Packing list } }
 * /inventory/mit:
 *   get:
 *     tags: [Stock Transfers]
 *     summary: List material in transit
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [IN_TRANSIT, VERIFIED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED] } }
 *       - { in: query, name: sourceType, schema: { type: string, enum: [INTERNAL_TRANSFER, EXTERNAL_VENDOR] } }
 *     responses: { 200: { description: MIT records } }
 * /inventory/mit/{id}:
 *   get:
 *     tags: [Stock Transfers]
 *     summary: Get an MIT with its lines and receipts
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: MIT } }
 * /inventory/srn:
 *   get:
 *     tags: [Stock Transfers]
 *     summary: List stock receipt notes
 *     responses: { 200: { description: SRNs } }
 * /inventory/srn/{id}:
 *   get:
 *     tags: [Stock Transfers]
 *     summary: Get an SRN with received, damaged and short quantities
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: SRN } }
 */
router.get("/picking-lists", read, validateRequest(listPickingListsSchema), controller.listPickingLists);
router.get("/picking-lists/:id", read, validateRequest(idParamSchema), controller.getPickingList);
router.get("/stn", read, validateRequest(listStnsSchema), controller.listStns);
router.get("/stn/:id", read, validateRequest(idParamSchema), controller.getStn);
router.get("/cases/:id", read, validateRequest(idParamSchema), controller.getCase);
router.get("/packing-lists/:id", read, validateRequest(idParamSchema), controller.getPackingList);
router.get("/mit", read, validateRequest(listMitsSchema), controller.listMits);
router.get("/mit/:id", read, validateRequest(idParamSchema), controller.getMit);
router.get("/srn", read, validateRequest(emptyQuerySchema), controller.listSrns);
router.get("/srn/:id", read, validateRequest(idParamSchema), controller.getSrn);

export default router;
