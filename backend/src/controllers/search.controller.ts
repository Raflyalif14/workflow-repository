import { Response } from 'express';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendError, sendSuccess } from '../utils/response.util';
import { GlobalSearchError, GlobalSearchService } from '../services/global-search.service';
import { globalSearchQuerySchema } from '../validators/search.validator';

export class SearchController {
  static async search(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await GlobalSearchService.search(globalSearchQuerySchema.parse(req.query), req.user!);
      sendSuccess(res, 'Search results retrieved successfully', result);
    } catch (error) {
      if (error instanceof ZodError) {
        sendError(res, 'Validation failed', error.errors.map((issue) => ({ field: issue.path.join('.'), message: issue.message })), 422);
        return;
      }
      if (error instanceof GlobalSearchError) {
        sendError(res, error.message, null, error.statusCode);
        return;
      }
      console.error('[SearchController] Search failed.');
      sendError(res, 'Failed to search records.', null, 500);
    }
  }
}
