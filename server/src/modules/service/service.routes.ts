import { Router } from 'express';
import { ServiceController } from './service.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  createJobCardSchema,
  updateJobCardSchema,
  createInspectionSchema,
  createEstimateSchema,
  createApprovalSchema,
  serviceIdParamSchema,
  jobCardIdParamSchema,
  estimateIdParamSchema,
} from './service.validation';

const router = Router();
const controller = new ServiceController();

router.use(authMiddleware);

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
 *             required: [vehicleId, complaint]
 *             properties:
 *               vehicleId: { type: string }
 *               customerId: { type: string }
 *               complaint: { type: string, example: Engine overheating }
 *               appointmentId: { type: string }
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
 *         schema: { type: string, enum: [PENDING, IN_PROGRESS, COMPLETED, CANCELLED, ON_HOLD] }
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
 *               status: { type: string, enum: [PENDING, IN_PROGRESS, COMPLETED, CANCELLED, ON_HOLD] }
 *               diagnosis: { type: string }
 *               notes: { type: string }
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
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     description: { type: string }
 *                     quantity: { type: integer }
 *                     unitPrice: { type: number }
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
 *             required: [decision]
 *             properties:
 *               decision: { type: string, enum: [APPROVED, REJECTED] }
 *               notes: { type: string }
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
router.post('/appointments', requirePermission(PERMISSIONS.SERVICE_CREATE), validateRequest(createAppointmentSchema), controller.createAppointment);
router.get('/appointments', requirePermission(PERMISSIONS.SERVICE_READ), controller.listAppointments);
router.get('/appointments/:id', requirePermission(PERMISSIONS.SERVICE_READ), validateRequest(serviceIdParamSchema), controller.getAppointment);
router.put('/appointments/:id', requirePermission(PERMISSIONS.SERVICE_UPDATE), validateRequest(updateAppointmentSchema), controller.updateAppointment);
router.delete('/appointments/:id', requirePermission(PERMISSIONS.SERVICE_DELETE), validateRequest(serviceIdParamSchema), controller.deleteAppointment);

router.post('/job-cards', requirePermission(PERMISSIONS.SERVICE_CREATE), validateRequest(createJobCardSchema), controller.createJobCard);
router.get('/job-cards', requirePermission(PERMISSIONS.SERVICE_READ), controller.listJobCards);
router.get('/job-cards/:id', requirePermission(PERMISSIONS.SERVICE_READ), validateRequest(jobCardIdParamSchema), controller.getJobCard);
router.put('/job-cards/:id', requirePermission(PERMISSIONS.SERVICE_UPDATE), validateRequest(updateJobCardSchema), controller.updateJobCard);

router.get('/inspections', requirePermission(PERMISSIONS.SERVICE_READ), controller.listInspections);
router.post('/job-cards/:id/inspections', requirePermission(PERMISSIONS.SERVICE_CREATE), validateRequest(createInspectionSchema), controller.addInspection);
router.get('/estimates', requirePermission(PERMISSIONS.SERVICE_READ), controller.listEstimates);
router.post('/job-cards/:id/estimates', requirePermission(PERMISSIONS.SERVICE_CREATE), validateRequest(createEstimateSchema), controller.addEstimate);
router.post('/estimates/:id/approvals', requirePermission(PERMISSIONS.SERVICE_CREATE), validateRequest(createApprovalSchema), controller.addApproval);
router.get('/estimates/:id/approvals', requirePermission(PERMISSIONS.SERVICE_READ), validateRequest(estimateIdParamSchema), controller.getApprovals);

export default router;

