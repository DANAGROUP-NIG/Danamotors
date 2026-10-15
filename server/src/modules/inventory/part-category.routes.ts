import { Router } from 'express';
import { requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  PartCategoryService,
  createPartCategorySchema,
  partCategoryBranchSchema,
  partCategoryCodeSchema,
  updatePartCategorySchema,
} from './part-category.service';

// Mounted under /inventory/part-categories (the list itself is GET /inventory/part-categories).
const router = Router();
const service = new PartCategoryService();

/**
 * @openapi
 * /inventory/part-categories:
 *   post:
 *     tags: [Inventory]
 *     summary: Create a part category (legacy Part Category Master)
 * /inventory/part-categories/{code}:
 *   get:
 *     tags: [Inventory]
 *     summary: A part category with each branch's discount, handling, direct and operational cost %
 *   put:
 *     tags: [Inventory]
 *     summary: Update description, multiplier or active flag (does not reprice parts)
 * /inventory/part-categories/{code}/branches/{branchId}:
 *   put:
 *     tags: [Inventory]
 *     summary: Set a branch's percentages for the category
 */
router.get('/:code', requirePermission(PERMISSIONS.SPAREPART_READ), validateRequest(partCategoryCodeSchema), async (req, res, next) => {
  try {
    res.json({
      status: 'success',

      data: {
        category: await service.get(req.params.code),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission(PERMISSIONS.SPAREPART_CREATE), validateRequest(createPartCategorySchema), async (req, res, next) => {
  try {
    res.status(201).json({
      status: 'success',

      data: {
        category: await service.create(req.body),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:code', requirePermission(PERMISSIONS.SPAREPART_UPDATE), validateRequest(updatePartCategorySchema), async (req, res, next) => {
  try {
    res.json({
      status: 'success',

      data: {
        category: await service.update(req.params.code, req.body),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:code/branches/:branchId', requirePermission(PERMISSIONS.SPAREPART_UPDATE), validateRequest(partCategoryBranchSchema), async (req, res, next) => {
  try {
    res.json({
      status: 'success',

      data: {
        setting: await service.saveBranch(req.params.code, req.params.branchId, req.body),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
