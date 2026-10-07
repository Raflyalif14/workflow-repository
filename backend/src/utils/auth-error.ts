// Public auth errors contain only our fixed message/code, never provider details.
export class AuthRequestError extends Error {
  readonly safeResponse = true;
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); }
}

export const authUnavailable = () => new AuthRequestError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable. Please try again.');

export function isInvalidProviderSession(error: { status?: number; code?: string } | null): boolean {
  return Boolean(error && (error.status === 401 || error.code && [
    'bad_jwt', 'jwt_expired', 'session_not_found', 'refresh_token_not_found',
    'refresh_token_already_used', 'user_not_found', 'user_banned',
  ].includes(error.code)));
}
