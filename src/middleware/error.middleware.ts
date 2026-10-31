import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/api-response.js";
import { logger } from "../utils/logger.js";

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

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || "An unexpected internal server error occurred.";

  return ApiResponse.error(
    res,
    message,
    statusCode,
    process.env.NODE_ENV === "development" ? err.stack : undefined
  );
};
