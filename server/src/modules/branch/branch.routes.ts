import { Router } from 'express';
import { BranchController } from './branch.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createBranchSchema,
  updateBranchSchema,
  branchIdParamSchema,
} from './branch.validation';

const router = Router();
const controller = new BranchController();

router.get('/', controller.getBranches);

router.use(authMiddleware);

router.get('/:id', requirePermission(PERMISSIONS.BRANCH_READ), validateRequest(branchIdParamSchema), controller.getBranch);
router.post('/', requirePermission(PERMISSIONS.BRANCH_CREATE), validateRequest(createBranchSchema), controller.createBranch);
router.put('/:id', requirePermission(PERMISSIONS.BRANCH_UPDATE), validateRequest(updateBranchSchema), controller.updateBranch);
router.delete('/:id', requirePermission(PERMISSIONS.BRANCH_DELETE), validateRequest(branchIdParamSchema), controller.deleteBranch);

export default router;
