import { Router } from 'express';
import { PortalController } from './portal.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { customerAuthMiddleware } from '../../middleware/customerAuthMiddleware';
import {
  idParamSchema,
  updateProfileSchema,
  changePasswordSchema,
  estimateApprovalSchema,
  jobCardListQuerySchema,
  createPortalVehicleSchema,
  createPortalAppointmentSchema,
  creditDecisionSchema,
} from './portal.validation';

const router = Router();
const controller = new PortalController();

router.use(customerAuthMiddleware);

router.get('/me', controller.getMe);
router.put('/me', validateRequest(updateProfileSchema), controller.updateProfile);
router.put('/me/password', validateRequest(changePasswordSchema), controller.changePassword);

router.get('/dashboard', controller.getDashboard);

router.get('/vehicles', controller.getVehicles);
router.post('/vehicles', validateRequest(createPortalVehicleSchema), controller.registerVehicle);
router.get('/vehicles/:id', validateRequest(idParamSchema), controller.getVehicle);

router.get('/job-cards', validateRequest(jobCardListQuerySchema), controller.getJobCards);
router.get('/job-cards/:id', validateRequest(idParamSchema), controller.getJobCard);

router.get('/appointments', controller.getAppointments);
router.post('/appointments', validateRequest(createPortalAppointmentSchema), controller.bookAppointment);

router.get('/services', controller.getServices);

router.get('/invoices', controller.getInvoices);
router.get('/invoices/:id', validateRequest(idParamSchema), controller.getInvoice);

router.post('/estimates/:id/approval', validateRequest(estimateApprovalSchema), controller.submitEstimateApproval);

router.get('/credit', controller.getCredit);
router.get('/credit/applications', controller.getCreditApplications);
router.post('/credit/applications/:id/decision', validateRequest(creditDecisionSchema), controller.decideCreditApplication);

export default router;
