import { Request } from 'express';
import {
  rateLimit,
  type RateLimitInfo,
  type RateLimitRequestHandler,
} from 'express-rate-limit';
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

export const createAuthRateLimiter = ({
  windowMs,
  max,
}: AuthRateLimitOptions): RateLimitRequestHandler =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(res, AUTH_RATE_LIMIT_MESSAGE, null, 429);
    },
  });
export const loginRateLimiter = createAuthRateLimiter(AUTH_RATE_LIMITS.login);

export const resetLoginRateLimit = (req: Request): void => {
  const rateLimitInfo = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit;

  if (!rateLimitInfo?.key) return;

  const reportResetFailure = (): void => {
    console.error('[AuthRateLimit] Failed to reset the login rate limit after successful authentication.');
  };

  try {
    const resetResult = (loginRateLimiter.resetKey as (key: string) => unknown)(rateLimitInfo.key);
    if (resetResult && typeof (resetResult as PromiseLike<unknown>).then === 'function') {
      void Promise.resolve(resetResult).catch(reportResetFailure);
    }
  } catch {
    reportResetFailure();
  }
};
