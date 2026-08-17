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

router.post('/', enquiryLimiter, validateRequest(createEnquirySchema), controller.createEnquiry);

// ── Authenticated staff endpoints ────────────────────────────────────────────
router.use(authMiddleware);

router.get('/',      requirePermission(PERMISSIONS.SERVICE_READ),   controller.listEnquiries);
router.get('/:id',   requirePermission(PERMISSIONS.SERVICE_READ),   validateRequest(enquiryIdParamSchema), controller.getEnquiry);
router.patch('/:id/review', requirePermission(PERMISSIONS.SERVICE_UPDATE), validateRequest(reviewEnquirySchema), controller.reviewEnquiry);
router.delete('/:id', requirePermission(PERMISSIONS.SERVICE_DELETE), validateRequest(enquiryIdParamSchema), controller.deleteEnquiry);

export default router;
