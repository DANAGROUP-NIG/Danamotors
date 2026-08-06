import { Router } from 'express';
import { ServiceController } from './service.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  createJobCardSchema,
  updateJobCardSchema,
  createInspectionSchema,
  createEstimateSchema,
  createApprovalSchema,
  serviceIdParamSchema,
  jobCardIdParamSchema,
  estimateIdParamSchema,
} from './service.validation';

const router = Router();
const controller = new ServiceController();

router.use(authMiddleware);

router.post('/appointments', requirePermission(PERMISSIONS.SERVICE_CREATE), validateRequest(createAppointmentSchema), controller.createAppointment);
router.get('/appointments', requirePermission(PERMISSIONS.SERVICE_READ), controller.listAppointments);
router.get('/appointments/:id', requirePermission(PERMISSIONS.SERVICE_READ), validateRequest(serviceIdParamSchema), controller.getAppointment);
router.put('/appointments/:id', requirePermission(PERMISSIONS.SERVICE_UPDATE), validateRequest(updateAppointmentSchema), controller.updateAppointment);
router.delete('/appointments/:id', requirePermission(PERMISSIONS.SERVICE_DELETE), validateRequest(serviceIdParamSchema), controller.deleteAppointment);

router.post('/job-cards', requirePermission(PERMISSIONS.SERVICE_CREATE), validateRequest(createJobCardSchema), controller.createJobCard);
router.get('/job-cards', requirePermission(PERMISSIONS.SERVICE_READ), controller.listJobCards);
router.get('/job-cards/:id', requirePermission(PERMISSIONS.SERVICE_READ), validateRequest(jobCardIdParamSchema), controller.getJobCard);
router.put('/job-cards/:id', requirePermission(PERMISSIONS.SERVICE_UPDATE), validateRequest(updateJobCardSchema), controller.updateJobCard);

router.post('/job-cards/:id/inspections', requirePermission(PERMISSIONS.SERVICE_CREATE), validateRequest(createInspectionSchema), controller.addInspection);
router.post('/job-cards/:id/estimates', requirePermission(PERMISSIONS.SERVICE_CREATE), validateRequest(createEstimateSchema), controller.addEstimate);
router.post('/estimates/:id/approvals', requirePermission(PERMISSIONS.SERVICE_CREATE), validateRequest(createApprovalSchema), controller.addApproval);
router.get('/estimates/:id/approvals', requirePermission(PERMISSIONS.SERVICE_READ), validateRequest(estimateIdParamSchema), controller.getApprovals);

export default router;
