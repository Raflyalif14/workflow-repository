import { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sendError } from '../utils/response.util';

const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export const AUTH_RATE_LIMIT_MESSAGE = 'Too many requests. Please try again later.';

export const AUTH_RATE_LIMITS = {
  login: { windowMs: AUTH_RATE_LIMIT_WINDOW_MS, max: 10 },
  forgotPassword: { windowMs: AUTH_RATE_LIMIT_WINDOW_MS, max: 5 },
  resetPassword: { windowMs: AUTH_RATE_LIMIT_WINDOW_MS, max: 10 },
} as const;

type AuthRateLimitOptions = {
  windowMs: number;
  max: number;
};

export const createAuthRateLimiter = ({ windowMs, max }: AuthRateLimitOptions): RequestHandler =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(res, AUTH_RATE_LIMIT_MESSAGE, null, 429);
    },
  });
