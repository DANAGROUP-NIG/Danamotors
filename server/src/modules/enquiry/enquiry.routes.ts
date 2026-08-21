import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { EnquiryController } from './enquiry.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createEnquirySchema,
  reviewEnquirySchema,
  enquiryIdParamSchema,
} from './enquiry.validation';

const router = Router();
const controller = new EnquiryController();

// ── Public rate-limited enquiry submission ───────────────────────────────────
const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { status: 'error', statusCode: 429, message: 'Too many enquiries. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @openapi
 * /enquiries:
 *   post:
 *     tags: [Enquiries]
 *     summary: Submit a new online enquiry (public)
 *     description: >
 *       Rate-limited public endpoint for customers to submit a service enquiry.
 *       Max 5 requests per 15 minutes per IP.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, phoneNumber, serviceDescription, branchId]
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Chukwuemeka
 *               lastName:
 *                 type: string
 *                 example: Obi
 *               email:
 *                 type: string
 *                 format: email
 *                 example: emeka@example.com
 *               phoneNumber:
 *                 type: string
 *                 example: "+2348012345678"
 *               vehicleMake:
 *                 type: string
 *                 example: Honda
 *               vehicleModel:
 *                 type: string
 *                 example: Civic
 *               vehicleYear:
 *                 type: integer
 *                 example: 2023
 *               vehicleRegNumber:
 *                 type: string
 *                 example: ABC-123-DE
 *               serviceDescription:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 500
 *                 example: Brake pads need replacement on front axle
 *               preferredDate:
 *                 type: string
 *                 format: date-time
 *               branchId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Enquiry submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         enquiry:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                               format: uuid
 *                             status:
 *                               type: string
 *                               example: Pending
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *       429:
 *         description: Rate limit exceeded
 *       400:
 *         $ref: '#/components/schemas/ValidationErrorResponse'
 */
router.post('/', enquiryLimiter, validateRequest(createEnquirySchema), controller.createEnquiry);
router.get('/', requirePermission(PERMISSIONS.SERVICE_READ), controller.listEnquiries);

// ── Authenticated staff endpoints ────────────────────────────────────────────
router.use(authMiddleware);

/**
 * @openapi
 * /enquiries:
 *   get:
 *     tags: [Enquiries]
 *     summary: List enquiries
 *     description: >
 *       Retrieve a paginated list of enquiries. Non-admin staff are scoped to their own branch.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *       - in: query
 *         name: branchId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by branch (ignored for non-admin staff)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, Approved, Rejected, Converted]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or phone
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Paginated enquiry list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         enquiries:
 *                           type: array
 *                           items:
 *                             type: object
 *                         pagination:
 *                           $ref: '#/components/schemas/PaginationMeta'
 *       401:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/',      requirePermission(PERMISSIONS.SERVICE_READ),   controller.listEnquiries);

/**
 * @openapi
 * /enquiries/{id}:
 *   get:
 *     tags: [Enquiries]
 *     summary: Get enquiry by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Enquiry details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         enquiry:
 *                           type: object
 *       404:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id',   requirePermission(PERMISSIONS.SERVICE_READ),   validateRequest(enquiryIdParamSchema), controller.getEnquiry);

/**
 * @openapi
 * /enquiries/{id}/review:
 *   patch:
 *     tags: [Enquiries]
 *     summary: Approve or reject an enquiry
 *     description: >
 *       Approving an enquiry converts it into a ServiceAppointment (source: OnlineBooking).
 *       Rejecting marks the enquiry as Rejected. Only Pending enquiries can be reviewed.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *               reviewNotes:
 *                 type: string
 *                 maxLength: 500
 *               customerId:
 *                 type: string
 *                 format: uuid
 *                 description: Required when action=approve
 *               vehicleId:
 *                 type: string
 *                 format: uuid
 *                 description: Required when action=approve
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *                 description: Required when action=approve
 *               serviceId:
 *                 type: string
 *                 format: uuid
 *               durationMins:
 *                 type: integer
 *                 example: 120
 *               notes:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Enquiry reviewed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         enquiry:
 *                           type: object
 *                         appointment:
 *                           $ref: '#/components/schemas/JobCardDTO'
 *       400:
 *         $ref: '#/components/schemas/ValidationErrorResponse'
 *       404:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:id/review', requirePermission(PERMISSIONS.SERVICE_UPDATE), validateRequest(reviewEnquirySchema), controller.reviewEnquiry);

/**
 * @openapi
 * /enquiries/{id}:
 *   delete:
 *     tags: [Enquiries]
 *     summary: Delete an enquiry
 *     description: >
 *       SuperAdmin/Admin only. Cannot delete enquiries that have already been approved.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Enquiry deleted
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Enquiry deleted
 *       403:
 *         $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:id', requirePermission(PERMISSIONS.SERVICE_DELETE), validateRequest(enquiryIdParamSchema), controller.deleteEnquiry);

export default router;
