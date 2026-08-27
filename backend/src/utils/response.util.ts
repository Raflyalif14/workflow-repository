import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: any;
}

export const sendSuccess = <T>(
  res: Response,
  message: string,
  data?: T,
  statusCode = 200
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  } as ApiResponse<T>);
};

export const sendError = (
  res: Response,
  message: string,
  errors: any = null,
  statusCode = 400
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  } as ApiResponse);
};
