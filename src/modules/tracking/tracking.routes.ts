import { Router } from "express";
import { TrackingController } from "./tracking.controller.js";
import { validateRequest } from "../../middleware/validate.middleware.js";
import {
  trackPageViewSchema,
  trackHeartbeatSchema,
  trackEventSchema,
} from "./tracking.schema.js";
import { trackingRateLimiter } from "../../middleware/rate-limit.middleware.js";

const router = Router();

// Tracking endpoints are public and CORS-enabled for customer websites
router.post(
  "/pageview",
  trackingRateLimiter,
  validateRequest({ body: trackPageViewSchema }),
  TrackingController.pageView
);

router.post(
  "/heartbeat",
  trackingRateLimiter,
  validateRequest({ body: trackHeartbeatSchema }),
  TrackingController.heartbeat
);

router.post(
  "/event",
  trackingRateLimiter,
  validateRequest({ body: trackEventSchema }),
  TrackingController.customEvent
);

export default router;
