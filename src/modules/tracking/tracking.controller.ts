import { Request, Response, NextFunction } from "express";
import { TrackingService } from "./tracking.service.js";
import { ApiResponse } from "../../utils/api-response.js";

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
}
