import { NextFunction, Request, Response, Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import { repeatActor } from './repeat-job.actor';
import { RepeatJobService } from './repeat-job.service';
import { repeatByJobSchema, repeatIdSchema, repeatListSchema, repeatReviewSchema } from './repeat-job.validation';

// Endpoint docs and examples: repeat-job.openapi.ts.
const router = Router();
const service = new RepeatJobService();
router.use(authMiddleware);

type Handler = (req: Request) => Promise<unknown>;
const send = (handler: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ status: 'success', statusCode: 200, data: await handler(req) });
  } catch (error) {
    next(error);
  }
};
const read = requirePermission(PERMISSIONS.REPEAT_JOB_READ);

router.get('/reasons', requirePermission(PERMISSIONS.JOBCARD_READ), send(() => service.reasons()));
router.get('/', read, validateRequest(repeatListSchema), send((req) => service.list(repeatListSchema.parse({ query: req.query }).query, repeatActor(req))));
router.get('/job/:jobCardId', requirePermission(PERMISSIONS.JOBCARD_READ), validateRequest(repeatByJobSchema), send((req) => service.forJob(req.params.jobCardId, repeatActor(req))));
router.get('/:id', read, validateRequest(repeatIdSchema), send((req) => service.detail(req.params.id, repeatActor(req))));
router.put(
  '/:id/review',
  requirePermission(PERMISSIONS.REPEAT_JOB_REVIEW),
  validateRequest(repeatReviewSchema),
  send((req) => service.review(req.params.id, repeatReviewSchema.parse({ params: req.params, body: req.body }).body, repeatActor(req))),
);

export default router;
