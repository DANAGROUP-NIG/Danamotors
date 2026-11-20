import { NextFunction, Request, Response, Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import { UnauthorizedError } from '../../shared/errors/appError';
import { cscActor } from './csc.actor';
import { CscService } from './csc.service';
import {
  branchQuerySchema,
  caseIdSchema,
  caseListSchema,
  createReasonSchema,
  followUpSchema,
  generateSchema,
  reasonIdSchema,
  reasonListSchema,
  rulesQuerySchema,
  saveRulesSchema,
  updateReasonSchema,
} from './csc.validation';

// Endpoint docs and examples: csc.openapi.ts.
const router = Router();
const service = new CscService();
router.use(authMiddleware);

type Handler = (req: Request) => Promise<unknown>;
const send = (handler: Handler, status = 200) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(status).json({ status: 'success', statusCode: status, data: await handler(req) });
  } catch (error) {
    next(error);
  }
};
const userId = (req: Request) => {
  if (!req.user) throw new UnauthorizedError();
  return req.user.userId;
};
const masterRead = requirePermission(PERMISSIONS.CSC_MASTER_READ);
const masterUpdate = requirePermission(PERMISSIONS.CSC_MASTER_UPDATE);
const caseRead = requirePermission(PERMISSIONS.CSC_CASE_READ);

// Masters
router.get('/rules/models', masterRead, send(() => service.ruleModels()));
router.get('/rules', masterRead, validateRequest(rulesQuerySchema), send((req) => service.rulesForModel(rulesQuerySchema.parse({ query: req.query }).query.modelId)));
router.put('/rules', masterUpdate, validateRequest(saveRulesSchema), send((req) => service.saveRules(saveRulesSchema.parse({ body: req.body }).body, userId(req))));
router.get('/service-types', masterRead, send(() => service.serviceTypes()));
// Closure reasons are read by the follow-up screens too.
router.get('/close-reasons', requireAnyPermission(PERMISSIONS.CSC_MASTER_READ, PERMISSIONS.CSC_CASE_READ), validateRequest(reasonListSchema), send((req) => service.reasons(req.query.includeInactive === 'true')));
router.post('/close-reasons', masterUpdate, validateRequest(createReasonSchema), send((req) => service.createReason(createReasonSchema.parse({ body: req.body }).body, userId(req)), 201));
router.put('/close-reasons/:id', masterUpdate, validateRequest(updateReasonSchema), send((req) => service.updateReason(req.params.id, updateReasonSchema.parse({ params: req.params, body: req.body }).body, userId(req))));
router.delete('/close-reasons/:id', masterUpdate, validateRequest(reasonIdSchema), send((req) => service.deleteReason(req.params.id, userId(req))));

// Cases
router.post('/cases/generate', requirePermission(PERMISSIONS.CSC_CASE_GENERATE), validateRequest(generateSchema), send((req) => service.generate(generateSchema.parse({ body: req.body }).body, cscActor(req))));
router.get('/cases', caseRead, validateRequest(caseListSchema), send((req) => service.list(caseListSchema.parse({ query: req.query }).query, cscActor(req))));
router.get('/summary', caseRead, validateRequest(branchQuerySchema), send((req) => service.summary(cscActor(req), branchQuerySchema.parse({ query: req.query }).query.branchId)));
router.get('/staff', caseRead, validateRequest(branchQuerySchema), send((req) => service.staff(cscActor(req), branchQuerySchema.parse({ query: req.query }).query.branchId)));
router.get('/cases/:id', caseRead, validateRequest(caseIdSchema), send((req) => service.detail(req.params.id, cscActor(req))));
router.put(
  '/cases/:id/follow-up',
  requirePermission(PERMISSIONS.CSC_FOLLOWUP_UPDATE),
  validateRequest(followUpSchema),
  send((req) => service.saveFollowUp(req.params.id, followUpSchema.parse({ params: req.params, body: req.body }).body, cscActor(req))),
);

export default router;
