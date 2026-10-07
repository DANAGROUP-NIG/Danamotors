import { createHash } from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import { validateRequest } from '../../middleware/requestValidator';
import { VehicleCatalogService } from './vehicle-catalog.service';
import { WorkshopVehicleCatalog } from './workshop-vehicle-catalog';
const router = Router();
const service = new VehicleCatalogService();
const workshopCatalog = new WorkshopVehicleCatalog();
const ttl = 60_000;
const cache = new Map<string, { expires: number; body: string; etag: string; cacheable: boolean }>();
const pending = new Map<string, Promise<{ expires: number; body: string; etag: string; cacheable: boolean }>>();
async function respond(req: Request, res: Response, next: NextFunction, key: string, load: () => Promise<unknown>) {
  try {
    const refresh = req.query?.refresh === '1';
    const pendingKey = refresh ? `${key}:refresh` : key;
    let entry = refresh ? undefined : cache.get(key);
    if (!entry || entry.expires < Date.now()) {
      let request = pending.get(pendingKey);
      if (!request) {
        request = load().then(data => {
          const body = JSON.stringify({ status: 'success', data });
          const cacheable = !Array.isArray(data) || data.length > 0;
          const result = { body, cacheable, expires: Date.now() + ttl, etag: `"${createHash('sha256').update(body).digest('hex')}"` };
          if (cache.size >= 256) cache.delete(cache.keys().next().value!);
          if (cacheable) cache.set(key, result);
          else cache.delete(key);
          return result;
        }).finally(() => pending.delete(pendingKey));
        pending.set(pendingKey, request);
      }
      entry = await request;
    }
    res.set('Cache-Control', refresh || !entry.cacheable ? 'private, no-store' : 'private, max-age=60');
    res.set('ETag', entry.etag);
    res.type('application/json').send(entry.body); // Express handles If-None-Match / 304.
  } catch (error) { next(error); }
}
router.use(authMiddleware);
const variantSearchSchema = z.object({ query: z.object({
  search: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().positive().max(50).default(20),
}) });
/**
 * @openapi
 * /vehicle-catalog/workshop-variants:
 *   get:
 *     tags: [Vehicles]
 *     summary: Bounded active workshop variant search by make, model, product or variant
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: search, schema: { type: string, maxLength: 100 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 50, default: 20 } }
 *     responses:
 *       200: { description: Compact data.items; no count query or engine specifications }
 * /vehicle-catalog/workshop-variants/{id}:
 *   get:
 *     tags: [Vehicles]
 *     summary: Saved catalogue variant and its model colours, including inactive entries for display
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: data.item contains hierarchy labels and colours }
 *       404: { description: Catalogue variant not found }
 */
router.get('/workshop-variants', validateRequest(variantSearchSchema), async (req, res, next) => {
  try {
    const query = variantSearchSchema.parse({ query: req.query }).query;
    res.set('Cache-Control', 'private, no-cache');
    res.json({ status: 'success', data: await workshopCatalog.search(query.search, query.limit) });
  } catch (error) { next(error); }
});
router.get('/workshop-variants/:id', validateRequest(z.object({ params: z.object({ id: z.string().uuid() }) })), async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-cache');
    res.json({ status: 'success', data: { item: await workshopCatalog.detail(req.params.id) } });
  } catch (error) { next(error); }
});
/**
 * @openapi
 * /vehicle-catalog/models:
 *   get:
 *     tags: [Vehicles]
 *     summary: Compact cached vehicle models (no engine specifications)
 *     responses:
 *       200: { description: Model list in the standard data envelope; cached for one minute with ETag }
 *       304: { description: Not modified }
 * /vehicle-catalog/models/{id}/options:
 *   get:
 *     tags: [Vehicles]
 *     summary: Generations and compact engine options for one model
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Generations and engines without specs }
 *       404: { description: Unknown model }
 */
router.get('/models', (req, res, next) => { void respond(req, res, next, 'models', () => service.models()); });
router.get('/models/:id/options', validateRequest(z.object({ params: z.object({ id: z.string().uuid() }) })), (req, res, next) => {
  void respond(req, res, next, req.params.id, () => service.options(req.params.id));
});
export default router;
