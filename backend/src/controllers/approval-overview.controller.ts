import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { ApprovalOverviewService } from '../services/approval-overview.service';
import { sendError, sendSuccess } from '../utils/response.util';
import { getRequestTiming } from '../utils/request-timing';

export class ApprovalOverviewController {
    static async getOverview(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {
        try {
            const result = await ApprovalOverviewService.getOverview(req.user!, getRequestTiming(req));

            sendSuccess(
                res,
                'Approval overview retrieved successfully',
                result
            );
        } catch (error: any) {
            const forbidden = error?.message === 'Forbidden';
            const message = forbidden ? 'Forbidden' : 'Failed to load approval overview.';
            const statusCode = forbidden ? 403 : 500;

            sendError(res, message, null, statusCode);
        }
    }
}
