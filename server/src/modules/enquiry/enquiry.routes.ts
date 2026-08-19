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
 *     tags:
 *       - Enquiries
 *     summary: Submit a new enquiry (public, rate limited)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phoneNumber, message]
 *             properties:
 *               name: { type: string, example: "John Doe" }
 *               email: { type: string, format: email, example: "john@example.com" }
 *               phoneNumber: { type: string, example: "+2348012345678" }
 *               vehicle: { type: object, nullable: true }
 *               branchId: { type: string, nullable: true }
 *               message: { type: string, example: "I'd like to book a service" }
 *     responses:
 *       201:
 *         description: Enquiry created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       429:
 *         description: Too many requests
 *
 *   get:
 *     tags:
 *       - Enquiries
 *     summary: List enquiries (staff)
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
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated list of enquiries
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
router.post('/', enquiryLimiter, validateRequest(createEnquirySchema), controller.createEnquiry);
router.get('/', requirePermission(PERMISSIONS.SERVICE_READ), controller.listEnquiries);

// ── Authenticated staff endpoints ────────────────────────────────────────────
router.use(authMiddleware);

/**
 * @openapi
 * /enquiries/{id}:
 *   get:
 *     tags:
 *       - Enquiries
 *     summary: Get enquiry by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Enquiry details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /enquiries/{id}/review:
 *   patch:
 *     tags:
 *       - Enquiries
 *     summary: Review (approve/reject) an enquiry
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: ["APPROVED","REJECTED"] }
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Enquiry updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /enquiries/{id}:
 *   delete:
 *     tags:
 *       - Enquiries
 *     summary: Delete an enquiry
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Enquiry deleted
 */
router.get('/:id', requirePermission(PERMISSIONS.SERVICE_READ), validateRequest(enquiryIdParamSchema), controller.getEnquiry);
router.patch('/:id/review', requirePermission(PERMISSIONS.SERVICE_UPDATE), validateRequest(reviewEnquirySchema), controller.reviewEnquiry);
router.delete('/:id', requirePermission(PERMISSIONS.SERVICE_DELETE), validateRequest(enquiryIdParamSchema), controller.deleteEnquiry);

export default router;
