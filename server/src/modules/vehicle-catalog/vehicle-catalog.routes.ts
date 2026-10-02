import { createHash } from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import { validateRequest } from '../../middleware/requestValidator';
import { VehicleCatalogService } from './vehicle-catalog.service';
const router = Router();
const service = new VehicleCatalogService();
const ttl = 86_400_000;
const cache = new Map<string, { expires: number; body: string; etag: string }>();
const pending = new Map<string, Promise<{ expires: number; body: string; etag: string }>>();
async function respond(_req: Request, res: Response, next: NextFunction, key: string, load: () => Promise<unknown>) {
  try {
    let entry = cache.get(key);
    if (!entry || entry.expires < Date.now()) {
      let request = pending.get(key);
      if (!request) {
        request = load().then(data => {
          const body = JSON.stringify({ status: 'success', data });
          const result = { body, expires: Date.now() + ttl, etag: `"${createHash('sha256').update(body).digest('hex')}"` };
          if (cache.size >= 256) cache.delete(cache.keys().next().value!);
          cache.set(key, result); return result;
        }).finally(() => pending.delete(key));
        pending.set(key, request);
      }
      entry = await request;
    }
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('ETag', entry.etag);
    res.type('application/json').send(entry.body); // Express handles If-None-Match / 304.
  } catch (error) { next(error); }
}
router.use(authMiddleware);
/**
 * @openapi
 * /vehicle-catalog/models:
 *   get:
 *     tags: [Vehicles]
 *     summary: Compact cached vehicle models (no engine specifications)
 *     responses:
 *       200: { description: Model list in the standard data envelope; cached for one day with ETag }
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
