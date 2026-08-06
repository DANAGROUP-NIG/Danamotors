import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validateRequest } from "../../middleware/requestValidator";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  updateMeSchema,
} from "./auth.validation";

const router = Router();
const controller = new AuthController();

router.post("/register", validateRequest(registerSchema), controller.register);
router.post("/login", validateRequest(loginSchema), controller.login);
router.post(
  "/refresh",
  validateRequest(refreshTokenSchema),
  controller.refresh,
);
router.post("/logout", validateRequest(refreshTokenSchema), controller.logout);

// Protected routes
router.post("/logout-all", authMiddleware, controller.logoutAll);
router.get("/me", authMiddleware, controller.getMe);
router.put(
  "/me",
  authMiddleware,
  validateRequest(updateMeSchema),
  controller.updateMe,
);

export default router;
