import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { registerSchema, loginSchema } from "./auth.schema.js";
import { requireAuth, optionalAuth } from "../../middleware/auth.middleware.js";
import { authRateLimiter } from "../../middleware/rate-limit.middleware.js";

const router = Router();

router.post(
  "/register",
  authRateLimiter,
  validateRequest({ body: registerSchema }),
  AuthController.register
);

router.post(
  "/login",
  authRateLimiter,
  validateRequest({ body: loginSchema }),
  AuthController.login
);

router.post("/refresh", AuthController.refresh);
router.post("/logout", optionalAuth, AuthController.logout);
router.get("/me", requireAuth, AuthController.me);

export default router;
