import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { CleanupFilter, OperationalHealthError, OperationalHealthService } from '../services/operational-health.service';
import { sendError, sendSuccess } from '../utils/response.util';

export const monitoringPageSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const cleanupMonitoringSchema = monitoringPageSchema.extend({ status: z.enum(['ALL', 'PENDING', 'FAILED', 'COMPLETED']).default('ALL') });

const respond = async (res: Response, action: () => Promise<unknown>, message: string) => {
  try { sendSuccess(res, message, await action()); }
  catch (error) {
    const known = error instanceof OperationalHealthError;
    sendError(res, known ? error.message : 'Unable to load operational health.', null, known ? error.statusCode : 500);
  }
};

export class OperationalHealthController {
  static outputOutbox = (req: AuthenticatedRequest, res: Response) => {
    const parsed = monitoringPageSchema.safeParse(req.query);
    if (!parsed.success) { sendError(res, 'Invalid monitoring pagination.', null, 400); return; }
    return respond(res, () => OperationalHealthService.outputOutbox(req.user!, parsed.data), 'Output outbox health retrieved.');
  };

  static storageCleanups = (req: AuthenticatedRequest, res: Response) => {
    const parsed = cleanupMonitoringSchema.safeParse(req.query);
    if (!parsed.success) { sendError(res, 'Invalid monitoring pagination or status.', null, 400); return; }
    return respond(res, () => OperationalHealthService.storageCleanups(req.user!, parsed.data, parsed.data.status as CleanupFilter), 'Storage cleanup health retrieved.');
  };
}
