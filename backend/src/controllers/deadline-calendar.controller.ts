import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { CalendarRequestError, getDeadlineCalendar } from '../services/deadline-calendar.service';
import { sendError, sendSuccess } from '../utils/response.util';

export async function deadlineCalendar(req: AuthenticatedRequest, res: Response) {
  try {
    const data = await getDeadlineCalendar(req.user!, req.query.month);
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, 'Milestone calendar retrieved successfully.', data);
  } catch (error) {
    if (error instanceof CalendarRequestError) { sendError(res, error.message, null, error.status); return; }
    sendError(res, 'The milestone calendar could not be loaded. Please try again.', null, 503);
  }
}
