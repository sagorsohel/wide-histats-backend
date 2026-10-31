import { Request, Response, NextFunction } from "express";
import { TrackingService } from "./tracking.service.js";
import { ApiResponse } from "../../utils/api-response.js";

export class TrackingController {
  private static extractClientIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      return forwarded.split(",")[0].trim();
    }
    return (
      (req.headers["x-real-ip"] as string) ||
      req.socket.remoteAddress ||
      "127.0.0.1"
    );
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
