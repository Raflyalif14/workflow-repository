import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { ApprovalOverviewService } from '../services/approval-overview.service';
import { sendError, sendSuccess } from '../utils/response.util';

export class ApprovalOverviewController {
    static async getOverview(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {
        try {
            const result = await ApprovalOverviewService.getOverview(req.user!);

            sendSuccess(
                res,
                'Approval overview retrieved successfully',
                result
            );
        } catch (error: any) {
            const message =
                error?.message || 'Failed to retrieve approval overview';

            const statusCode = message === 'Forbidden' ? 403 : 500;

            sendError(res, message, null, statusCode);
        }
    }
}