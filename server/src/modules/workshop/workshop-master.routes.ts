import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireRole } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { ROLES } from '../../shared/constants/roles';
import { WorkshopMasterService } from './workshop-master.service';
import { createMasterSchema, updateMasterSchema, listMasterSchema, defectEstimateSchema, defectEstimateParamsSchema } from './workshop-master.validation';
const router = Router();
const service = new WorkshopMasterService();
router.use(authMiddleware);

router.get('/', validateRequest(listMasterSchema), async (req, res, next) => {
  try {
    res.json({
      status: 'success',

      data: await service.list(listMasterSchema.parse({
        query: req.query,
      }).query),
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/',
  requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validateRequest(createMasterSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({
        status: 'success',

        data: {
          item: await service.create(req.body),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:id',
  requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validateRequest(updateMasterSchema),
  async (req, res, next) => {
    try {
      res.json({
        status: 'success',

        data: {
          item: await service.update(req.params.id, req.body),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /workshop-masters/{id}/model-estimates:
 *   get:
 *     tags: [Workshop]
 *     summary: Model-wise part, oil and labour estimates of a defect (legacy trouble)
 * /workshop-masters/{id}/model-estimates/{modelId}:
 *   put:
 *     tags: [Workshop]
 *     summary: Set a defect's estimate for one model
 *   delete:
 *     tags: [Workshop]
 *     summary: Remove a defect's estimate for one model
 */
router.get('/:id/model-estimates', validateRequest(defectEstimateParamsSchema), async (req, res, next) => {
  try {
    res.json({
      status: 'success',

      data: {
        items: await service.listEstimates(req.params.id),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/:id/model-estimates/:modelId',
  requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validateRequest(defectEstimateSchema),
  async (req, res, next) => {
    try {
      res.json({
        status: 'success',

        data: {
          item: await service.saveEstimate(req.params.id, req.params.modelId, req.body),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id/model-estimates/:modelId',
  requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validateRequest(defectEstimateParamsSchema),
  async (req, res, next) => {
    try {
      await service.removeEstimate(req.params.id, req.params.modelId!);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
