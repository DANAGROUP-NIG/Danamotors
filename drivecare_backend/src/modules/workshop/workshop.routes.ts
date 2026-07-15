import { Router } from 'express';
import { WorkshopController } from './workshop.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  assignTechnicianSchema,
  updateJobProgressSchema,
  qcUpdateSchema,
  jobCardIdParamSchema,
} from './workshop.validation';

const router = Router();
const controller = new WorkshopController();

router.use(authMiddleware);

router.post('/assign/:id', requirePermission(PERMISSIONS.WORKSHOP_UPDATE), validateRequest(assignTechnicianSchema), controller.assignTechnician);
router.patch('/progress/:id', requirePermission(PERMISSIONS.WORKSHOP_UPDATE), validateRequest(updateJobProgressSchema), controller.updateProgress);
router.patch('/qc/:id', requirePermission(PERMISSIONS.WORKSHOP_UPDATE), validateRequest(qcUpdateSchema), controller.updateQC);
router.get('/job-cards/:id', requirePermission(PERMISSIONS.WORKSHOP_READ), validateRequest(jobCardIdParamSchema), controller.getJobCard);

export default router;
