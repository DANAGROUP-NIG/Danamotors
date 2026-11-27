import { recordJobDeposit } from "./job-deposit.service";
import { listMultiJobVehicles, multiJobBranch, multiJobVehiclesQuery } from "./multi-job-vehicles";
import { jobOpeningSignatureRoutes } from "./job-opening-signature.routes";
import { jobCheckInRoutes, jobPhotoRoutes } from "./job-check-in.routes";
import { jobDiagnosisRoutes } from "./job-diagnosis.routes";
import { jobWarrantyRoutes } from "./job-warranty.routes";
import { jobEstimateRoutes } from "./job-estimate.routes";
import { jobRepairRoutes, myJobsRoutes } from "./job-repair.routes";
import { jobQualityCheckRoutes } from "./job-quality-check.routes";
import { jobBillingRoutes } from "./job-billing-step.routes";
import { jobDeliveryRoutes } from "./job-delivery.routes";
import { CREDIT_APPROVERS } from "./job-billing-step.service";
import { loadOpeningConsent } from "./job-opening-consent";
import { assertBookable } from "./booking.logic";
import { projectEstimatePrint } from "./estimate-print";
import { ServiceService } from "./service.service";
import { ConflictError, NotFoundError } from "../../shared/errors/appError";
import { z } from "zod";
import prisma from "../../prisma/client";
import {
  assertBranchOwnership,
  requireRole,
} from "../../middleware/authorize";
import { ROLES } from "../../shared/constants/roles";
import { JobCardWorkflowService } from "./job-card-workflow.service";
import { JobStageService } from "./job-stage.service";
import { RepeatJobService } from "../repeat-job/repeat-job.service";
import { repeatActor } from "../repeat-job/repeat-job.actor";
import { repeatPreviewSchema } from "../repeat-job/repeat-job.validation";
import { requireMaster } from "../workshop/workshop-master.service";
import { Router, type Request } from "express";
import { ServiceController } from "./service.controller";
import { campaignAttendanceSchema } from "../campaign/campaign.validation";
import { validateRequest } from "../../middleware/requestValidator";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { PERMISSIONS } from "../../shared/constants/roles";
import {
  createAppointmentSchema,
  convertAppointmentSchema,
  updateAppointmentSchema,
  createJobCardSchema,
  listJobCardsSchema,
  updateJobCardSchema,
  createEstimateSchema,
  createApprovalSchema,
  serviceIdParamSchema,
  jobCardIdParamSchema,
  estimateIdParamSchema,
  labourLineIdParamSchema,
  createLabourItemSchema,
  updateLabourItemSchema,
  createJobCardLabourSchema,
  updateJobCardLabourSchema,
  stageActionSchema,
} from "./service.validation";

const router = Router();
const controller = new ServiceController();

router.use(authMiddleware);
router.use("/job-cards/:id/opening-consent", jobOpeningSignatureRoutes);
router.use("/job-cards/:id/check-in", jobCheckInRoutes);
router.use("/job-cards/:id/photos", jobPhotoRoutes);
router.use("/job-cards/:id/diagnosis", jobDiagnosisRoutes);
router.use("/job-cards/:id/warranty", jobWarrantyRoutes);
router.use("/job-cards/:id/estimate", jobEstimateRoutes);
router.use("/job-cards/:id/repair", jobRepairRoutes);
router.use("/job-cards/:id/quality-check", jobQualityCheckRoutes);
router.use("/job-cards/:id/billing", jobBillingRoutes);
router.use("/job-cards/:id/delivery", jobDeliveryRoutes);
router.use("/my-jobs", myJobsRoutes);
router.get(
  "/staff",
  requirePermission(PERMISSIONS.JOBCARD_READ),
  validateRequest(
    z.object({
      query: z.object({
        branchId: z.string().uuid(),
        role: z.enum(["ServiceAdviser", "Technician", "Engineer"]),
        search: z.string().optional(),
        limit: z.coerce.number().int().positive().max(100).default(50),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const q = req.query;
      assertBranchOwnership(req, String(q.branchId));
      const users = await prisma.user.findMany({
        where: {
          branchId: String(q.branchId),
          role: { name: String(q.role) },
          isActive: true,
          ...(q.search
            ? {
                AND: String(q.search)
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((term) => ({
                    OR: [
                      {
                        firstName: {
                          contains: term,
                          mode: "insensitive" as const,
                        },
                      },
                      {
                        lastName: {
                          contains: term,
                          mode: "insensitive" as const,
                        },
                      },
                    ],
                  })),
              }
            : {}),
        },
        take: Number(q.limit),
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      });
      res.json({ status: "success", data: { users } });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/vehicles/:id/recent-jobs",
  requirePermission(PERMISSIONS.JOBCARD_READ),
  validateRequest(repeatPreviewSchema),
  async (req, res, next) => {
    try {
      // Repeat check for the opening form: the automatic candidate and the vehicle's earlier jobs.
      const { params, query } = repeatPreviewSchema.parse({ params: req.params, query: req.query });
      res.json({ status: "success", data: await new RepeatJobService().preview(params.id, query, repeatActor(req)) });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/labour-rates",
  requirePermission(PERMISSIONS.JOBCARD_READ),
  validateRequest(
    z.object({ query: z.object({ modelId: z.string().uuid().optional() }) }),
  ),
  async (req, res, next) => {
    try {
      res.json({
        status: "success",
        data: {
          rates: await prisma.labourRate.findMany({
            where: { modelId: req.query.modelId as string | undefined },
            include: { labourItem: true, model: true },
            take: 100,
          }),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/labour-rates",
  requirePermission(PERMISSIONS.LABOUR_RATE_UPDATE),
  validateRequest(
    z.object({
      body: z
        .object({
          labourItemId: z.string().uuid(),
          modelId: z.string().uuid(),
          pricing: z.enum(["FIXED", "TIME"]),
          hours: z.number().positive(),
          rate: z.number().nonnegative(),
          active: z.boolean().optional(),
        })
        .strict(),
    }),
  ),
  async (req, res, next) => {
    try {
      await requireMaster(prisma, req.body.modelId, "MODEL");
      const { labourItemId, modelId } = req.body;
      const rate = await prisma.labourRate.upsert({
        where: { labourItemId_modelId: { labourItemId, modelId } },
        create: req.body,
        update: req.body,
      });
      res.json({ status: "success", data: { rate } });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/job-cards/:id/credit-approval",
  // TODO(confirm): the service manager may approve delivery on credit too (design prompt 14, phase 8).
  requireRole(...CREDIT_APPROVERS),
  validateRequest(
    z.object({
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ remarks: z.string().trim().min(1).max(2000) }).strict(),
    }),
  ),
  async (req, res, next) => {
    try {
      const card = await prisma.jobCard.findUniqueOrThrow({
        where: { id: req.params.id },
      });
      assertBranchOwnership(req, card.branchId);
      const result = await new JobCardWorkflowService().approveCredit(
        card.id,
        req.user!.userId,
        req.body.remarks,
      );
      res.json({ status: "success", data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /service/job-cards/{id}/campaigns/{campaignId}/attendance:
 *   put:
 *     tags: [Service & Job Cards]
 *     summary: Record whether a linked campaign's (FPC) work was done on this job
 *     description: >-
 *       Requires jobcard:update; branch scoped. Allowed until the job card is delivered or cancelled.
 *       READY needs an answer for every linked campaign (409 CAMPAIGN_ATTENDANCE_REQUIRED), except a
 *       campaign with a FREE line charged to it, which is recorded as done. Once the job is READY or
 *       BILLED the campaign vehicle follows the answer (done completes it; not done returns it to
 *       outstanding).
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: campaignId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           examples:
 *             done: { value: { attended: true } }
 *             notDone: { value: { attended: false, reason: PARTS_NOT_AVAILABLE, note: 'Plate cover on back order' } }
 *     responses:
 *       200:
 *         description: Attendance of every campaign on the job card
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               data:
 *                 - { campaignId: 3f0c…, campaignCode: KC13-14-P010-XM, campaignTitle: 'Sorento (XM) fuel pump plate cover', attended: false, notAttendedReason: 'Parts not available: Plate cover on back order', hasFreeLine: false }
 *       400: { description: Job card closed, or no reason given for "not done" }
 *       404: { description: Job card not found, or the campaign is not linked to it }
 */
router.put(
  "/job-cards/:id/campaigns/:campaignId/attendance",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(campaignAttendanceSchema),
  async (req, res, next) => {
    try {
      const card = await prisma.jobCard.findUnique({
        where: { id: req.params.id },
        select: { branchId: true },
      });
      assertBranchOwnership(req, card?.branchId);
      const data = await new JobCardWorkflowService().setCampaignAttendance(
        req.params.id,
        req.params.campaignId,
        req.body,
        req.user!.userId,
      );
      res.json({
        status: "success",
        statusCode: 200,
        message: "Campaign work recorded",
        data,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /service/labour-items:
 *   get:
 *     tags: [Service & Job Cards]
 *     summary: List active labour items
 *     responses:
 *       200: { description: Labour catalogue }
 *   post:
 *     tags: [Service & Job Cards]
 *     summary: Create a labour catalogue item
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { code: 'LAB-001', description: 'Engine diagnostic', defaultHours: 1, rate: 25000 }
 *     responses:
 *       201: { description: Labour item created }
 * /service/labour-items/{id}:
 *   put:
 *     tags: [Service & Job Cards]
 *     summary: Update a labour catalogue item
 *     responses:
 *       200: { description: Labour item updated }
 * /service/job-cards/{id}/labour:
 *   get:
 *     tags: [Service & Job Cards]
 *     summary: List labour recorded on a job card
 *     responses:
 *       200: { description: Job-card labour lines }
 *   post:
 *     tags: [Service & Job Cards]
 *     summary: Add a labour line to an open job card
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { labourItemId: '550e8400-e29b-41d4-a716-446655440000', hours: 2, technicianId: '550e8400-e29b-41d4-a716-446655440001' }
 *     responses:
 *       201: { description: Job-card labour line created with a rate snapshot }
 * /service/job-card-labour/{lineId}:
 *   put:
 *     tags: [Service & Job Cards]
 *     summary: Update an unbilled job-card labour line
 *     responses:
 *       200: { description: Job-card labour line updated }
 *   delete:
 *     tags: [Service & Job Cards]
 *     summary: Remove an unbilled job-card labour line
 *     responses:
 *       200: { description: Job-card labour line removed }
 */
router.get(
  "/labour-items",
  requirePermission(PERMISSIONS.LABOUR_ITEM_READ),
  validateRequest(
    z.object({
      query: z.object({
        search: z.string().max(100).optional(),
        includeInactive: z.enum(["true", "false"]).optional(),
      }),
    }),
  ),
  controller.listLabourItems,
);
router.post(
  "/labour-items",
  requirePermission(PERMISSIONS.LABOUR_ITEM_CREATE),
  validateRequest(createLabourItemSchema),
  controller.createLabourItem,
);
router.put(
  "/labour-items/:id",
  requirePermission(PERMISSIONS.LABOUR_ITEM_UPDATE),
  validateRequest(updateLabourItemSchema),
  controller.updateLabourItem,
);
router.get(
  "/job-cards/:id/labour",
  requirePermission(PERMISSIONS.JOBCARD_READ),
  validateRequest(jobCardIdParamSchema),
  controller.listJobCardLabour,
);
router.post(
  "/job-cards/:id/labour",
  requirePermission(PERMISSIONS.JOBLABOUR_UPDATE),
  validateRequest(createJobCardLabourSchema),
  controller.addJobCardLabour,
);
router.put(
  "/job-card-labour/:lineId",
  requirePermission(PERMISSIONS.JOBLABOUR_UPDATE),
  validateRequest(updateJobCardLabourSchema),
  controller.updateJobCardLabour,
);
router.delete(
  "/job-card-labour/:lineId",
  requirePermission(PERMISSIONS.JOBLABOUR_UPDATE),
  validateRequest(labourLineIdParamSchema),
  controller.removeJobCardLabour,
);

/**
 * @openapi
 * /service/appointments:
 *   post:
 *     tags:
 *       - Service & Job Cards
 *     summary: Create a new service appointment
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicleId, scheduledDate]
 *             properties:
 *               vehicleId: { type: string }
 *               customerId: { type: string }
 *               scheduledDate: { type: string, format: date-time }
 *               serviceType: { type: string, example: OIL_CHANGE }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Appointment created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   get:
 *     tags:
 *       - Service & Job Cards
 *     summary: List all appointments
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, CONFIRMED, CANCELLED, COMPLETED] }
 *     responses:
 *       200:
 *         description: Paginated appointment list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /service/appointments/{id}:
 *   get:
 *     tags:
 *       - Service & Job Cards
 *     summary: Get appointment by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Appointment details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   put:
 *     tags:
 *       - Service & Job Cards
 *     summary: Update appointment
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scheduledDate: { type: string, format: date-time }
 *               status: { type: string, enum: [PENDING, CONFIRMED, CANCELLED, COMPLETED] }
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Appointment updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   delete:
 *     tags:
 *       - Service & Job Cards
 *     summary: Delete appointment
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Appointment deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /service/job-cards:
 *   post:
 *     tags:
 *       - Service & Job Cards
 *     summary: Create a job card
 *     description: Requires jobcard:create and branch access. A technician and team are optional.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branchName, customerId, vehicleId, description, serviceTypeId, mileage, bayId, serviceAdvisorId, promisedAt, complaints]
 *             properties:
 *               branchName: { type: string, example: Ikeja }
 *               customerId: { type: string, format: uuid }
 *               vehicleId: { type: string, format: uuid }
 *               appointmentId: { type: string, format: uuid }
 *               description: { type: string, example: Brake inspection }
 *               serviceTypeId: { type: string, format: uuid, description: Eligible WorkshopMaster SERVICE_TYPE for this vehicle model }
 *               serviceId: { type: string, format: uuid, description: Optional separate appointment service; does not set the opening charge }
 *               bayId: { type: string, format: uuid, description: Optional. The workshop supervisor sets the bay in Diagnosis. }
 *               serviceAdvisorId: { type: string, format: uuid }
 *               technicianId: { type: string, format: uuid, description: Optional legacy assignment input. Use the workshop assign endpoint for normal assignment. }
 *               teamId: { type: string, format: uuid, description: Optional legacy team input }
 *               mileage: { type: integer, minimum: 0, example: 12500 }
 *               promisedAt: { type: string, format: date-time }
 *               acType: { type: string, enum: [FACTORY, DEALER, NONE] }
 *               batteryMakeId: { type: string, format: uuid }
 *               batteryNumber: { type: string, maxLength: 100 }
 *               customField1: { type: string, maxLength: 500 }
 *               tyres:
 *                 type: array
 *                 minItems: 5
 *                 maxItems: 5
 *                 items:
 *                   type: object
 *                   properties:
 *                     makeId: { type: string, format: uuid }
 *                     number: { type: string, maxLength: 100 }
 *               estimatedParts: { type: number, minimum: 0, description: "Indicative parts estimate in NGN" }
 *               estimatedOil: { type: number, minimum: 0 }
 *               estimatedLabour: { type: number, minimum: 0 }
 *               serviceCharge: { type: number, minimum: 0 }
 *               complaints:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   properties:
 *                     complaintCodeId: { type: string, format: uuid }
 *                     defectCode: { type: string, maxLength: 50 }
 *                     spare: { type: number, minimum: 0 }
 *                     oil: { type: number, minimum: 0 }
 *                     labour: { type: number, minimum: 0 }
 *                     description: { type: string, example: Brake noise }
 *               isRepeat: { type: boolean }
 *               previousJobId: { type: string, format: uuid }
 *               repeatReason: { type: string }
 *               acFitted: { type: boolean }
 *               inHouse: { type: boolean }
 *               remarks: { type: string }
 *     responses:
 *       201:
 *         description: Job card created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/JobCardDTO'
 *   get:
 *     tags:
 *       - Service & Job Cards
 *     summary: List all job cards
 *     description: Requires jobcard:read. Branch-scoped staff see jobs in their own branch.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [OPEN, IN_PROGRESS, QC, READY, BILLED, DELIVERED, CANCELLED] }
 *       - in: query
 *         name: unassignedTechnician
 *         description: When true, return jobs without an individual technician, including team-only jobs.
 *         schema: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Paginated job card list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /service/job-cards/{id}:
 *   get:
 *     tags:
 *       - Service & Job Cards
 *     summary: Get job card by ID
 *     description: Requires jobcard:read and branch access. Visible estimates include upfrontPaymentPercent (default 60, range 0-100) and decimal-rounded upfrontAmount. These are recommendations only; any positive eligible advance satisfies the payment gate, independently of the percentage. Estimate/financial fields retain their separate permission checks.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Job card details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/JobCardDTO'
 *   put:
 *     tags:
 *       - Service & Job Cards
 *     summary: Update job card
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [OPEN, IN_PROGRESS, QC, READY, BILLED, DELIVERED, CANCELLED] }
 *               workDone: { type: string }
 *               remarks: { type: string, description: Required when cancelling }
 *               deliveryAdvisorId: { type: string, format: uuid }
 *               lateReasonIds: { type: array, maxItems: 6, items: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Job card updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /service/inspections:
 *   get:
 *     tags:
 *       - Inspections & Estimates
 *     summary: List quality checks (inspections)
 *     description: Requires inspection:read. Query result=PASSED or FAILED, search (notes, job number, customer), page, limit. Branch-scoped.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Inspection list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /service/estimates:
 *   get:
 *     tags:
 *       - Inspections & Estimates
 *     summary: List all estimates
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Estimate list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /service/job-cards/{id}/estimates:
 *   post:
 *     tags:
 *       - Inspections & Estimates
 *     summary: Add estimate to job card
 *     description: Requires estimate:create and job branch access. upfrontPaymentPercent is an advisory percentage, default 60. Any positive eligible advance satisfies the separate work-start payment requirement. Existing scope approval and status permissions still apply.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Job card ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [description, lines]
 *             properties:
 *               description: { type: string, example: Workshop estimate }
 *               upfrontPaymentPercent: { type: number, minimum: 0, maximum: 100, multipleOf: 0.01, default: 60, example: 33.33, description: 'Suggested percentage only; presets include 20, 30 and 60, and custom values are accepted.' }
 *               lines:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     description: { type: string }
 *                     quantity: { type: integer }
 *                     type: { type: string, enum: [COMPLAINT, PART, LABOUR, SERVICE] }
 *                     referenceId: { type: string, format: uuid }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Estimate created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /service/estimates/{id}/approvals:
 *   post:
 *     tags:
 *       - Inspections & Estimates
 *     summary: Submit customer approval for an estimate
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Estimate ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, approved]
 *             properties:
 *               customerId: { type: string, format: uuid }
 *               approved: { type: boolean }
 *               comments: { type: string }
 *     responses:
 *       200:
 *         description: Approval decision recorded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   get:
 *     tags:
 *       - Inspections & Estimates
 *     summary: Get approvals for an estimate
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Approval records
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
router.post(
  "/appointments",
  requirePermission(PERMISSIONS.APPOINTMENT_CREATE),
  validateRequest(createAppointmentSchema),
  controller.createAppointment,
);
router.get(
  "/appointments",
  requirePermission(PERMISSIONS.APPOINTMENT_READ),
  controller.listAppointments,
);
router.get(
  "/appointments/:id",
  requirePermission(PERMISSIONS.APPOINTMENT_READ),
  validateRequest(serviceIdParamSchema),
  controller.getAppointment,
);
router.put(
  "/appointments/:id",
  requirePermission(PERMISSIONS.APPOINTMENT_UPDATE),
  validateRequest(updateAppointmentSchema),
  controller.updateAppointment,
);
router.post(
  "/appointments/:id/convert",
  requirePermission(PERMISSIONS.APPOINTMENT_UPDATE),
  requirePermission(PERMISSIONS.JOBCARD_CREATE),
  validateRequest(convertAppointmentSchema),
  controller.convertAppointment,
);
router.get(
  "/appointments/:id/opening-consent",
  requirePermission(PERMISSIONS.APPOINTMENT_UPDATE),
  requirePermission(PERMISSIONS.JOBCARD_CREATE),
  validateRequest(serviceIdParamSchema),
  async (req, res, next) => {
    try {
      const booking = await prisma.serviceAppointment.findUniqueOrThrow({
        where: { id: req.params.id },
      });
      assertBranchOwnership(req, booking.branchId);
      assertBookable(booking);
      res.json({
        status: "success",
        data: { consent: await loadOpeningConsent(prisma, booking) },
      });
    } catch (error) {
      next(error);
    }
  },
);
router.delete(
  "/appointments/:id",
  requirePermission(PERMISSIONS.APPOINTMENT_DELETE),
  validateRequest(serviceIdParamSchema),
  controller.deleteAppointment,
);

router.post(
  "/job-cards",
  requirePermission(PERMISSIONS.JOBCARD_CREATE),
  validateRequest(createJobCardSchema),
  controller.createJobCard,
);
router.get(
  "/job-cards",
  requirePermission(PERMISSIONS.JOBCARD_READ),
  validateRequest(listJobCardsSchema),
  controller.listJobCards,
);
/**
 * @openapi
 * /service/job-cards/multi-job-vehicles:
 *   get:
 *     tags: [Service]
 *     summary: List vehicles with at least two visible job cards
 *     description: Requires jobcard:read and jobcard:multi-vehicle:read. Closed jobs use delivery dates in Africa/Lagos. Use nextCursor as after for the next page.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: after, schema: { type: string, format: uuid } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 50 } }
 *       - { in: query, name: closedFrom, schema: { type: string, format: date } }
 *       - { in: query, name: closedTo, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Vehicle IDs and registration and VIN with job IDs and details and nextCursor }
 *       400: { description: Invalid cursor or closed date range }
 *       403: { description: Branch or permission denied }
 */
router.get(
  "/job-cards/multi-job-vehicles",
  requirePermission(PERMISSIONS.JOBCARD_READ),
  requirePermission(PERMISSIONS.JOBCARD_MULTI_VEHICLE_READ),
  validateRequest(z.object({ query: multiJobVehiclesQuery })),
  async (req, res, next) => {
    try {
      const query = multiJobVehiclesQuery.parse(req.query);
      const data = await listMultiJobVehicles(query, multiJobBranch(req.user, query.branchId));
      res.json({ status: "success", statusCode: 200, data });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/job-cards/:id",
  requirePermission(PERMISSIONS.JOBCARD_READ),
  validateRequest(jobCardIdParamSchema),
  controller.getJobCard,
);

const stageService = new JobStageService();
/** The job must exist and belong to a branch the user can work in. */
async function assertStageJobAccess(req: Request, id: string) {
  const card = await prisma.jobCard.findUnique({ where: { id }, select: { branchId: true } });
  if (!card) throw new NotFoundError("Job card not found");
  assertBranchOwnership(req, card.branchId);
}
const stageActor = (req: Request) => ({ id: req.user!.userId, role: req.user!.role });

/**
 * @openapi
 * /api/service/job-cards/{id}/workspace:
 *   get:
 *     tags: [Service]
 *     summary: The staged job card for the signed-in user
 *     description: Stage, owner and since when, the current sub-step, the actions this user can take (each with an enabled flag and plain-English reasons), up to 3 alerts, summaries of completed steps, a read-only flag, the Warranty or Non-warranty tag (warrantyJob), the step activity log (newest first), the vehicle's last two earlier visits and, for a cancelled job, who cancelled it and why.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: 'status=success, data=workspace' }
 *       401: { description: Authentication required }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Job card not found }
 */
router.get(
  "/job-cards/:id/workspace",
  requirePermission(PERMISSIONS.JOBCARD_READ),
  validateRequest(jobCardIdParamSchema),
  async (req, res, next) => {
    try {
      await assertStageJobAccess(req, req.params.id);
      const user = req.user!;
      const data = await stageService.workspace(req.params.id, stageActor(req), {
        // Matches the POST /stage check, so the screen never offers an action the server refuses.
        canUpdate: user.role === ROLES.SUPER_ADMIN || user.permissions.includes(PERMISSIONS.JOBCARD_UPDATE),
      });
      res.json({ status: "success", statusCode: 200, data });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/service/job-cards/{id}/stage:
 *   post:
 *     tags: [Service]
 *     summary: Pass the job to the next step, or take another step action
 *     description: Runs one action under the job lock after its permission and gates pass. Actions that change the job status run through the existing workflow. Repeating a requestId returns the current workspace without acting again.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [action, requestId]
 *             properties:
 *               action: { type: string, enum: [SEND_TO_SUPERVISOR, SEND_TO_ENGINEER, SEND_TO_WARRANTY, SEND_TO_ADVISOR, RETURN_TO_TECHNICIAN, WARRANTY_TO_ADVISOR, RELEASE_TO_REPAIR, PAUSE_FOR_PARTS, RESUME_REPAIR, SEND_TO_QC, RETURN_TO_REPAIR, QC_PASSED_TO_ADVISOR, MARK_READY, SEND_TO_DELIVERY, CANCEL] }
 *               note: { type: string, maxLength: 2000, description: Required for CANCEL and RETURN_TO_TECHNICIAN }
 *               requestId: { type: string, format: uuid }
 *           example: { action: SEND_TO_SUPERVISOR, requestId: '11111111-1111-4111-8111-111111111111' }
 *     responses:
 *       200: { description: 'status=success, data=workspace after the action' }
 *       400: { description: Invalid fields. Errors name the field and the fix. }
 *       401: { description: Authentication required }
 *       403: { description: 'Permission, role or branch access denied (code STAGE_ACTION_FORBIDDEN for the role rules)' }
 *       404: { description: Job card not found }
 *       409: { description: 'Blocked: code STAGE_ACTION_BLOCKED with details.reasons, or STAGE_REQUEST_REUSED' }
 */
router.post(
  "/job-cards/:id/stage",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(stageActionSchema),
  async (req, res, next) => {
    try {
      await assertStageJobAccess(req, req.params.id);
      const data = await stageService.act(req.params.id, req.body, stageActor(req));
      res.json({ status: "success", statusCode: 200, message: "Job card step updated", data });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/job-cards/:id/deposit",
  requirePermission(PERMISSIONS.RECEIPT_CREATE),
  validateRequest(
    z.object({
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ receiptId: z.string().uuid() }).strict(),
    }),
  ),
  async (req, res, next) => {
    try {
      const card = await prisma.jobCard.findUniqueOrThrow({
        where: { id: req.params.id },
      });
      assertBranchOwnership(req, card.branchId);
      res.json({
        status: "success",
        data: await recordJobDeposit(
          card.id,
          req.body.receiptId,
          req.user!.userId,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
router.put(
  "/job-cards/:id",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(updateJobCardSchema),
  controller.updateJobCard,
);

router.get(
  "/inspections",
  requirePermission(PERMISSIONS.INSPECTION_READ),
  controller.listInspections,
);
router.get(
  "/estimates",
  requirePermission(PERMISSIONS.ESTIMATE_READ),
  controller.listEstimates,
);
router.post(
  "/job-cards/:id/estimates",
  requirePermission(PERMISSIONS.ESTIMATE_CREATE),
  validateRequest(createEstimateSchema),
  controller.addEstimate,
);
/**
 * @openapi
 * /service/estimates/{id}/revisions:
 *   post:
 *     tags: [Service & Job Cards]
 *     summary: Create an unsigned version N+1 (estimate:revise)
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { description: 'Revised scope', lines: [{ type: 'LABOUR', referenceId: '00000000-0000-4000-8000-000000000001', quantity: 2 }] }
 *     responses:
 *       201: { description: New immutable revision }
 *       403: { description: Missing estimate revise permission }
 *       409: { description: Superseded source }
 */
router.post(
  "/estimates/:id/revisions",
  requirePermission(PERMISSIONS.ESTIMATE_REVISE),
  validateRequest(createEstimateSchema),
  async (req, res, next) => {
    try {
      const source = await prisma.estimate.findUniqueOrThrow({
        where: { id: req.params.id },
        include: { jobCard: true },
      });
      assertBranchOwnership(req, source.jobCard?.branchId ?? source.branchId);
      if (!source.jobCardId)
        throw new ConflictError(
          "Only job-linked estimates can be revised here",
        );
      const estimate = await new ServiceService().addEstimate(
        source.jobCardId,
        req.body,
        req.user!.userId,
        source.id,
      );
      res.status(201).json({ status: "success", data: { estimate } });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/estimates/:id/approvals",
  requirePermission(PERMISSIONS.ESTIMATE_SIGN),
  validateRequest(createApprovalSchema),
  controller.addApproval,
);
router.get(
  "/estimates/:id/approvals",
  requirePermission(PERMISSIONS.ESTIMATE_READ),
  validateRequest(estimateIdParamSchema),
  controller.getApprovals,
);

/**
 * @openapi
 * /service/job-cards/{id}/estimates/{estimateId}/print:
 *   get:
 *     tags: [Service & Job Cards]
 *     summary: Customer-facing single estimate print data (estimate:print)
 *     description: Returns saved-revision upfrontPaymentPercent and upfrontAmount (two-decimal half-up rounding), alongside total and signature evidence. The percentage defaults to 60 and is advisory; payment need not equal this amount. No payment or signature is changed by printing.
 *     responses:
 *       200: { description: 'Header, job, customer, vehicle, scope, terms, signature and advisory advance. Example estimate fields: total=100.01, upfrontPaymentPercent=60, upfrontAmount=60.01.' }
 *       403: { description: Missing estimate print permission or wrong branch }
 * /service/estimates/{id}/approvals:
 *   post:
 *     tags: [Service & Job Cards]
 *     summary: Capture signed customer decision (estimate:sign)
 *     description: Requires expectedVersion, expectedHash, signerName and a PNG signatureImage (64 KiB max). Decline requires comments. Admin may supply overrideReason instead of a signature. All decisions are audited. Unsigned portal approvals are disabled pending remote capture.
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { customerId: '00000000-0000-4000-8000-000000000001', approved: true, expectedVersion: 2, expectedHash: '64-character-sha256-from-estimate', signerName: 'Customer name', signatureImage: 'data:image/png;base64,...' }
 *     responses:
 *       201: { description: Signature and decision saved atomically }
 *       400: { description: Signature, relationship, decline reason or override reason missing }
 *       403: { description: Missing estimate sign permission }
 *       409: { description: Estimate changed or already decided }
 */
router.get(
  "/job-cards/:id/estimates/:estimateId/print",
  requirePermission(PERMISSIONS.ESTIMATE_PRINT),
  validateRequest(
    z.object({
      params: z.object({
        id: z.string().uuid(),
        estimateId: z.string().uuid(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const estimate = await prisma.estimate.findFirstOrThrow({
        where: { id: req.params.estimateId, jobCardId: req.params.id },
        include: {
          lines: true,
          approvals: { include: { signature: true } },
          successor: { select: { version: true } },
          jobCard: {
            include: {
              branch: true,
              customer: true,
              vehicle: true,
              complaints: true,
              serviceType: true,
              service: true,
            },
          },
        },
      });
      const card = estimate.jobCard!;
      assertBranchOwnership(req, card.branchId);
      const [branchTerms, companyTerms, parts, labour] = await Promise.all([
        prisma.documentTerms.findFirst({
          where: { type: "JOB_ESTIMATE", branchId: card.branchId },
        }),
        prisma.documentTerms.findFirst({
          where: { type: "JOB_ESTIMATE", branchId: null },
        }),
        prisma.sparePart.findMany({
          where: {
            id: {
              in: estimate.lines
                .filter((l) => l.type.endsWith("PART"))
                .map((l) => l.referenceId!)
                .filter(Boolean),
            },
          },
          select: { id: true, partNumber: true },
        }),
        prisma.labourItem.findMany({
          where: {
            id: {
              in: estimate.lines
                .filter((l) => l.type.endsWith("LABOUR"))
                .map((l) => l.referenceId!)
                .filter(Boolean),
            },
          },
          select: { id: true, code: true },
        }),
      ]);
      const terms = branchTerms ?? companyTerms;
      const signedTerms = estimate.approvals
        .find(
          (approval) =>
            approval.approved && approval.signature?.consentStatement,
        )
        ?.signature?.consentStatement?.split("\n")
        .slice(1);
      const codes = new Map([
        ...parts.map((p) => [p.id, p.partNumber] as [string, string]),
        ...labour.map((l) => [l.id, l.code] as [string, string]),
      ]);
      res.json({
        status: "success",
        data: {
          estimate: projectEstimatePrint(estimate, codes),
          company: {
            name: companyTerms?.companyName ?? "Dana Motors",
            address: companyTerms?.companyAddress,
            phone: companyTerms?.companyPhone,
          },
          branch: {
            name: card.branch.name,
            address: card.branch.address,
            phone: card.branch.phoneNumber,
          },
          customer: card.customer
            ? {
                name:
                  card.customer.companyName ||
                  `${card.customer.firstName} ${card.customer.lastName}`,
                address: [
                  card.customer.address,
                  card.customer.house,
                  card.customer.street,
                  card.customer.city,
                  card.customer.state,
                ]
                  .filter(Boolean)
                  .join(", "),
                phone: card.customer.phoneNumber,
              }
            : null,
          vehicle: card.vehicle
            ? {
                registration: card.vehicle.registrationNumber,
                vin: card.vehicle.vin,
                make: card.vehicle.make,
                model: card.vehicle.model,
                variant: card.vehicle.trim,
                mileage: card.mileage,
              }
            : null,
          job: {
            number: card.jobNumber,
            date: card.createdAt,
            serviceType: card.serviceType?.description ?? card.service?.name,
            complaints: card.complaints.map((c) => c.description),
          },
          terms: signedTerms ?? terms?.terms ?? [],
          footer: terms?.footer ?? null,
          printedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
