import { Router } from "express";
import { CreditController } from "./credit.controller";
import { validateRequest } from "../../middleware/requestValidator";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { PERMISSIONS } from "../../shared/constants/roles";
import {
  customerIdParamSchema,
  applicationIdParamSchema,
  adjustCreditSchema,
  createCreditApplicationSchema,
  listApplicationsQuerySchema,
} from "./credit.validation";

const router = Router();
const controller = new CreditController();

router.use(authMiddleware);

router.get(
  "/applications",
  requirePermission(PERMISSIONS.FINANCE_READ),
  validateRequest(listApplicationsQuerySchema),
  controller.listApplications,
);
router.get(
  "/applications/:id",
  requirePermission(PERMISSIONS.FINANCE_READ),
  validateRequest(applicationIdParamSchema),
  controller.getApplication,
);
router.post(
  "/applications",
  requirePermission(PERMISSIONS.FINANCE_CREATE),
  validateRequest(createCreditApplicationSchema),
  controller.createApplication,
);

router.get(
  "/customers/:customerId/credit",
  requirePermission(PERMISSIONS.FINANCE_READ),
  validateRequest(customerIdParamSchema),
  controller.getCustomerCredit,
);
router.post(
  "/customers/:customerId/credit",
  requirePermission(PERMISSIONS.FINANCE_CREATE),
  validateRequest(adjustCreditSchema),
  controller.adjustCredit,
);

export default router;
