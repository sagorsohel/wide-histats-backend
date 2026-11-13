import express, { Express, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import { env } from "./config/env.js";
import authRoutes from "./modules/auth/auth.routes.js";
import websiteRoutes from "./modules/websites/website.routes.js";
import trackingRoutes from "./modules/tracking/tracking.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import { TrackingController } from "./modules/tracking/tracking.controller.js";
import { AnalyticsController } from "./modules/analytics/analytics.controller.js";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware.js";
import { ApiResponse } from "./utils/api-response.js";

export const createApp = (): Express => {
  const app = express();

  // Trust reverse proxy headers (Cloudflare, tunnels, load balancers - 1 hop)
  app.set("trust proxy", 1);

  // Security headers (relaxed for public tracker embed and beacons)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    })
  );

  // Dynamic CORS configuration
  app.use(
    cors({
      origin: (origin, callback) => {
        // Always allow requests with no origin (like mobile apps, curl, or sendBeacon)
        if (!origin) return callback(null, true);

        // Allow configured dashboard origin and localhost development
        if (
          origin === env.CORS_ORIGIN ||
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:")
        ) {
          return callback(null, true);
        }

        // For public tracking endpoints, allow any origin
        return callback(null, true);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());

  // Serve static public assets (e.g. tracker.js)
  const publicDir = path.resolve(process.cwd(), "public");
  app.use(express.static(publicDir));
  app.get("/tracker.js", (req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, "tracker.js"));
  });

  // Histats 0.gif transparent pixel beacon (for noscript / ad-blocker fallback)
  app.get("/0.gif", TrackingController.pixelBeacon);

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
