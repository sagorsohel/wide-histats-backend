import { Router } from "express";
import { WebsiteController } from "./website.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import {
  createWebsiteSchema,
  updateWebsiteSchema,
  websiteIdParamSchema,
} from "./website.schema.js";

const router = Router();

// All website management routes require authenticated user
router.use(requireAuth);

router.post(
  "/",
  validateRequest({ body: createWebsiteSchema }),
  WebsiteController.createWebsite
);

router.get("/", WebsiteController.getWebsites);

router.get(
  "/:id",
  validateRequest({ params: websiteIdParamSchema }),
  WebsiteController.getWebsiteById
);

router.patch(
  "/:id",
  validateRequest({ params: websiteIdParamSchema, body: updateWebsiteSchema }),
  WebsiteController.updateWebsite
);

router.delete(
  "/:id",
  validateRequest({ params: websiteIdParamSchema }),
  WebsiteController.deleteWebsite
);

router.get(
  "/:id/tracking-code",
  validateRequest({ params: websiteIdParamSchema }),
  WebsiteController.getTrackingCode
);

export default router;
