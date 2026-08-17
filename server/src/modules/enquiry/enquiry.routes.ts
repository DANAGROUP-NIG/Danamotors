import { Router } from 'express';
import { EnquiryController } from './enquiry.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createEnquirySchema,
  enquiryIdParamSchema,
  reviewEnquirySchema,
  listEnquiriesQuerySchema,
} from '../service/service.validation';

const router = Router();
const controller = new EnquiryController();

// Simple in-memory rate limiter for the public endpoint
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 requests per window

function publicRateLimiter(req: any, res: any, next: any) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({
      status: 'error',
      statusCode: 429,
      message: 'Too many requests. Please try again later.',
    });
    return;
  }

  next();
}

// Public endpoint — no auth, rate-limited
router.post(
  '/',
  publicRateLimiter,
  validateRequest(createEnquirySchema),
  controller.createEnquiry,
);

// All routes below require authentication
router.use(authMiddleware);

router.get(
  '/',
  requirePermission(PERMISSIONS.SERVICE_READ),
  validateRequest(listEnquiriesQuerySchema),
  controller.listEnquiries,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.SERVICE_READ),
  validateRequest(enquiryIdParamSchema),
  controller.getEnquiry,
);

router.patch(
  '/:id/review',
  requirePermission(PERMISSIONS.SERVICE_UPDATE),
  validateRequest(reviewEnquirySchema),
  controller.reviewEnquiry,
);

export default router;
