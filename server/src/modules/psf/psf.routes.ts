import { NextFunction, Request, Response, Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { canAccessAllBranches, requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import { UnauthorizedError } from '../../shared/errors/appError';
import { PsfService, type PsfActor } from './psf.service';
import { psfCallSchema, psfDetailSchema, psfFindSchema, psfListSchema } from './psf.validation';

// Endpoint docs and examples: psf.openapi.ts.
const router = Router();
const service = new PsfService();
router.use(authMiddleware);

function actor(req: Request): PsfActor {
  if (!req.user) throw new UnauthorizedError();
  return { userId: req.user.userId, branchId: req.user.branchId ?? null, allBranches: canAccessAllBranches(req.user) };
}

type Handler = (req: Request) => Promise<unknown>;
const send = (handler: Handler, statusCode = 200) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(statusCode).json({ status: 'success', statusCode, data: await handler(req) });
  } catch (error) {
    next(error);
  }
};
const read = requirePermission(PERMISSIONS.PSF_READ);

router.get('/service-types', read, send(() => service.serviceTypes()));
router.get('/jobs', read, validateRequest(psfListSchema), send((req) => service.list(psfListSchema.parse({ query: req.query }).query, actor(req))));
router.get('/find', read, validateRequest(psfFindSchema), send((req) => service.find(psfFindSchema.parse({ query: req.query }).query, actor(req))));
router.get('/jobs/:jobCardId', read, validateRequest(psfDetailSchema), send((req) => service.detail(psfDetailSchema.parse({ params: req.params }).params.jobCardId, actor(req))));
router.post(
  '/jobs/:jobCardId/calls',
  requirePermission(PERMISSIONS.PSF_UPDATE),
  validateRequest(psfCallSchema),
  send((req) => {
    const { params, body } = psfCallSchema.parse({ params: req.params, body: req.body });
    return service.recordCall(params.jobCardId, body, actor(req));
  }, 201),
);

export default router;
