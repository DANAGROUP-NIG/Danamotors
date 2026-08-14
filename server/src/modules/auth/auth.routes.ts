import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validateRequest } from "../../middleware/requestValidator";
import { authMiddleware } from "../../middleware/authMiddleware";
import { combinedAuthMiddleware } from "../../middleware/customerAuthMiddleware";
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  updateMeSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  customerRegisterSchema,
} from "./auth.validation";

const router = Router();
const controller = new AuthController();

router.post("/register", validateRequest(registerSchema), controller.register);
router.post("/customer/register", validateRequest(customerRegisterSchema), controller.registerCustomer);
router.post("/login", validateRequest(loginSchema), controller.login);
router.post("/forgot-password", validateRequest(forgotPasswordSchema), controller.forgotPassword);
router.post("/reset-password", validateRequest(resetPasswordSchema), controller.resetPassword);
router.post(
  "/refresh",
  validateRequest(refreshTokenSchema),
  controller.refresh,
);
router.post("/logout", validateRequest(refreshTokenSchema), controller.logout);

// Protected routes
router.post("/logout-all", authMiddleware, controller.logoutAll);
router.get("/me", combinedAuthMiddleware, controller.getMe);
router.put(
  "/me",
  authMiddleware,
  validateRequest(updateMeSchema),
  controller.updateMe,
);

export default router;
