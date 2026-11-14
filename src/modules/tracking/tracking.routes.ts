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

// Tracking endpoints are public and CORS-enabled for customer websites (per-IP rate limited)
router.use(trackingRateLimiter);

router.post(
  "/pageview",
  validateRequest({ body: trackPageViewSchema }),
  TrackingController.pageView
);

router.post(
  "/heartbeat",
  validateRequest({ body: trackHeartbeatSchema }),
  TrackingController.heartbeat
);

router.post(
  "/event",
  validateRequest({ body: trackEventSchema }),
  TrackingController.customEvent
);

// Histats 0.gif transparent tracking pixel beacon (for ad-blocker & noscript coverage)
router.get("/0.gif", TrackingController.pixelBeacon);

export default router;
