import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { validateRequest } from "../../middleware/requestValidator";
import { PartsReportController } from "./partsReport.controller";
import { partSearchSchema, runReportSchema } from "./partsReport.validation";

const router = Router();
const controller = new PartsReportController();

router.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Parts Reports
 *     description: |
 *       Legacy Parts module reports: counter sales (register, summary, tax datewise and annexure, returns,
 *       cancellations, revenue, sales executive wise), CPO register, purchase (MRN register, material in
 *       transit, checklist for receipts, MRN/SRN shortage), picking list, STN/SRN, store-wise STN, branch
 *       indent inward and outward, branch in transit, consumption, checklist for issues and SAN register; and the
 *       stock reports: stock ledger and summary (FIFO or dealer rate), current stock balance, zero balance,
 *       slow moving, ageing, negative stock, inventory to sales ratio, branch wise and bin location wise stock,
 *       parts blocked and item unavailability.
 *       Each report checks its own permission (part sale, transfer or stock read). Dates are Africa/Lagos
 *       calendar days; reports on a single date take it as `to`.
 *
 * /parts-reports:
 *   get:
 *     tags: [Parts Reports]
 *     summary: Reports the user may run, with their filters, options and columns
 *     responses: { 200: { description: Report catalogue } }
 * /parts-reports/{kind}:
 *   get:
 *     tags: [Parts Reports]
 *     summary: Run a report
 *     parameters:
 *       - { in: path, name: kind, required: true, schema: { type: string }, example: counter-sales }
 *       - { in: query, name: from, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: to, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid }, description: Cross-branch users only; others always get their own branch }
 *       - { in: query, name: customerId, schema: { type: string, format: uuid } }
 *       - { in: query, name: vendor, schema: { type: string }, description: Vendor on MITs and vendor MRNs, e.g. MOBIS }
 *       - { in: query, name: partId, schema: { type: string, format: uuid } }
 *       - { in: query, name: includeAlternates, schema: { type: boolean }, description: With partId, also its main part and alternates }
 *       - { in: query, name: partFlag, schema: { type: string }, description: Purchase source (legacy part flag) }
 *       - { in: query, name: priceCategory, schema: { type: string }, description: Part category (price category code) }
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, CANCELLED, EXECUTED] } }
 *       - { in: query, name: option, schema: { type: string }, description: "The report's own choice, e.g. STN or SRN, VENDOR or SUMMARY, ALL or PENDING, FIFO or DEALER" }
 *       - { in: query, name: onlyTransacted, schema: { type: boolean }, description: Stock ledger and summary - only parts moved in the period }
 *       - { in: query, name: days, schema: { type: integer, minimum: 1, maximum: 3650 }, description: Slow moving items - not issued for this many days (default 90) }
 *       - { in: query, name: ageLimits, schema: { type: string }, example: "365,730,1095,1460,1825", description: Ageing of stock - five increasing age limits in days }
 *     responses: { 200: { description: Columns, rows (up to 5000) and totals } }
 */
router.get("/", controller.catalog);
router.get("/lookups", controller.lookups);
router.get("/parts", validateRequest(partSearchSchema), controller.parts);
router.get("/:kind", validateRequest(runReportSchema), controller.run);

export default router;
