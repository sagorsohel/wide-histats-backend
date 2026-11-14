import express, { Express, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import { env, isDashboardOrigin } from "./config/env.js";
import authRoutes from "./modules/auth/auth.routes.js";
import websiteRoutes from "./modules/websites/website.routes.js";
import trackingRoutes from "./modules/tracking/tracking.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import { TrackingController } from "./modules/tracking/tracking.controller.js";
import { AnalyticsController } from "./modules/analytics/analytics.controller.js";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware.js";
import { trackingRateLimiter } from "./middleware/rate-limit.middleware.js";
import { ApiResponse } from "./utils/api-response.js";

export const createApp = (): Express => {
  const app = express();

  // Trust reverse proxy headers (Cloudflare, Nginx, load balancers)
  app.set("trust proxy", env.TRUST_PROXY_HOPS);

  // Security headers (relaxed for public tracker embed and beacons)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    })
  );

  // CORS: public tracking endpoints accept any origin (no credentials);
  // everything else (dashboard API) only accepts the configured dashboard origin.
  const isPublicPath = (p: string) =>
    p.startsWith("/api/v1/track") ||
    p === "/0.gif" ||
    p === "/livearray" ||
    p === "/tracker.js" ||
    p === "/js15_as.js" ||
    p === "/js15.js";

  const corsMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
  const corsHeaders = ["Content-Type", "Authorization", "X-Requested-With"];

  app.use(
    cors((req, callback) => {
      if (isPublicPath(req.path)) {
        return callback(null, {
          origin: true,
          // navigator.sendBeacon always sends in credentialed mode; without
          // Access-Control-Allow-Credentials the browser silently drops every hit.
          // Safe here: these endpoints are unauthenticated and never read auth cookies.
          credentials: true,
          methods: corsMethods,
          allowedHeaders: corsHeaders,
        });
      }
      const origin = req.headers.origin;
      // No Origin header: non-browser client (curl, server-to-server) - CORS not applicable
      const allowed = !origin || isDashboardOrigin(origin);
      callback(null, {
        origin: allowed,
        credentials: true,
        methods: corsMethods,
        allowedHeaders: corsHeaders,
      });
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());

  // Serve static public assets (e.g. tracker.js, js15_as.js)
  const publicDir = path.resolve(process.cwd(), "public");
  app.use(express.static(publicDir));
  app.get(["/tracker.js", "/js15_as.js", "/js15.js"], (req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/javascript");
    res.sendFile(path.join(publicDir, "tracker.js"));
  });

  // Histats 0.gif transparent pixel beacon (for noscript / ad-blocker fallback)
  app.get("/0.gif", trackingRateLimiter, TrackingController.pixelBeacon);

  // Histats-compatible livearray endpoint
  app.get("/livearray", AnalyticsController.livearray);

  // Health check endpoint
  app.get("/health", (req: Request, res: Response) => {
    return ApiResponse.success(res, {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: "wide-histat-backend",
    });
  });

  // API v1 Routes
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/websites", websiteRoutes);
  app.use("/api/v1/track", trackingRoutes);
  app.use("/api/v1/analytics", analyticsRoutes);

  // 404 & Error Handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
