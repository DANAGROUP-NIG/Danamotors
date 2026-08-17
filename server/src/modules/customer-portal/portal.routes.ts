import { Router } from 'express';
import { PortalController } from './portal.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { customerAuthMiddleware } from '../../middleware/customerAuthMiddleware';
import {
  idParamSchema,
  updateProfileSchema,
  changePasswordSchema,
  estimateApprovalSchema,
  jobCardListQuerySchema,
  createPortalVehicleSchema,
  createPortalAppointmentSchema,
  creditDecisionSchema,
} from './portal.validation';

const router = Router();
const controller = new PortalController();

router.use(customerAuthMiddleware);

/**
 * @openapi
 * /portal/me:
 *   get:
 *     tags:
 *       - Customer Portal
 *     summary: Get customer profile
 *     description: Returns the authenticated customer's own profile.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Customer profile
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/CustomerDTO'
 *   put:
 *     tags:
 *       - Customer Portal
 *     summary: Update customer profile
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phoneNumber: { type: string }
 *               address: { type: string }
 *     responses:
 *       200:
 *         description: Profile updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /portal/me/password:
 *   put:
 *     tags:
 *       - Customer Portal
 *     summary: Change customer password
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 6 }
 *     responses:
 *       200:
 *         description: Password changed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /portal/dashboard:
 *   get:
 *     tags:
 *       - Customer Portal
 *     summary: Customer dashboard summary
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Customer dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /portal/vehicles:
 *   get:
 *     tags:
 *       - Customer Portal
 *     summary: List customer's vehicles
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Customer vehicles
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   post:
 *     tags:
 *       - Customer Portal
 *     summary: Register a new vehicle
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plateNumber, make, model, year]
 *             properties:
 *               plateNumber: { type: string }
 *               make: { type: string }
 *               model: { type: string }
 *               year: { type: integer }
 *               color: { type: string }
 *               vin: { type: string }
 *     responses:
 *       201:
 *         description: Vehicle registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /portal/job-cards:
 *   get:
 *     tags:
 *       - Customer Portal
 *     summary: List customer's job cards
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Customer job cards
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /portal/appointments:
 *   get:
 *     tags:
 *       - Customer Portal
 *     summary: List customer's appointments
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Customer appointments
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   post:
 *     tags:
 *       - Customer Portal
 *     summary: Book a service appointment
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
 *               scheduledDate: { type: string, format: date-time }
 *               serviceType: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Appointment booked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /portal/invoices:
 *   get:
 *     tags:
 *       - Customer Portal
 *     summary: List customer's invoices
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Customer invoices
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /portal/estimates/{id}/approval:
 *   post:
 *     tags:
 *       - Customer Portal
 *     summary: Approve or reject a repair estimate
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
 *         description: Estimate decision submitted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /portal/credit:
 *   get:
 *     tags:
 *       - Customer Portal
 *     summary: Get customer's credit account
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Credit account details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /portal/credit/applications:
 *   get:
 *     tags:
 *       - Customer Portal
 *     summary: List customer's credit applications
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Credit applications list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
router.get('/me', controller.getMe);
router.put('/me', validateRequest(updateProfileSchema), controller.updateProfile);
router.put('/me/password', validateRequest(changePasswordSchema), controller.changePassword);

router.get('/dashboard', controller.getDashboard);

router.get('/vehicles', controller.getVehicles);
router.post('/vehicles', validateRequest(createPortalVehicleSchema), controller.registerVehicle);
router.get('/vehicles/:id', validateRequest(idParamSchema), controller.getVehicle);

router.get('/job-cards', validateRequest(jobCardListQuerySchema), controller.getJobCards);
router.get('/job-cards/:id', validateRequest(idParamSchema), controller.getJobCard);

router.get('/appointments', controller.getAppointments);
router.post('/appointments', validateRequest(createPortalAppointmentSchema), controller.bookAppointment);

router.get('/services', controller.getServices);

router.get('/invoices', controller.getInvoices);
router.get('/invoices/:id', validateRequest(idParamSchema), controller.getInvoice);

router.post('/estimates/:id/approval', validateRequest(estimateApprovalSchema), controller.submitEstimateApproval);

router.get('/credit', controller.getCredit);
router.get('/credit/applications', controller.getCreditApplications);
router.post('/credit/applications/:id/decision', validateRequest(creditDecisionSchema), controller.decideCreditApplication);

export default router;

