import { projectEstimatePrint } from "./estimate-print";
import { ServiceService } from "./service.service";
import { ConflictError } from "../../shared/errors/appError";
import { z } from "zod";
import prisma from "../../prisma/client";
import { assertBranchOwnership, requireRole } from "../../middleware/authorize";
import { ROLES } from "../../shared/constants/roles";
import { repeatWindowStart, jobStatusFilter } from "./job-card-workflow.service";
import { requireMaster } from "../workshop/workshop-master.service";
import { Router } from "express";
import { ServiceController } from "./service.controller";
import { validateRequest } from "../../middleware/requestValidator";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { PERMISSIONS } from "../../shared/constants/roles";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  createJobCardSchema,
  listJobCardsSchema,
  updateJobCardSchema,
  createInspectionSchema,
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
} from "./service.validation";

const router = Router();
const controller = new ServiceController();

router.use(authMiddleware);
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
  validateRequest(jobCardIdParamSchema),
  async (req, res, next) => {
    try {
      const jobs = await prisma.jobCard.findMany({
        where: {
          vehicleId: req.params.id,
          createdAt: { gte: repeatWindowStart() },
          status: { notIn: ["Cancelled", "CANCELLED"] },
        },
        select: {
          id: true,
          jobNumber: true,
          createdAt: true,
          technician: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      res.json({ status: "success", data: { jobs } });
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
  requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN),
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
  requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN),
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
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.jobCard.updateMany({
          where: { id: card.id, OR: [{ status: jobStatusFilter("READY") }, { status: jobStatusFilter("BILLED") }], creditApprovedById: null },
          data: { creditApprovedById: req.user!.userId },
        });
        if (!updated.count)
          throw new ConflictError(
            "Credit approval requires a READY or BILLED job without an existing approval",
          );
        await tx.auditLog.create({
          data: {
            userId: req.user!.userId,
            action: "JOB_CREDIT_APPROVED",
            details: JSON.stringify({
              jobCardId: card.id,
              remarks: req.body.remarks,
            }),
          },
        });
        return updated;
      });
      res.json({ status: "success", data: result });
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
 *     description: Opens a new job card to track a vehicle's repair workflow.
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
 *               bayId: { type: string, format: uuid }
 *               serviceAdvisorId: { type: string, format: uuid }
 *               technicianId: { type: string, format: uuid, description: Required when teamId is absent }
 *               teamId: { type: string, format: uuid }
 *               mileage: { type: integer, minimum: 0, example: 12500 }
 *               promisedAt: { type: string, format: date-time }
 *               checklist: { type: string, maxLength: 5000 }
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
 *               observations: { type: string }
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
 *     summary: List all inspections
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
 * /service/job-cards/{id}/inspections:
 *   post:
 *     tags:
 *       - Inspections & Estimates
 *     summary: Add inspection to job card
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
 *             required: [findings]
 *             properties:
 *               findings: { type: string }
 *               checklist: { type: object, additionalProperties: true }
 *     responses:
 *       201:
 *         description: Inspection created
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
router.get(
  "/job-cards/:id",
  requirePermission(PERMISSIONS.JOBCARD_READ),
  validateRequest(jobCardIdParamSchema),
  controller.getJobCard,
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
router.post(
  "/job-cards/:id/inspections",
  requirePermission(PERMISSIONS.INSPECTION_CREATE),
  validateRequest(createInspectionSchema),
  controller.addInspection,
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
router.post('/estimates/:id/revisions', requirePermission(PERMISSIONS.ESTIMATE_REVISE), validateRequest(createEstimateSchema), async (req, res, next) => {
 try {
  const source = await prisma.estimate.findUniqueOrThrow({ where: { id: req.params.id }, include: { jobCard: true } });
  assertBranchOwnership(req, source.jobCard?.branchId ?? source.branchId);
  if (!source.jobCardId) throw new ConflictError('Only job-linked estimates can be revised here');
  const estimate = await new ServiceService().addEstimate(source.jobCardId, req.body, req.user!.userId, source.id);
  res.status(201).json({ status: 'success', data: { estimate } });
 } catch(error) { next(error); }
});
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
 *     responses:
 *       200: { description: Header, job, customer, vehicle, scope, terms and signature }
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
router.get('/job-cards/:id/estimates/:estimateId/print', requirePermission(PERMISSIONS.ESTIMATE_PRINT), validateRequest(z.object({params:z.object({id:z.string().uuid(),estimateId:z.string().uuid()})})), async (req,res,next)=>{
 try {
  const estimate=await prisma.estimate.findFirstOrThrow({where:{id:req.params.estimateId,jobCardId:req.params.id},include:{lines:true,approvals:{include:{signature:true}},successor:{select:{version:true}},jobCard:{include:{branch:true,customer:true,vehicle:true,complaints:true,serviceType:true,service:true}}}});
  const card=estimate.jobCard!;
  assertBranchOwnership(req,card.branchId);
  const [branchTerms,companyTerms,parts,labour]=await Promise.all([
   prisma.documentTerms.findFirst({where:{type:'JOB_ESTIMATE',branchId:card.branchId}}),
   prisma.documentTerms.findFirst({where:{type:'JOB_ESTIMATE',branchId:null}}),
   prisma.sparePart.findMany({where:{id:{in:estimate.lines.filter(l=>l.type.endsWith('PART')).map(l=>l.referenceId!).filter(Boolean)}},select:{id:true,partNumber:true}}),
   prisma.labourItem.findMany({where:{id:{in:estimate.lines.filter(l=>l.type.endsWith('LABOUR')).map(l=>l.referenceId!).filter(Boolean)}},select:{id:true,code:true}})
  ]);
  const terms=branchTerms ?? companyTerms;
  const codes=new Map([...parts.map(p=>[p.id,p.partNumber] as [string,string]),...labour.map(l=>[l.id,l.code] as [string,string])]);
  res.json({status:'success',data:{
   estimate:projectEstimatePrint(estimate,codes),
   company:{name:companyTerms?.companyName ?? 'Dana Motors',address:companyTerms?.companyAddress,phone:companyTerms?.companyPhone},
   branch:{name:card.branch.name,address:card.branch.address,phone:card.branch.phoneNumber},
   customer:card.customer ? {name:card.customer.companyName || `${card.customer.firstName} ${card.customer.lastName}`,address:[card.customer.address,card.customer.house,card.customer.street,card.customer.city,card.customer.state].filter(Boolean).join(', '),phone:card.customer.phoneNumber} : null,
   vehicle:card.vehicle ? {registration:card.vehicle.registrationNumber,vin:card.vehicle.vin,make:card.vehicle.make,model:card.vehicle.model,variant:card.vehicle.trim,mileage:card.mileage} : null,
   job:{number:card.jobNumber,date:card.createdAt,serviceType:card.serviceType?.description ?? card.service?.name,complaints:card.complaints.map(c=>c.description)},
   terms:terms?.terms ?? [],footer:terms?.footer ?? null,printedAt:new Date().toISOString()
  }});
 }catch(error){next(error);}
});

export default router;
