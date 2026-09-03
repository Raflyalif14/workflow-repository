import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.util';

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestedStatusCode = Number(err?.statusCode);
  const statusCode =
    Number.isInteger(requestedStatusCode) && requestedStatusCode >= 400 && requestedStatusCode <= 599
      ? requestedStatusCode
      : 500;
  const isExpectedClientError = statusCode >= 400 && statusCode < 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';
  const message =
    isProduction && !isExpectedClientError
      ? 'Internal Server Error'
      : err?.message || 'Internal Server Error';

  console.error('Unhandled request error.', { statusCode, isExpectedClientError });

  sendError(res, message, isDevelopment ? err?.stack : undefined, statusCode);
};
