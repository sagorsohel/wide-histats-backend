import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/api-response.js";
import { logger } from "../utils/logger.js";
import { HttpError } from "../utils/http-error.js";

export const notFoundHandler = (req: Request, res: Response) => {
  return ApiResponse.error(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
};

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error(`Error processing ${req.method} ${req.originalUrl}:`, err);

  const isDev = process.env.NODE_ENV === "development";
  const isHttpError = err instanceof HttpError;
  // Body-parser style errors (bad JSON, payload too large) carry a 4xx status
  const clientStatus =
    typeof err.status === "number" && err.status >= 400 && err.status < 500 ? err.status : undefined;

  const statusCode = isHttpError ? err.statusCode : clientStatus || 500;
  // Only expose messages we deliberately raised; hide internals (DB errors etc.) in production
  const message =
    isHttpError || clientStatus || isDev
      ? err.message || "Request failed."
      : "An unexpected internal server error occurred.";

  return ApiResponse.error(res, message, statusCode, isDev ? err.stack : undefined);
};
