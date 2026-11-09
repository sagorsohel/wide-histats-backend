import { Request, Response, NextFunction } from "express";
import { WebsiteService } from "./website.service.js";
import { ApiResponse } from "../../utils/api-response.js";

export class WebsiteController {
  static async createWebsite(req: Request, res: Response, next: NextFunction) {
    try {
      const website = await WebsiteService.createWebsite(req.user!.userId, req.body);
      return ApiResponse.success(res, website, "Website registered successfully", 201);
    } catch (error: any) {
      next(error);
    }
  }

  static async getWebsites(req: Request, res: Response, next: NextFunction) {
    try {
      const list = await WebsiteService.getWebsites(req.user!.userId);
      return ApiResponse.success(res, list);
    } catch (error: any) {
      next(error);
    }
  }

  static async getWebsiteById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const website = await WebsiteService.getWebsiteById(
        req.user!.userId,
        id
      );
      return ApiResponse.success(res, website);
    } catch (error: any) {
      next(error);
    }
  }

  static async updateWebsite(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const updated = await WebsiteService.updateWebsite(
        req.user!.userId,
        id,
        req.body
      );
      return ApiResponse.success(res, updated, "Website updated successfully");
    } catch (error: any) {
      next(error);
    }
  }

  static async deleteWebsite(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const result = await WebsiteService.deleteWebsite(
        req.user!.userId,
        id
      );
      return ApiResponse.success(res, result, "Website removed successfully");
    } catch (error: any) {
      next(error);
    }
  }

  static async getTrackingCode(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const snippet = await WebsiteService.getTrackingSnippet(
        req.user!.userId,
        id
      );
      return ApiResponse.success(res, snippet);
    } catch (error: any) {
      next(error);
    }
  }

  static async getCounters(req: Request, res: Response, next: NextFunction) {
    try {
      const websiteId = req.params.id as string;
      const list = await WebsiteService.getCounters(req.user!.userId, websiteId);
      return ApiResponse.success(res, list);
    } catch (error: any) {
      next(error);
    }
  }

  static async createCounter(req: Request, res: Response, next: NextFunction) {
    try {
      const websiteId = req.params.id as string;
      const created = await WebsiteService.createCounter(
        req.user!.userId,
        websiteId,
        req.body
      );
      return ApiResponse.success(res, created, "Counter created successfully", 201);
    } catch (error: any) {
      next(error);
    }
  }

  static async deleteCounter(req: Request, res: Response, next: NextFunction) {
    try {
      const websiteId = req.params.id as string;
      const counterId = req.params.counterId as string;
      const result = await WebsiteService.deleteCounter(
        req.user!.userId,
        websiteId,
        counterId
      );
      return ApiResponse.success(res, result, "Counter deleted successfully");
    } catch (error: any) {
      next(error);
    }
  }
}
