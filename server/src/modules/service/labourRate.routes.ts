import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  applyLabourToModels,
  applyToModelsSchema,
  bulkUpdateRates,
  bulkUpdateSchema,
  copyModelRates,
  copyModelSchema,
  editRate,
  editRateSchema,
  gridQuerySchema,
  listRates,
  rateFilterOptions,
} from './labourRateBulk';

/**
 * Model labour rate maintenance (Settings → Model labour rates), mounted at /api/service/labour-rates.
 * Reads need `labour-item:read`; every write needs `labour-rate:update`. Bulk writes take `dryRun: true`
 * for a preview and, to apply, the previewed count as `expected`. See doc/labour-rates.md.
 */
const router = Router();
router.use(authMiddleware);

const csv = z.preprocess((v) => (typeof v === 'string' && v ? v.split(',') : undefined), z.array(z.string().uuid()).max(500).optional());
const bool = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : undefined), z.boolean().optional());
const gridQuery = gridQuerySchema.extend({ modelIds: csv, labourItemIds: csv, active: bool });

router.get('/grid', requirePermission(PERMISSIONS.LABOUR_ITEM_READ), validateRequest(z.object({ query: gridQuery })), async (req, res, next) => {
  try {
    res.json({ status: 'success', data: await listRates(gridQuery.parse(req.query)) });
  } catch (error) {
    next(error);
  }
});

router.get('/options', requirePermission(PERMISSIONS.LABOUR_ITEM_READ), async (_req, res, next) => {
  try {
    res.json({ status: 'success', data: await rateFilterOptions() });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requirePermission(PERMISSIONS.LABOUR_RATE_UPDATE),
  validateRequest(z.object({ params: z.object({ id: z.string().uuid() }), body: editRateSchema })), async (req, res, next) => {
    try {
      res.json({ status: 'success', data: { rate: await editRate(req.params.id, req.body) } });
    } catch (error) {
      next(error);
    }
  });

router.post('/bulk', requirePermission(PERMISSIONS.LABOUR_RATE_UPDATE), validateRequest(z.object({ body: bulkUpdateSchema })), async (req, res, next) => {
  try {
    res.json({ status: 'success', data: await bulkUpdateRates(req.user!.userId, bulkUpdateSchema.parse(req.body)) });
  } catch (error) {
    next(error);
  }
});

router.post('/apply-to-models', requirePermission(PERMISSIONS.LABOUR_RATE_UPDATE), validateRequest(z.object({ body: applyToModelsSchema })), async (req, res, next) => {
  try {
    res.json({ status: 'success', data: await applyLabourToModels(req.user!.userId, applyToModelsSchema.parse(req.body)) });
  } catch (error) {
    next(error);
  }
});

router.post('/copy-model', requirePermission(PERMISSIONS.LABOUR_RATE_UPDATE), validateRequest(z.object({ body: copyModelSchema })), async (req, res, next) => {
  try {
    res.json({ status: 'success', data: await copyModelRates(req.user!.userId, copyModelSchema.parse(req.body)) });
  } catch (error) {
    next(error);
  }
});

export default router;
