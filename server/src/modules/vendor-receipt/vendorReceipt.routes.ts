import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { VendorReceiptController } from "./vendorReceipt.controller";
import {
  createVendorReceiptSchema,
  idParamSchema,
  listVendorReceiptsSchema,
  receiptPartSearchSchema,
  vendorSearchSchema,
} from "./vendorReceipt.validation";

const router = Router();
const controller = new VendorReceiptController();

router.use("/vendor-receipts", authMiddleware);

const read = requirePermission(PERMISSIONS.STOCK_READ);
const write = requirePermission(PERMISSIONS.STOCK_UPDATE);

/**
 * @openapi
 * tags:
 *   - name: Vendor Receipts
 *     description: |
 *       Receiving parts bought from a vendor other than Mobis: local, second-hand/used and repaired parts at the
 *       branches, and CPD's direct non-Mobis purchases. Each receipt is an MRN (source VENDOR) for one vendor
 *       invoice. Posting adds the stock to the branch, sets each part record's dealer rate to the received cost and
 *       recalculates its retail rate from its price category. Mobis invoices go through Mobis receipts (MIT upload).
 *       Discounts, handling, tax and other charges are not recorded (zero on every legacy MRN since 2024).
 *
 * /inventory/vendor-receipts/vendors:
 *   get:
 *     tags: [Vendor Receipts]
 *     summary: Search vendors (parties of type VENDOR)
 *     parameters:
 *       - { in: query, name: search, description: Name or code, schema: { type: string } }
 *     responses:
 *       200: { description: "Up to 20 vendors: id, code, name" }
 * /inventory/vendor-receipts/parts:
 *   get:
 *     tags: [Vendor Receipts]
 *     summary: Search part records to receive, with stock and bin at the branch
 *     description: Active parts by part number or name; source records also match their main part number.
 *     parameters:
 *       - { in: query, name: branchId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: search, required: true, schema: { type: string, minLength: 2 } }
 *     responses:
 *       200: { description: Matching part records with partFlag, sourceLabel, main part, stock and bin }
 * /inventory/vendor-receipts:
 *   post:
 *     tags: [Vendor Receipts]
 *     summary: Post a vendor receipt (MRN)
 *     description: |
 *       Posts the stock once. Each part record appears once; quantities are whole numbers and unit costs are above
 *       zero. The same vendor invoice cannot be received twice.
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             receivingBranchId: 9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d
 *             vendorId: 3f2e1d0c-9b8a-4c7d-8e6f-5a4b3c2d1e0f
 *             invoiceNumber: INV-2231
 *             invoiceDate: 2026-10-16
 *             lines:
 *               - { partId: 4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f8a, quantity: 2, unitCost: 8000 }
 *     responses:
 *       201: { description: MRN posted, with lines, source labels and bins for labels }
 *       400: { description: Not a vendor, Mobis vendor, blocked part or invalid lines }
 *       409: { description: Invoice already received from this vendor }
 *   get:
 *     tags: [Vendor Receipts]
 *     summary: List vendor receipts
 *     parameters:
 *       - { in: query, name: search, description: MRN, invoice, vendor or part number, schema: { type: string } }
 *     responses: { 200: { description: Vendor MRNs } }
 * /inventory/vendor-receipts/{id}:
 *   get:
 *     tags: [Vendor Receipts]
 *     summary: Get a vendor receipt with its lines
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Vendor MRN } }
 */
router.get("/vendor-receipts/vendors", read, validateRequest(vendorSearchSchema), controller.searchVendors);
router.get("/vendor-receipts/parts", read, validateRequest(receiptPartSearchSchema), controller.searchParts);
router.post("/vendor-receipts", write, validateRequest(createVendorReceiptSchema), controller.createReceipt);
router.get("/vendor-receipts", read, validateRequest(listVendorReceiptsSchema), controller.listReceipts);
router.get("/vendor-receipts/:id", read, validateRequest(idParamSchema), controller.getReceipt);

export default router;
