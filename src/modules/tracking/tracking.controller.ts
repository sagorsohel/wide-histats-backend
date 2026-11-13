import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { TrackingService } from "./tracking.service.js";
import { ApiResponse } from "../../utils/api-response.js";
import { logger } from "../../utils/logger.js";

export class TrackingController {
  private static extractClientIp(req: Request): string {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf.trim()) {
      return cf.trim().replace(/^::ffff:/, "");
    }
    const trueClientIp = req.headers["true-client-ip"];
    if (typeof trueClientIp === "string" && trueClientIp.trim()) {
      return trueClientIp.trim().replace(/^::ffff:/, "");
    }
    const clientIp = req.headers["x-client-ip"];
    if (typeof clientIp === "string" && clientIp.trim()) {
      return clientIp.trim().replace(/^::ffff:/, "");
    }
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      return forwarded.split(",")[0].trim().replace(/^::ffff:/, "");
    }
    const realIp = req.headers["x-real-ip"];
    if (typeof realIp === "string" && realIp.trim()) {
      return realIp.trim().replace(/^::ffff:/, "");
    }
    if (req.ip && typeof req.ip === "string") {
      return req.ip.replace(/^::ffff:/, "");
    }
    const remote = req.socket?.remoteAddress;
    if (remote) {
      return remote.replace(/^::ffff:/, "");
    }
    return "127.0.0.1";
  }

  static async pageView(req: Request, res: Response, next: NextFunction) {
    try {
      const ip = TrackingController.extractClientIp(req);
      const userAgent = req.headers["user-agent"];
      const result = await TrackingService.recordPageView(req.body, ip, userAgent);
      return ApiResponse.success(res, result, "Pageview recorded");
    } catch (error: any) {
      next(error);
    }
  }

  static async heartbeat(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await TrackingService.recordHeartbeat(req.body);
      return ApiResponse.success(res, result);
    } catch (error: any) {
      next(error);
    }
  }

  static async customEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await TrackingService.recordEvent(req.body);
      return ApiResponse.success(res, result, "Event recorded");
    } catch (error: any) {
      next(error);
    }
  }

  private static readonly TRANSPARENT_1X1_GIF = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );

  /**
   * Histats-compatible 0.gif transparent pixel beacon endpoint.
   * Immediately delivers 1x1 GIF (zero latency) and records visitor hit in background.
   * Completely bypasses AdBlockers and script-blocking browsers.
   */
  static async pixelBeacon(req: Request, res: Response) {
    // 1. Immediately return transparent 1x1 GIF
    res.writeHead(200, {
      "Content-Type": "image/gif",
      "Content-Length": TrackingController.TRANSPARENT_1X1_GIF.length,
      "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(TrackingController.TRANSPARENT_1X1_GIF);

    // 2. Process tracking in background
    try {
      const rawQuery = req.query as Record<string, any>;
      const rawKeys = Object.keys(rawQuery);
      // Support ?websiteId=X, ?siteId=X, or Histats style ?4867998&101
      let trackingId = (rawQuery.websiteId || rawQuery.siteId || "").toString().trim();
      if (!trackingId && rawKeys.length > 0) {
        trackingId = rawKeys[0].trim();
      }
      if (!trackingId) return;

      const ip = TrackingController.extractClientIp(req);
      const userAgent = (req.headers["user-agent"] || "").toString();
      const referrer = (req.headers["referer"] || req.headers["referrer"] || "").toString();

      // Deterministic visitorKey & sessionKey from IP + UA + Date
      const today = new Date().toISOString().slice(0, 10);
      const visitorCookie = req.cookies?.["_wide_vis"];
      const visitorKey =
        visitorCookie ||
        crypto.createHash("md5").update(`${ip}-${userAgent}`).digest("hex");
      const sessionKey = crypto
        .createHash("md5")
        .update(`${visitorKey}-${today}`)
        .digest("hex");

      let path = "/";
      let pageUrl = referrer || "/";
      if (referrer) {
        try {
          const u = new URL(referrer);
          path = `${u.pathname}${u.search}`;
        } catch {
          path = "/";
        }
      }

      await TrackingService.recordPageView(
        {
          websiteId: trackingId,
          url: pageUrl,
          path,
          title: "",
          visitorKey,
          sessionKey,
          referrer: referrer || "",
        },
        ip,
        userAgent
      );
    } catch (error: any) {
      logger.warn(`Pixel beacon background tracking warning: ${error?.message || error}`);
    }
  }
}
