import { Response } from "express";

export interface ApiResponseData<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: any;
  meta?: any;
}

export class ApiResponse {
  static success<T>(
    res: Response,
    data?: T,
    message?: string,
    statusCode: number = 200,
    meta?: any
  ): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      meta,
    });
  }

  static error(
    res: Response,
    message: string = "Internal Server Error",
    statusCode: number = 500,
    errors?: any
  ): Response {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
    });
  }
}
