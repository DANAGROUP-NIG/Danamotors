import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { lookupHandler, reportHandler, requireAnyReportPermission } from './reports.controller';
import { REPORTS } from './reports.registry';
import { lookupSchema } from './lookups';

// API docs for these routes are generated from the registry (see reports.openapi.ts).
const router = Router();
router.use(authMiddleware);

router.get('/lookups/:source', requireAnyReportPermission, validateRequest(lookupSchema), lookupHandler);

for (const definition of REPORTS) {
  router.get(
    `/${definition.slug}`,
    requirePermission(definition.permission),
    validateRequest(z.object({ query: definition.query as z.ZodTypeAny })),
    reportHandler(definition),
  );
}

export default router;
