import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.util';

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Unhandled Error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  sendError(res, message, process.env.NODE_ENV === 'development' ? err.stack : undefined, statusCode);
};
