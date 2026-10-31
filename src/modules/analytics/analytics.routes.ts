import { Router } from "express";
import { AnalyticsController } from "./analytics.controller.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import { analyticsFilterSchema } from "./analytics.schema.js";
import { optionalAuth } from "../../middleware/auth.middleware.js";
import { z } from "zod";

const router = Router();

// Middleware: optionally authenticate if header/cookie is present
router.use(optionalAuth);

router.get(
  "/overview",
  validateRequest({ query: analyticsFilterSchema }),
  AnalyticsController.overview
);

router.get(
  "/realtime",
  validateRequest({
    query: z.object({ websiteId: z.string().uuid() }),
  }),
  AnalyticsController.realtime
);

router.get(
  "/timeseries",
  validateRequest({ query: analyticsFilterSchema }),
  AnalyticsController.timeseries
);

router.get(
  "/geography",
  validateRequest({ query: analyticsFilterSchema }),
  AnalyticsController.geography
);

router.get(
  "/sources",
  validateRequest({ query: analyticsFilterSchema }),
  AnalyticsController.sources
);

router.get(
  "/pages",
  validateRequest({ query: analyticsFilterSchema }),
  AnalyticsController.pages
);

router.get(
  "/landing-pages",
  validateRequest({ query: analyticsFilterSchema }),
  AnalyticsController.landingPages
);

router.get(
  "/exit-pages",
  validateRequest({ query: analyticsFilterSchema }),
  AnalyticsController.exitPages
);

router.get(
  "/devices",
  validateRequest({ query: analyticsFilterSchema }),
  AnalyticsController.devices
);

router.get(
  "/browsers",
  validateRequest({ query: analyticsFilterSchema }),
  AnalyticsController.browsers
);

router.get(
  "/operating-systems",
  validateRequest({ query: analyticsFilterSchema }),
  AnalyticsController.operatingSystems
);

export default router;
