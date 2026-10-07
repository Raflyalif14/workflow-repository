import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.util';

export const errorHandler = (
  err: any,
  req: Request,
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
  if (err?.safeResponse === true) {
    sendError(res, err.message, { code: err.code }, statusCode);
    return;
  }
  if (req.originalUrl?.split('?')[0].startsWith('/api/auth/')) {
    console.error('Authentication request error.', { statusCode });
    sendError(res, isExpectedClientError ? 'Invalid authentication request.' : 'Authentication is temporarily unavailable. Please try again.',
      { code: isExpectedClientError ? 'AUTH_REQUEST_INVALID' : 'AUTH_UNAVAILABLE' }, statusCode);
    return;
  }
  const message =
    isProduction && !isExpectedClientError
      ? 'Internal Server Error'
      : err?.message || 'Internal Server Error';

  console.error('Unhandled request error.', { statusCode, isExpectedClientError });

  sendError(res, message, isDevelopment ? err?.stack : undefined, statusCode);
};
