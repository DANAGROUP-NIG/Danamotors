import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import { getSettingsHandler, lookupHandler, reportHandler, requireAnyReportPermission, saveSettingsHandler } from './reports.controller';
import { saveSettingsSchema } from './settings';
import { REPORTS } from './reports.registry';
import { lookupSchema } from './lookups';

// API docs for these routes are generated from the registry (see reports.openapi.ts).
const router = Router();
router.use(authMiddleware);

router.get('/lookups/:source', requireAnyReportPermission, validateRequest(lookupSchema), lookupHandler);
router.get('/settings', requireAnyReportPermission, getSettingsHandler);
router.put('/settings', requirePermission(PERMISSIONS.REPORT_SETTINGS), validateRequest(saveSettingsSchema), saveSettingsHandler);

for (const definition of REPORTS) {
  router.get(
    `/${definition.slug}`,
    requirePermission(definition.permission),
    validateRequest(z.object({ query: definition.query as z.ZodTypeAny })),
    reportHandler(definition),
  );
}

export default router;
