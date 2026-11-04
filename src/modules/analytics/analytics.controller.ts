import { Request, Response, NextFunction } from "express";
import { AnalyticsService } from "./analytics.service.js";
import { ApiResponse } from "../../utils/api-response.js";
import { AnalyticsFilterInput } from "./analytics.schema.js";

export class AnalyticsController {
  private static getFilter(req: Request): AnalyticsFilterInput {
    return req.query as unknown as AnalyticsFilterInput;
  }

  static async overview(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AnalyticsService.getOverview(
        req.user?.userId,
        AnalyticsController.getFilter(req)
      );
      return ApiResponse.success(res, data);
    } catch (error: any) {
      next(error);
    }
  }

  static async realtime(req: Request, res: Response, next: NextFunction) {
    try {
      const websiteId = req.query.websiteId as string;
      const data = await AnalyticsService.getRealtime(req.user?.userId, websiteId);
      return ApiResponse.success(res, data);
    } catch (error: any) {
      next(error);
    }
  }

  static async timeseries(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AnalyticsService.getTimeseries(
        req.user?.userId,
        AnalyticsController.getFilter(req)
      );
      return ApiResponse.success(res, data);
    } catch (error: any) {
      next(error);
    }
  }

  static async geography(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AnalyticsService.getGeography(
        req.user?.userId,
        AnalyticsController.getFilter(req)
      );
      return ApiResponse.success(res, data);
    } catch (error: any) {
      next(error);
    }
  }

  static async sources(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AnalyticsService.getSources(
        req.user?.userId,
        AnalyticsController.getFilter(req)
      );
      return ApiResponse.success(res, data);
    } catch (error: any) {
      next(error);
    }
  }

  static async pages(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AnalyticsService.getPages(
        req.user?.userId,
        AnalyticsController.getFilter(req)
      );
      return ApiResponse.success(res, data);
    } catch (error: any) {
      next(error);
    }
  }

  static async landingPages(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AnalyticsService.getLandingPages(
        req.user?.userId,
        AnalyticsController.getFilter(req)
      );
      return ApiResponse.success(res, data);
    } catch (error: any) {
      next(error);
    }
  }

  static async exitPages(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AnalyticsService.getExitPages(
        req.user?.userId,
        AnalyticsController.getFilter(req)
      );
      return ApiResponse.success(res, data);
    } catch (error: any) {
      next(error);
    }
  }

  static async devices(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AnalyticsService.getDevices(
        req.user?.userId,
        AnalyticsController.getFilter(req)
      );
      return ApiResponse.success(res, data);
    } catch (error: any) {
      next(error);
    }
  }

  static async browsers(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AnalyticsService.getBrowsers(
        req.user?.userId,
        AnalyticsController.getFilter(req)
      );
      return ApiResponse.success(res, data);
    } catch (error: any) {
      next(error);
    }
  }

  static async operatingSystems(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AnalyticsService.getOperatingSystems(
        req.user?.userId,
        AnalyticsController.getFilter(req)
      );
      return ApiResponse.success(res, data);
    } catch (error: any) {
      next(error);
    }
  }

  static async traffic(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AnalyticsService.getTrafficStats(
        req.user?.userId,
        AnalyticsController.getFilter(req)
      );
      return ApiResponse.success(res, data);
    } catch (error: any) {
      next(error);
    }
  }
}
