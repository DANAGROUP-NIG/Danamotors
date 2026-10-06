import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { CampaignController } from "./campaign.controller";
import {
  addContactSchema,
  addVehiclesSchema,
  bulkUpdateCampaignVehiclesSchema,
  campaignIdSchema,
  campaignVehicleParamsSchema,
  createCampaignSchema,
  listCampaignVehiclesSchema,
  listCampaignsSchema,
  scheduleSchema,
  updateCampaignSchema,
  updateCampaignVehicleSchema,
} from "./campaign.validation";

const router = Router();
const controller = new CampaignController();
const P = PERMISSIONS;

router.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Campaigns
 *     description: |
 *       Recall (`RECALL`), free fix (`FREE_FIX`) and service (`SERVICE_CAMPAIGN`) campaigns targeted by VIN.
 *
 *       Campaign status: `DRAFT → ACTIVE → CLOSED` (a draft can also be closed). Affected vehicles are kept
 *       by VIN, so manufacturer lists may include vehicles that are not in the system yet; they link
 *       automatically when the vehicle is registered.
 *
 *       Vehicle status: `PENDING → CONTACTED → SCHEDULED → COMPLETED`, or `NOT_REACHABLE` / `NOT_APPLICABLE`.
 *       Opening a job card for the vehicle marks it `SCHEDULED`; completing the job card marks it `COMPLETED`.
 * components:
 *   schemas:
 *     Campaign:
 *       type: object
 *       example:
 *         id: "a1…"
 *         code: RC-2026-014
 *         title: Engine wiring harness inspection
 *         type: RECALL
 *         status: ACTIVE
 *         startDate: "2026-08-01T00:00:00Z"
 *         endDate: "2026-12-31T00:00:00Z"
 *         labourCovered: true
 *         partsCovered: true
 *         models: [{ vehicleModel: { name: Sportage }, yearFrom: 2021, yearTo: 2023 }]
 *         coveredItems: [{ kind: PART, partNumber: 91200-D3XXX, description: Wiring harness, maxQuantity: 1 }]
 *         progress: { affected: 860, pending: 214, contacted: 188, scheduled: 46, completed: 412, notReachable: 0, notApplicable: 0, outstanding: 448, percentComplete: 47.9 }
 *         byBranch:
 *           - { branchId: "…", branchName: Main Branch, affected: 420, contacted: 98, scheduled: 20, completed: 210, outstanding: 92, percentComplete: 50 }
 *         unmatchedVins: 37
 *
 * /campaigns/summary:
 *   get:
 *     tags: [Campaigns]
 *     summary: KPIs across active campaigns
 *     responses:
 *       200:
 *         description: Counts
 *         content:
 *           application/json:
 *             example: { status: success, data: { activeCampaigns: 5, affected: 1284, completed: 612, outstanding: 672, percentComplete: 47.7 } }
 * /campaigns:
 *   get:
 *     tags: [Campaigns]
 *     summary: List campaigns with progress
 *     parameters:
 *       - { in: query, name: type, schema: { type: string, enum: [RECALL, FREE_FIX, SERVICE_CAMPAIGN] } }
 *       - { in: query, name: status, schema: { type: string, enum: [DRAFT, ACTIVE, CLOSED] } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200: { description: Page of campaigns }
 *   post:
 *     tags: [Campaigns]
 *     summary: Create a campaign (campaign:create)
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             code: RC-2026-014
 *             title: Engine wiring harness inspection
 *             type: RECALL
 *             defectDescription: The harness may chafe against nearby components.
 *             startDate: "2026-08-01"
 *             endDate: "2026-12-31"
 *             models: [{ vehicleModelId: "…", yearFrom: 2021, yearTo: 2023 }]
 *             coveredItems: [{ kind: PART, partNumber: 91200-D3xxx, description: Wiring harness, maxQuantity: 1 }, { kind: LABOUR, operationCode: HRN-01, description: Harness inspection, maxQuantity: 1.2 }]
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/Campaign' } } } }
 *       409: { description: Code already used }
 */
router.get("/summary", requirePermission(P.CAMPAIGN_READ), controller.summary);
router.get("/", requirePermission(P.CAMPAIGN_READ), validateRequest(listCampaignsSchema), controller.list);
router.post("/", requirePermission(P.CAMPAIGN_CREATE), validateRequest(createCampaignSchema), controller.create);

/**
 * @openapi
 * /campaigns/{id}:
 *   get:
 *     tags: [Campaigns]
 *     summary: Campaign with progress overall and by branch
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Campaign, content: { application/json: { schema: { $ref: '#/components/schemas/Campaign' } } } }
 *   put:
 *     tags: [Campaigns]
 *     summary: Edit a campaign (campaign:update)
 *     description: Closed campaigns cannot be edited; the type can only change in DRAFT. `models` and `coveredItems` replace the existing lists.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { endDate: "2027-03-31" }
 *     responses:
 *       200: { description: Updated }
 * /campaigns/{id}/activate:
 *   post:
 *     tags: [Campaigns]
 *     summary: Activate a draft campaign (campaign:update)
 *     description: Needs at least one affected vehicle. Notifies service advisers and reception managers at branches with affected vehicles.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Activated }
 * /campaigns/{id}/close:
 *   post:
 *     tags: [Campaigns]
 *     summary: Close a campaign (campaign:update)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Closed }
 */
router.get("/:id", requirePermission(P.CAMPAIGN_READ), validateRequest(campaignIdSchema), controller.get);
router.put("/:id", requirePermission(P.CAMPAIGN_UPDATE), validateRequest(updateCampaignSchema), controller.update);
router.post("/:id/activate", requirePermission(P.CAMPAIGN_UPDATE), validateRequest(campaignIdSchema), controller.activate);
router.post("/:id/close", requirePermission(P.CAMPAIGN_UPDATE), validateRequest(campaignIdSchema), controller.close);

/**
 * @openapi
 * /campaigns/{id}/vehicles:
 *   get:
 *     tags: [Campaigns]
 *     summary: Affected vehicles with customer contact details and outreach status
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, CONTACTED, SCHEDULED, COMPLETED, NOT_REACHABLE, NOT_APPLICABLE] } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: search, description: VIN, plate, customer name or phone, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Page of vehicles and counts per status (for the filter chips)
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 items: [{ id: "…", vin: KNAPU81BDP7123456, status: PENDING, contactAttempts: 3, lastContactAt: "2026-09-28T10:00:00Z", lastContactOutcome: NO_ANSWER, vehicle: { model: Sportage, customer: { firstName: Chinedu, lastName: Okafor, phoneNumber: "08031234567", branch: { name: Main Branch } } } }]
 *                 total: 860
 *                 counts: { affected: 860, pending: 214, contacted: 188, scheduled: 46, completed: 412, notReachable: 0, notApplicable: 0 }
 *   post:
 *     tags: [Campaigns]
 *     summary: Add affected vehicles by VIN list or by criteria (campaign:update)
 *     description: |
 *       VINs are normalised (upper case, no spaces or dashes) and validated (17 characters, no I, O or Q).
 *       Send `dryRun: true` to get the validation summary without saving. Vehicles already in the campaign are skipped.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           examples:
 *             vins:
 *               value: { vins: ["KNAPU81BDP7123456", "KNDEU2A20P7654321"], dryRun: true }
 *             criteria:
 *               value: { criteria: { vehicleModelIds: ["…"], yearFrom: 2021, yearTo: 2023, vinFrom: KNAPU81BDP7000000, vinTo: KNAPU81BDP7999999 } }
 *     responses:
 *       200:
 *         description: Dry-run summary
 *         content:
 *           application/json:
 *             example: { status: success, data: { valid: 130, invalid: [{ line: 5, value: KNAPU81BDP712, error: must be 17 characters }], duplicatesInInput: 0, alreadyInCampaign: 6, notInSystem: 37, toAdd: 124, added: 0 } }
 *       201: { description: Vehicles added }
 *   patch:
 *     tags: [Campaigns]
 *     summary: Change the status of several vehicles, e.g. mark not applicable (campaign:vehicle:update)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { campaignVehicleIds: ["…", "…"], status: NOT_APPLICABLE, notes: "Vehicle exported" }
 *     responses:
 *       200: { description: Updated }
 */
router.get("/:id/vehicles", requirePermission(P.CAMPAIGN_READ), validateRequest(listCampaignVehiclesSchema), controller.listVehicles);
router.post("/:id/vehicles", requirePermission(P.CAMPAIGN_UPDATE), validateRequest(addVehiclesSchema), controller.addVehicles);
router.patch("/:id/vehicles", requirePermission(P.CAMPAIGN_VEHICLE_UPDATE), validateRequest(bulkUpdateCampaignVehiclesSchema), controller.bulkUpdateVehicles);

/**
 * @openapi
 * /campaigns/{id}/vehicles/{vehicleId}:
 *   get:
 *     tags: [Campaigns]
 *     summary: One affected vehicle with its contact history
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: vehicleId, required: true, description: Campaign vehicle ID, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Vehicle }
 *   patch:
 *     tags: [Campaigns]
 *     summary: Change a vehicle's status (campaign:vehicle:update)
 *     description: Transitions are validated. COMPLETED needs the `jobCardId` that did the work.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: vehicleId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { status: NOT_REACHABLE, notes: "Number switched off after 4 attempts" }
 *     responses:
 *       200: { description: Updated }
 * /campaigns/{id}/vehicles/{vehicleId}/contacts:
 *   post:
 *     tags: [Campaigns]
 *     summary: Record a contact attempt (campaign:vehicle:update)
 *     description: Reaching the customer moves a pending or not-reachable vehicle to CONTACTED.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: vehicleId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { channel: PHONE, outcome: REACHED, notes: "Customer agreed to visit", nextFollowUpAt: "2026-10-02" }
 *     responses:
 *       201: { description: Recorded }
 * /campaigns/{id}/vehicles/{vehicleId}/appointment:
 *   post:
 *     tags: [Campaigns]
 *     summary: Book a service appointment for the campaign work (campaign:vehicle:update)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: vehicleId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { scheduledAt: "2026-10-02T09:00:00Z", branchId: "…", notes: "Recall RC-2026-014 — Engine wiring harness inspection" }
 *     responses:
 *       201: { description: Appointment booked and vehicle marked SCHEDULED }
 */
router.get("/:id/vehicles/:vehicleId", requirePermission(P.CAMPAIGN_READ), validateRequest(campaignVehicleParamsSchema), controller.getVehicle);
router.patch("/:id/vehicles/:vehicleId", requirePermission(P.CAMPAIGN_VEHICLE_UPDATE), validateRequest(updateCampaignVehicleSchema), controller.updateVehicle);
router.post("/:id/vehicles/:vehicleId/contacts", requirePermission(P.CAMPAIGN_VEHICLE_UPDATE), validateRequest(addContactSchema), controller.addContact);
router.post(
  "/:id/vehicles/:vehicleId/appointment",
  requirePermission(P.CAMPAIGN_VEHICLE_UPDATE),
  requirePermission(P.APPOINTMENT_CREATE),
  validateRequest(scheduleSchema),
  controller.schedule,
);

export default router;
