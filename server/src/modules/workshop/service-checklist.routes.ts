import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireRole } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { ROLES } from '../../shared/constants/roles';
import { ServiceChecklistService } from './service-checklist.service';
import {
  checklistIdParamSchema,
  createChecklistLineSchema,
  createChecklistMileageSchema,
  listChecklistLinesSchema,
  listChecklistMileagesSchema,
  updateChecklistLineSchema,
} from './service-checklist.validation';

const router = Router();
const service = new ServiceChecklistService();
const manage = requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN);
router.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Service Checklists
 *     description: |
 *       Legacy Service Checklist, Service Checklist Definition and Mileage Wise Service Checklist Definition
 *       masters. The checklist itself is a CHECKLIST workshop master. Lines list the parts (quantity, priced at
 *       the part's retail rate) and labour (amount) per model, for one variant or all variants (no variantId).
 *
 * /service-checklists/lines:
 *   get:
 *     tags: [Service Checklists]
 *     summary: Lines of a checklist for a model (and variant), with estimated part, oil and labour amounts
 *   post:
 *     tags: [Service Checklists]
 *     summary: Add a part (kind PART, quantity) or labour (kind LABOUR, amount) line
 * /service-checklists/lines/{id}:
 *   put:
 *     tags: [Service Checklists]
 *     summary: Change a part line's quantity or a labour line's amount
 *   delete:
 *     tags: [Service Checklists]
 *     summary: Remove a line
 * /service-checklists/mileages:
 *   get:
 *     tags: [Service Checklists]
 *     summary: Checklist to follow at each mileage for a model (and variant), with estimates
 *   post:
 *     tags: [Service Checklists]
 *     summary: Set the checklist to follow at a mileage
 * /service-checklists/mileages/{id}:
 *   delete:
 *     tags: [Service Checklists]
 *     summary: Remove a mileage row
 */
router.get('/lines', validateRequest(listChecklistLinesSchema), async (req, res, next) => {
  try {
    const query = listChecklistLinesSchema.parse({
      query: req.query,
    }).query;

    res.json({
      status: 'success',
      data: await service.listLines(query.checklistId, query.modelId, query.variantId),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/lines', manage, validateRequest(createChecklistLineSchema), async (req, res, next) => {
  try {
    res.status(201).json({
      status: 'success',

      data: {
        item: await service.createLine(req.body),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/lines/:id', manage, validateRequest(updateChecklistLineSchema), async (req, res, next) => {
  try {
    res.json({
      status: 'success',

      data: {
        item: await service.updateLine(req.params.id, req.body),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/lines/:id', manage, validateRequest(checklistIdParamSchema), async (req, res, next) => {
  try {
    await service.removeLine(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/mileages', validateRequest(listChecklistMileagesSchema), async (req, res, next) => {
  try {
    const query = listChecklistMileagesSchema.parse({
      query: req.query,
    }).query;

    res.json({
      status: 'success',

      data: {
        items: await service.listMileages(query.modelId, query.variantId),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/mileages', manage, validateRequest(createChecklistMileageSchema), async (req, res, next) => {
  try {
    res.status(201).json({
      status: 'success',

      data: {
        item: await service.createMileage(req.body),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/mileages/:id', manage, validateRequest(checklistIdParamSchema), async (req, res, next) => {
  try {
    await service.removeMileage(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
