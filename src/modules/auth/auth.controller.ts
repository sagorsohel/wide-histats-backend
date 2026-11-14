import { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service.js";
import { ApiResponse } from "../../utils/api-response.js";
import { env } from "../../config/env.js";
import { durationToMs } from "../../utils/duration.js";
import { verifyRefreshToken } from "../../utils/jwt.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: durationToMs(env.JWT_REFRESH_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000),
};

const ACCESS_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: durationToMs(env.JWT_ACCESS_EXPIRES_IN, 15 * 60 * 1000),
};

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.register(req.body);
      res.cookie("refreshToken", result.refreshToken, COOKIE_OPTIONS);
      res.cookie("accessToken", result.accessToken, ACCESS_COOKIE_OPTIONS);
      return ApiResponse.success(res, result, "Registration successful", 201);
    } catch (error: any) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.login(req.body);
      res.cookie("refreshToken", result.refreshToken, COOKIE_OPTIONS);
      res.cookie("accessToken", result.accessToken, ACCESS_COOKIE_OPTIONS);
      return ApiResponse.success(res, result, "Login successful");
    } catch (error: any) {
      next(error);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies?.refreshToken || req.body?.refreshToken;
      if (!token) {
        return ApiResponse.error(res, "Refresh token is required", 400);
      }
      const result = await AuthService.refresh(token);
      res.cookie("accessToken", result.accessToken, ACCESS_COOKIE_OPTIONS);
      return ApiResponse.success(res, result, "Token refreshed successfully");
    } catch (error: any) {
      next(error);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies?.refreshToken || req.body?.refreshToken;
      const allDevices = req.body?.allDevices === true;

      if (req.user) {
        await AuthService.logout(req.user.userId, token, allDevices);
      } else if (token) {
        const payload = verifyRefreshToken(token);
        if (payload?.userId) {
          await AuthService.logout(payload.userId, token, allDevices);
        }
      }

      res.clearCookie("refreshToken");
      res.clearCookie("accessToken");
      return ApiResponse.success(res, null, "Logged out successfully");
    } catch (error: any) {
      next(error);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return ApiResponse.error(res, "Unauthorized", 401);
      }
      const user = await AuthService.getProfile(req.user.userId);
      return ApiResponse.success(res, user);
    } catch (error: any) {
      next(error);
    }
  }

  static async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return ApiResponse.error(res, "Unauthorized", 401);
      }
      const updated = await AuthService.updateProfile(req.user.userId, {
        name: req.body?.name,
      });
      return ApiResponse.success(res, updated, "Profile updated successfully");
    } catch (error: any) {
      next(error);
    }
  }

  static async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return ApiResponse.error(res, "Unauthorized", 401);
      }
      const result = await AuthService.changePassword(req.user.userId, {
        currentPassword: req.body?.currentPassword,
        newPassword: req.body?.newPassword,
      });
      return ApiResponse.success(res, null, result.message);
    } catch (error: any) {
      next(error);
    }
  }
}
