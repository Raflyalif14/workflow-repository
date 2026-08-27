import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/response.util';

export const validateBody = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        sendError(
          res,
          'Validation failed',
          error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
          422
        );
        return;
      }
      sendError(res, 'Invalid request data', error, 400);
      return;
    }
  };
};
