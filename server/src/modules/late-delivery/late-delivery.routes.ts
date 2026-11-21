import { NextFunction, Request, Response, Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { canAccessAllBranches, requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import { UnauthorizedError } from '../../shared/errors/appError';
import { LateDeliveryService, type LateActor } from './late-delivery.service';
import { lateDetailSchema, lateFindSchema, lateListSchema, lateSaveSchema } from './late-delivery.validation';

// Endpoint docs and examples: late-delivery.openapi.ts.
const router = Router();
const service = new LateDeliveryService();
router.use(authMiddleware);

function actor(req: Request): LateActor {
  if (!req.user) throw new UnauthorizedError();
  return { userId: req.user.userId, branchId: req.user.branchId ?? null, allBranches: canAccessAllBranches(req.user) };
}

type Handler = (req: Request) => Promise<unknown>;
const send = (handler: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ status: 'success', statusCode: 200, data: await handler(req) });
  } catch (error) {
    next(error);
  }
};
const entry = requirePermission(PERMISSIONS.LATE_REASON_UPDATE);

router.get('/reasons', requirePermission(PERMISSIONS.JOBCARD_READ), send(() => service.reasons()));
router.get('/', entry, validateRequest(lateListSchema), send((req) => service.list(lateListSchema.parse({ query: req.query }).query, actor(req))));
router.get('/find', entry, validateRequest(lateFindSchema), send((req) => service.find(lateFindSchema.parse({ query: req.query }).query, actor(req))));
router.get('/:jobCardId', entry, validateRequest(lateDetailSchema), send((req) => {
  const { params, query } = lateDetailSchema.parse({ params: req.params, query: req.query });
  return service.detail(params.jobCardId, query.kind, actor(req));
}));
router.put('/:jobCardId', entry, validateRequest(lateSaveSchema), send((req) => {
  const { params, body } = lateSaveSchema.parse({ params: req.params, body: req.body });
  return service.save(params.jobCardId, body, actor(req));
}));

export default router;
