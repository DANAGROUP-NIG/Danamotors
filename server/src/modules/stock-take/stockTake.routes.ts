import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { StockTakeController } from "./stockTake.controller";
import {
  branchQuerySchema,
  cancelSheetSchema,
  completeSchema,
  correctLineSchema,
  createSheetSchema,
  createStockTakeSchema,
  idParamSchema,
  listLinesSchema,
  listStockTakesSchema,
  notRequiredSchema,
  partSearchSchema,
  previewSchema,
  recordCountsSchema,
  remarkSchema,
  sheetParamSchema,
  updateBinsSchema,
  uploadSheetSchema,
} from "./stockTake.validation";

const router = Router();
const controller = new StockTakeController();

router.use(authMiddleware);

const read = requirePermission(PERMISSIONS.STOCK_TAKE_READ);
const manage = requirePermission(PERMISSIONS.STOCK_TAKE_MANAGE);
const confirm = requirePermission(PERMISSIONS.STOCK_TAKE_CONFIRM);

/**
 * @openapi
 * tags:
 *   - name: Stock Taking
 *     description: |
 *       Physical stock taking (legacy Batch Creation, Physical Stock Download/Upload, S/E Confirmation and Bin Location Updation).
 *
 *       1. Create a batch of parts at a branch, annual or perpetual. While an annual batch is active its parts' stock cannot move.
 *       2. Issue count sheets to checkers (legacy HHDC downloads) and upload their counts. The handheld posts to the same upload.
 *       3. Correct counts, set aside unknown part numbers, then complete the count.
 *       4. Confirm shortage and excess: each part's discrepancy is posted as a stock ADJUSTMENT.
 *       5. Update the branch bin locations from where parts were found.
 *
 * /stock-takes/parts:
 *   get:
 *     tags: [Stock Taking]
 *     summary: Search parts to add to a count, with stock at the branch
 *     parameters:
 *       - { in: query, name: search, required: true, schema: { type: string } }
 *       - { in: query, name: branchId, required: true, schema: { type: string, format: uuid } }
 *     responses: { 200: { description: Matching active parts } }
 * /stock-takes/checkers:
 *   get:
 *     tags: [Stock Taking]
 *     summary: Active staff at the branch who can be given a count sheet
 *     parameters: [{ in: query, name: branchId, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Checkers } }
 * /stock-takes/preview:
 *   post:
 *     tags: [Stock Taking]
 *     summary: Load the parts a batch would take (legacy Load Parts)
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             branchId: 9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d
 *             selection: { basis: BIN, from: N-3A1, to: N-3Z9, onlyWithStock: true }
 *     responses: { 200: { description: Parts, flagged when already in another open count } }
 * /stock-takes:
 *   get:
 *     tags: [Stock Taking]
 *     summary: List stock takings
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [ACTIVE, COMPLETED, CONFIRMED, CANCELLED] } }
 *       - { in: query, name: type, schema: { type: string, enum: [ANNUAL, PERPETUAL] } }
 *       - { in: query, name: search, schema: { type: string } }
 *     responses: { 200: { description: Stock takings } }
 *   post:
 *     tags: [Stock Taking]
 *     summary: Create a stock taking batch
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             branchId: 9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d
 *             type: PERPETUAL
 *             selection: { topConsumed: { count: 100, months: 3, includeStn: true } }
 *     responses:
 *       201: { description: Batch created }
 *       409: { description: An annual count is already open at the branch }
 * /stock-takes/{id}:
 *   get:
 *     tags: [Stock Taking]
 *     summary: Get a stock taking with its sheets and shortage / excess totals
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Stock taking } }
 * /stock-takes/{id}/lines:
 *   get:
 *     tags: [Stock Taking]
 *     summary: Parts in the count, a page at a time
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: filter, schema: { type: string, enum: [ALL, UNCOUNTED, DISCREPANCY, DAMAGED, UNKNOWN] } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *     responses: { 200: { description: Lines and total } }
 * /stock-takes/{id}/movements:
 *   get:
 *     tags: [Stock Taking]
 *     summary: Stock movements of the count's parts since the batch was created
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Movements } }
 * /stock-takes/{id}/cancel:
 *   patch:
 *     tags: [Stock Taking]
 *     summary: Cancel a count that has not adjusted stock
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody: { content: { application/json: { example: { remark: To give room for annual stock taking } } } }
 *     responses: { 200: { description: Stock taking } }
 * /stock-takes/{id}/sheets:
 *   post:
 *     tags: [Stock Taking]
 *     summary: Issue a count sheet to a checker (legacy HHDC download)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { checkerId: 1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e, basis: BIN, from: N-3A1, to: N-3B9, showSystemStock: false }
 *     responses: { 201: { description: Sheet with its parts } }
 * /stock-takes/{id}/sheets/{sheetId}:
 *   get:
 *     tags: [Stock Taking]
 *     summary: Get a count sheet with its parts
 *     responses: { 200: { description: Sheet } }
 * /stock-takes/{id}/sheets/{sheetId}/upload:
 *   post:
 *     tags: [Stock Taking]
 *     summary: Upload a sheet's counts (from the web sheet now, from the handheld later)
 *     description: One entry per part per bin; counts of the same part add up. Blank parts are counted as none (ZERO) or released for another sheet (RELEASE).
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             uncounted: RELEASE
 *             entries:
 *               - { partNumber: 1864421058N, binLocation: QSB, quantity: 18 }
 *               - { partNumber: 1864421058N, binLocation: N-3D3, quantity: 2, damagedQuantity: 1, remarks: Box torn }
 *     responses: { 200: { description: Stock taking } }
 * /stock-takes/{id}/sheets/{sheetId}/cancel:
 *   patch:
 *     tags: [Stock Taking]
 *     summary: Cancel a sheet; its parts go back to the pool
 *     responses: { 200: { description: Stock taking } }
 * /stock-takes/{id}/counts:
 *   post:
 *     tags: [Stock Taking]
 *     summary: Record counts without a sheet (legacy manual entry)
 *     responses: { 201: { description: Stock taking } }
 * /stock-takes/{id}/lines/{lineId}:
 *   patch:
 *     tags: [Stock Taking]
 *     summary: Correct a part's counted and damaged quantity (logged)
 *     requestBody: { content: { application/json: { example: { countedQuantity: 20, damagedQuantity: 0, remarks: Recounted } } } }
 *     responses: { 200: { description: Stock taking } }
 * /stock-takes/{id}/lines/{lineId}/not-required:
 *   patch:
 *     tags: [Stock Taking]
 *     summary: Set aside a counted part number that is not in Part Master
 *     responses: { 200: { description: Stock taking } }
 * /stock-takes/{id}/complete:
 *   patch:
 *     tags: [Stock Taking]
 *     summary: Close counting
 *     description: Needs every sheet uploaded and unknown part numbers resolved. Parts nobody counted are taken as none (ZERO) or removed (REMOVE).
 *     requestBody: { content: { application/json: { example: { uncounted: ZERO } } } }
 *     responses: { 200: { description: Stock taking } }
 * /stock-takes/{id}/confirm:
 *   patch:
 *     tags: [Stock Taking]
 *     summary: Confirm shortage and excess (legacy S/E Confirmation); posts the stock adjustments
 *     responses:
 *       200: { description: Stock taking }
 *       409: { description: Stock moved since counting and would go below zero or below reserved stock }
 * /stock-takes/{id}/bins:
 *   get:
 *     tags: [Stock Taking]
 *     summary: Parts found in a bin other than the one on record
 *     responses: { 200: { description: Proposed bin changes } }
 *   patch:
 *     tags: [Stock Taking]
 *     summary: Update the branch bin locations (once per count)
 *     requestBody: { content: { application/json: { example: { lines: [{ lineId: 3d4e5f6a-7b8c-4d9e-0f1a-2b3c4d5e6f7a, binLocation: N-3D3 }] } } } }
 *     responses: { 200: { description: Bins updated } }
 */
router.get("/parts", read, validateRequest(partSearchSchema), controller.searchParts);
router.get("/checkers", read, validateRequest(branchQuerySchema), controller.listCheckers);
router.post("/preview", manage, validateRequest(previewSchema), controller.previewParts);

router.get("/", read, validateRequest(listStockTakesSchema), controller.listStockTakes);
router.post("/", manage, validateRequest(createStockTakeSchema), controller.createStockTake);
router.get("/:id", read, validateRequest(idParamSchema), controller.getStockTake);
router.get("/:id/lines", read, validateRequest(listLinesSchema), controller.listLines);
router.get("/:id/movements", read, validateRequest(idParamSchema), controller.listMovements);
router.patch("/:id/cancel", manage, validateRequest(remarkSchema), controller.cancelStockTake);

router.post("/:id/sheets", manage, validateRequest(createSheetSchema), controller.createSheet);
router.get("/:id/sheets/:sheetId", read, validateRequest(sheetParamSchema), controller.getSheet);
router.post("/:id/sheets/:sheetId/upload", manage, validateRequest(uploadSheetSchema), controller.uploadSheet);
router.patch("/:id/sheets/:sheetId/cancel", manage, validateRequest(cancelSheetSchema), controller.cancelSheet);

router.post("/:id/counts", manage, validateRequest(recordCountsSchema), controller.recordCounts);
router.patch("/:id/lines/:lineId", manage, validateRequest(correctLineSchema), controller.correctLine);
router.patch("/:id/lines/:lineId/not-required", manage, validateRequest(notRequiredSchema), controller.setNotRequired);

router.patch("/:id/complete", manage, validateRequest(completeSchema), controller.completeStockTake);
router.patch("/:id/confirm", confirm, validateRequest(idParamSchema), controller.confirmStockTake);
router.get("/:id/bins", read, validateRequest(idParamSchema), controller.binProposals);
router.patch("/:id/bins", manage, validateRequest(updateBinsSchema), controller.updateBins);

export default router;
