import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { WarrantyController } from "./warranty.controller";
import {
  addCaseLineSchema,
  caseIdSchema,
  caseLineParamsSchema,
  createCodeSchema,
  createModelSchema,
  listCasesSchema,
  listCodesSchema,
  listModelsSchema,
  openCaseSchema,
  searchPartsSchema,
  transitionCaseSchema,
  updateCaseLineSchema,
  updateCaseSchema,
  updateCodeSchema,
  updateModelSchema,
  updateVehicleWarrantySchema,
  vehicleWarrantyQuerySchema,
} from "./warranty.validation";

const controller = new WarrantyController();
const P = PERMISSIONS;

/**
 * @openapi
 * tags:
 *   - name: Warranty
 *     description: |
 *       Vehicle warranty coverage, warranty cases (claims to the manufacturer) and claim codes.
 *
 *       **Coverage is calculated, never typed in.** A vehicle is covered while
 *       `today <= saleDate + model.warrantyDays` **and** `mileage <= model.warrantyKm`
 *       (whichever comes first). Status is one of `ACTIVE`, `EXPIRED_DATE`, `EXPIRED_MILEAGE`,
 *       `NOT_COVERED` (model flagged not covered) or `UNKNOWN` (missing start date, mileage or policy).
 *
 *       Case lifecycle: `OPEN → IN_REVIEW → SUBMITTED → APPROVED | PARTIALLY_APPROVED | REJECTED | RETURNED`,
 *       `RETURNED → IN_REVIEW`, `APPROVED | PARTIALLY_APPROVED → SETTLED → CLOSED`, `REJECTED → CLOSED`.
 *       Unsubmitted cases can be closed (withdrawn) with a reason.
 *   - name: Vehicle Models
 *     description: Vehicle model master with the warranty policy (days, km, covered).
 * components:
 *   schemas:
 *     WarrantyCheck:
 *       type: object
 *       example:
 *         vehicle: { id: "5b1f…", vin: KNAPU81BDP7123456, registrationNumber: LSD-482-KJ, model: Sportage, lastRecordedMileage: 58210 }
 *         policy: { id: "9c2e…", code: KIA-SPG, name: Sportage, warrantyDays: 1825, warrantyKm: 100000, warrantyCovered: true }
 *         override: null
 *         coverage:
 *           status: ACTIVE
 *           reasons: []
 *           source: MODEL
 *           startDate: "2023-03-12"
 *           expiresOn: "2028-03-10"
 *           kmLimit: 100000
 *           mileage: 61580
 *           remainingDays: 527
 *           remainingKm: 38420
 *           daysUsedPercent: 71
 *           kmUsedPercent: 62
 *         reasonText: []
 *         openCampaigns:
 *           - { campaignId: "a1…", campaignVehicleId: "b2…", code: RC-2026-014, title: Engine wiring harness inspection, type: RECALL, vehicleStatus: PENDING }
 *         requiresAcknowledgement: true
 *         mileageWarning: null
 *     WarrantyCase:
 *       type: object
 *       example:
 *         id: "3f0c…"
 *         caseNumber: WTY2026000031
 *         status: SUBMITTED
 *         openedAutomatically: true
 *         jobCard: { id: "7d1a…", jobNumber: JC-2026-000418, createdAt: "2026-09-29T10:42:00Z" }
 *         vehicle: { vin: KNAPU81BDP7123456, model: Sportage, trim: EX, saleDate: "2023-03-12T00:00:00Z" }
 *         customer: { firstName: Chinedu, lastName: Okafor, phoneNumber: "08035552190" }
 *         mileage: 61580
 *         coverageStatus: ACTIVE
 *         complaintCode: { code: C104, description: Engine misfire }
 *         manufacturerClaimNo: KNG-WC-558213
 *         claimedAmount: 214300
 *         approvedAmount: null
 *         lines:
 *           - { seq: 1, kind: PART, role: CAUSAL, partNumber: 27301-2B010, description: Ignition coil assy, defectCode: { code: D07 }, positionCode: { code: P03 }, batchNo: B2208, quantity: 1, rate: 48500, approvalPercent: 100, claimedAmount: 48500, approvedAmount: null }
 *           - { seq: 2, kind: LABOUR, role: null, operationCode: 21110R0, description: Engine diagnosis, quantity: 1.5, rate: 15000, claimedAmount: 22500 }
 *         allowedActions: [APPROVE, PARTIALLY_APPROVE, REJECT, RETURN]
 *         editable: false
 *         progress:
 *           - { key: OPEN, label: Open, completed: true, at: "2026-09-29T10:45:00Z" }
 *           - { key: IN_REVIEW, label: In review, completed: true }
 *           - { key: SUBMITTED, label: Submitted, completed: true }
 *           - { key: DECISION, label: Decision, completed: false }
 *         statusHistory:
 *           - { fromStatus: IN_REVIEW, toStatus: SUBMITTED, remarks: "Submitted to Kia portal", actor: { firstName: Folake, lastName: Adebayo } }
 */

// ── /vehicles/:id/warranty ───────────────────────────────────────────────────

export const vehicleWarrantyRouter = Router();

/**
 * @openapi
 * /vehicles/{id}/warranty:
 *   get:
 *     tags: [Warranty]
 *     summary: Warranty coverage and open campaigns for a vehicle
 *     description: |
 *       The check the job card form and appointment check-in run before a job card is created.
 *       Pass today's odometer reading as `mileage` so the km limit is checked against it; without it the
 *       last recorded reading is used. `requiresAcknowledgement` is true when the vehicle is covered or has open campaigns.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: mileage, schema: { type: integer, example: 61580 } }
 *     responses:
 *       200:
 *         description: Coverage
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/WarrantyCheck' }
 *   put:
 *     tags: [Warranty]
 *     summary: Set a vehicle's model, warranty start date or override
 *     description: |
 *       Model and start date need `warranty:update`; `override` (extended warranty or goodwill) needs
 *       `warranty:settings`. Send `override: null` to remove it.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             vehicleModelId: "9c2e…"
 *             saleDate: "2023-03-12"
 *             override: { type: EXTENDED, until: "2030-03-12", km: 150000, reason: "Extended warranty certificate EW-2231" }
 *     responses:
 *       200: { description: Updated coverage, content: { application/json: { schema: { $ref: '#/components/schemas/WarrantyCheck' } } } }
 */
vehicleWarrantyRouter.get(
  "/:id/warranty",
  authMiddleware,
  requirePermission(P.WARRANTY_READ),
  validateRequest(vehicleWarrantyQuerySchema),
  controller.checkVehicle,
);
vehicleWarrantyRouter.put(
  "/:id/warranty",
  authMiddleware,
  requirePermission(P.VEHICLE_READ),
  validateRequest(updateVehicleWarrantySchema),
  controller.updateVehicleWarranty,
);

// ── /vehicle-models ──────────────────────────────────────────────────────────

export const vehicleModelRouter = Router();
vehicleModelRouter.use(authMiddleware);

/**
 * @openapi
 * /vehicle-models:
 *   get:
 *     tags: [Vehicle Models]
 *     summary: List vehicle models with their warranty policy
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: includeInactive, schema: { type: string, enum: ["true", "false"] } }
 *     responses:
 *       200:
 *         description: Models
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 models:
 *                   - { id: "9c2e…", code: KIA-SPG, make: Kia, name: Sportage, warrantyDays: 1825, warrantyKm: 100000, warrantyCovered: true, isActive: true, vehiclesLinked: 412 }
 *   post:
 *     tags: [Vehicle Models]
 *     summary: Create a vehicle model (warranty:settings)
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { code: KIA-SPG, make: Kia, name: Sportage, warrantyDays: 1825, warrantyKm: 100000, warrantyCovered: true }
 *     responses:
 *       201: { description: Created }
 *       409: { description: Code or name already exists }
 * /vehicle-models/{id}:
 *   put:
 *     tags: [Vehicle Models]
 *     summary: Update a model's warranty policy (warranty:settings)
 *     description: Coverage is recalculated on the next check. Existing job cards keep their snapshot.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { warrantyDays: 1095, warrantyKm: 60000 }
 *     responses:
 *       200: { description: Updated }
 */
vehicleModelRouter.get("/", requirePermission(P.VEHICLE_READ), validateRequest(listModelsSchema), controller.listModels);
vehicleModelRouter.post("/", requirePermission(P.WARRANTY_SETTINGS), validateRequest(createModelSchema), controller.createModel);
vehicleModelRouter.put("/:id", requirePermission(P.WARRANTY_SETTINGS), validateRequest(updateModelSchema), controller.updateModel);

// ── /warranty ────────────────────────────────────────────────────────────────

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /warranty/codes:
 *   get:
 *     tags: [Warranty]
 *     summary: Complaint, defect, position and reject-reason codes
 *     responses:
 *       200:
 *         description: All four lookups
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 complaint: [{ id: "…", code: C104, description: Engine misfire, isActive: true }]
 *                 defect: [{ id: "…", code: D07, description: Internal short, isActive: true }]
 *                 position: [{ id: "…", code: P03, description: Cylinder 3, isActive: true }]
 *                 reject: [{ id: "…", code: R02, description: Outside warranty period, isActive: true }]
 * /warranty/codes/{type}:
 *   post:
 *     tags: [Warranty]
 *     summary: Add a code (warranty:settings)
 *     parameters:
 *       - { in: path, name: type, required: true, schema: { type: string, enum: [complaint, defect, position, reject] } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { code: D07, description: Internal short }
 *     responses:
 *       201: { description: Created }
 * /warranty/codes/{type}/{id}:
 *   put:
 *     tags: [Warranty]
 *     summary: Edit or deactivate a code (warranty:settings)
 *     parameters:
 *       - { in: path, name: type, required: true, schema: { type: string, enum: [complaint, defect, position, reject] } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { isActive: false }
 *     responses:
 *       200: { description: Updated }
 */
router.get("/codes", requirePermission(P.WARRANTY_READ), validateRequest(listCodesSchema), controller.listCodes);
router.post("/codes/:type", requirePermission(P.WARRANTY_SETTINGS), validateRequest(createCodeSchema), controller.createCode);
router.put("/codes/:type/:id", requirePermission(P.WARRANTY_SETTINGS), validateRequest(updateCodeSchema), controller.updateCode);

/**
 * @openapi
 * /warranty/summary:
 *   get:
 *     tags: [Warranty]
 *     summary: KPI counts for the warranty case list
 *     responses:
 *       200:
 *         description: Counts within the caller's branch scope
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data: { open: 12, inReview: 7, submitted: 18, submittedClaimedAmount: 4200000, approvedLast30Days: 23, approvedLast30DaysAmount: 3600000, rejectedOrReturned: 4 }
 */
router.get("/summary", requirePermission(P.WARRANTY_READ), controller.summary);

/**
 * @openapi
 * /warranty/parts:
 *   get:
 *     tags: [Warranty]
 *     summary: Search parts for warranty claim lines
 *     description: Active parts by number, code or name, warranty-applicable first, with their warranty and retail rates.
 *     parameters:
 *       - { in: query, name: search, required: true, schema: { type: string, example: 27301 } }
 *       - { in: query, name: applicableOnly, schema: { type: string, enum: ["true", "false"] } }
 *     responses:
 *       200:
 *         description: Up to 20 parts
 *         content:
 *           application/json:
 *             example: { status: success, data: { parts: [{ id: "…", partNumber: 27301-2B010, name: Ignition coil assy, warrantyApplicable: true, warrantyRate: 48500, retailRate: 64300 }] } }
 */
router.get("/parts", requirePermission(P.WARRANTY_READ), validateRequest(searchPartsSchema), controller.searchParts);

/**
 * @openapi
 * /warranty/cases:
 *   get:
 *     tags: [Warranty]
 *     summary: List warranty cases
 *     description: Branch-assigned users see their branch; SuperAdmin and branchless (central) officers see all. Filters mirror the legacy Warranty Claim Control Register.
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [OPEN, IN_REVIEW, SUBMITTED, APPROVED, PARTIALLY_APPROVED, REJECTED, RETURNED, SETTLED, CLOSED] } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *       - { in: query, name: basedOn, schema: { type: string, enum: [CASE_DATE, BILL_DATE] } }
 *       - { in: query, name: claimNo, description: Whether the manufacturer claim number was generated, schema: { type: string, enum: [GENERATED, NOT_GENERATED] } }
 *       - { in: query, name: billing, schema: { type: string, enum: [BILLED, UNBILLED] } }
 *       - { in: query, name: search, description: Case, job card, claim number, VIN, plate or customer, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Page of cases
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 items: [{ id: "3f0c…", caseNumber: WTY2026000031, status: SUBMITTED, mileage: 61580, manufacturerClaimNo: KNG-WC-558213, claimedAmount: 214300, approvedAmount: null, jobCard: { jobNumber: JC-2026-000418 }, customer: { firstName: Chinedu, lastName: Okafor }, vehicle: { vin: KNAPU81BDP7123456, model: Sportage } }]
 *                 total: 42
 *                 page: 1
 *                 limit: 10
 *   post:
 *     tags: [Warranty]
 *     summary: Open a case manually for a job card (warranty:claim)
 *     description: Used when coverage was UNKNOWN at creation and the officer has verified it. One case per job card.
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { jobCardId: "7d1a…", complaint: "Engine warning light, rough idle when cold" }
 *     responses:
 *       201: { description: Opened, content: { application/json: { schema: { $ref: '#/components/schemas/WarrantyCase' } } } }
 *       409: { description: The job card already has a case }
 */
router.get("/cases", requirePermission(P.WARRANTY_READ), validateRequest(listCasesSchema), controller.listCases);
router.post("/cases", requirePermission(P.WARRANTY_CLAIM), validateRequest(openCaseSchema), controller.openCase);

/**
 * @openapi
 * /warranty/cases/{id}:
 *   get:
 *     tags: [Warranty]
 *     summary: Case detail with lines, progress stepper and status history
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Case, content: { application/json: { schema: { $ref: '#/components/schemas/WarrantyCase' } } } }
 *   patch:
 *     tags: [Warranty]
 *     summary: Edit the case header (warranty:update)
 *     description: The complaint can only change while the case is OPEN, IN_REVIEW or RETURNED. The manufacturer claim number can be set until the case is closed.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { complaintCodeId: "…", manufacturerClaimNo: KNG-WC-558213, manufacturerClaimDate: "2026-10-02" }
 *     responses:
 *       200: { description: Updated case }
 */
router.get("/cases/:id", requirePermission(P.WARRANTY_READ), validateRequest(caseIdSchema), controller.getCase);
router.patch("/cases/:id", requirePermission(P.WARRANTY_UPDATE), validateRequest(updateCaseSchema), controller.updateCase);

/**
 * @openapi
 * /warranty/cases/{id}/status:
 *   patch:
 *     tags: [Warranty]
 *     summary: Move a case through the claim workflow (warranty:claim)
 *     description: |
 *       Validated server-side with a row lock, so concurrent updates cannot double-apply (409 on conflict).
 *       - `SUBMIT` needs at least one line, a causal part, a defect code on every part line and a complaint.
 *       - `PARTIALLY_APPROVE` takes `lineApprovals` (percent per line); at least one below 100%.
 *       - `REJECT` needs `rejectReasonId`. `RETURN` needs `remarks`. `SETTLE` needs `settlementRef`.
 *       - `CLOSE` on an unsubmitted case withdraws it and needs `remarks`.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           examples:
 *             partial:
 *               value: { action: PARTIALLY_APPROVE, decisionAt: "2026-10-09", remarks: "Catalytic sensor approved at 60% — pre-existing wear.", lineApprovals: [{ lineId: "…", approvalPercent: 60 }] }
 *             reject:
 *               value: { action: REJECT, rejectReasonId: "…", remarks: "Outside warranty period" }
 *             submit:
 *               value: { action: SUBMIT, manufacturerClaimNo: KNG-WC-558213, remarks: "Submitted to Kia portal" }
 *     responses:
 *       200: { description: Updated case, content: { application/json: { schema: { $ref: '#/components/schemas/WarrantyCase' } } } }
 *       400: { description: Transition not allowed or a guard failed }
 *       409: { description: The case was changed by someone else }
 */
router.patch("/cases/:id/status", requirePermission(P.WARRANTY_CLAIM), validateRequest(transitionCaseSchema), controller.transition);

/**
 * @openapi
 * /warranty/cases/{id}/lines:
 *   post:
 *     tags: [Warranty]
 *     summary: Add a claim line (warranty:update)
 *     description: Part lines need a warranty-applicable part and a role (one CAUSAL part per case). Amounts are computed server-side.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           examples:
 *             part:
 *               value: { kind: PART, role: CAUSAL, sparePartId: "…", defectCodeId: "…", positionCodeId: "…", batchNo: B2208, quantity: 1 }
 *             labour:
 *               value: { kind: LABOUR, operationCode: 21110R0, description: Engine diagnosis, quantity: 1.5, rate: 15000 }
 *     responses:
 *       201: { description: Updated case }
 * /warranty/cases/{id}/lines/import-from-job-card:
 *   post:
 *     tags: [Warranty]
 *     summary: Copy the job card's WARRANTY lines onto the claim (warranty:update)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Import result
 *         content:
 *           application/json:
 *             example: { status: success, data: { imported: 3, skipped: ["26300-35505 is not warranty-applicable"], case: {} } }
 * /warranty/cases/{id}/lines/{lineId}:
 *   patch:
 *     tags: [Warranty]
 *     summary: Edit a claim line (warranty:update)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: lineId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { defectCodeId: "…", batchNo: B2210, quantity: 4 }
 *     responses:
 *       200: { description: Updated case }
 *   delete:
 *     tags: [Warranty]
 *     summary: Remove a claim line (warranty:update)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: lineId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Updated case }
 */
router.post("/cases/:id/lines/import-from-job-card", requirePermission(P.WARRANTY_UPDATE), validateRequest(caseIdSchema), controller.importLines);
router.post("/cases/:id/lines", requirePermission(P.WARRANTY_UPDATE), validateRequest(addCaseLineSchema), controller.addLine);
router.patch("/cases/:id/lines/:lineId", requirePermission(P.WARRANTY_UPDATE), validateRequest(updateCaseLineSchema), controller.updateLine);
router.delete("/cases/:id/lines/:lineId", requirePermission(P.WARRANTY_UPDATE), validateRequest(caseLineParamsSchema), controller.deleteLine);

export default router;
