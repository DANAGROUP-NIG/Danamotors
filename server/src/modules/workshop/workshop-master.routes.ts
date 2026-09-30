import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireRole } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { ROLES } from '../../shared/constants/roles';
import { WorkshopMasterService } from './workshop-master.service';
import { createMasterSchema, updateMasterSchema, listMasterSchema } from './workshop-master.validation';
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

export default router;
