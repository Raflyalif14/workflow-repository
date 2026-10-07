# Auth/session hardening

## Verified baseline and findings

Baseline `main / 1347244`, empty index, 39 modified and 25 untracked existing files.
The four findings were present: stored refresh tokens had no consumer; every
`loadProfile` failure cleared credentials; register had no limiter; Express 4
async auth middleware had no catch/next boundary. Backend SDK auto refresh and
persistence are disabled. The standalone frontend Supabase client has no imports
or consumers, so it does not refresh the app's manually stored credentials.

## Request/session contract

- `POST /api/auth/refresh`: strict `{ refreshToken }` input only. A fresh
  non-persistent Supabase client verifies the credential and rotates tokens.
  An explicit `users(id,is_active)` read rejects missing/inactive accounts.
  No client identity/role is trusted and no shared SDK session is mutated.
  Token responses carry `Cache-Control: no-store` and `Pragma: no-cache`.
- Middleware retains verified server profile/role/password guards and existing
  timing span names. Only invalid provider sessions produce refreshable
  `401 / AUTH_TOKEN_INVALID`. Missing/inactive profiles are non-refreshable 401;
  auth/DB outages or thrown exceptions are safe 503 via the global handler.
  Auth-route errors never expose provider details, JSON body excerpts or stacks,
  including in development. Unrelated global error diagnostics are unchanged.
- Register: 5 requests/IP/15 minutes, before validation/account/email work.
  Refresh: 60 requests/IP/15 minutes. Existing proxy/IP configuration, limiter
  headers, 429 body, login/reset limits and login-success bucket reset remain.
  Registration duplicates and unknown failures share generic HTTP 400/message;
  internal-domain validation stays 422. This avoids account existence disclosure
  through the previous duplicate-specific 409/message.
- Frontend retries only explicit `AUTH_TOKEN_INVALID` 401, at most once.
  Login/register/forgot/reset/refresh/logout never trigger recursive refresh.
  No business-request retry on network error, 403, unrelated 401, validation,
  429 or 5xx. Invalid refresh ends the current session; network/429/5xx retains
  credentials and provides a retryable error. Unknown errors do not force logout.
- Replay uses the original method, URL, headers and body object, including File,
  FormData, expected draft revision and request/receipt ID. No manual multipart
  boundary or new receipt IDs. Consumed ReadableStreams are not replayed; an
  aborted consumer does not replay after a shared refresh. Auth guards precede
  parsers/controllers in project/document/milestone upload routers.
- Tokens are one atomic `workflow.session` localStorage record with an opaque
  generation ID. Existing two-key credentials migrate once; stored data never
  supplies identity/roles. Rotation preserves the generation and omitted refresh
  tokens; login creates a new generation. Old refresh/profile successes or
  failures cannot restore logout or replace a new account. Logout invalidates
  locally before remote sign-out (remote sign-out remains best effort).
- Single-flight is per session generation, removed on both success/failure.
  Late old-token 401s use already rotated tokens. Same-origin Web Locks serialize
  refresh across tabs when available; storage is rechecked under the lock.
  Without Web Locks, generation/CAS protection remains, but two tabs may refresh
  concurrently. Storage changes invalidate/verify a changed account and clear
  private cache; rotation of the same session does not remount forms.
- Initial unverified profiles block protected UI with localized retry. Temporary
  profile errors retain verified user and mounted children (forms/dialog/files).
  Forbidden profiles block and drop the verified UI identity until a successful
  verification. Inactive sessions clear credentials/private cache. UI errors and
  retry labels use EN/ID dictionaries; English remains default.

Provider references: [refreshSession](https://supabase.com/docs/reference/javascript/auth-refreshsession),
[session rotation/reuse](https://supabase.com/docs/guides/auth/sessions),
[error codes](https://supabase.com/docs/guides/auth/debugging/error-codes).
Installed SDK source was also inspected for disabled auto-refresh and retryable
provider errors; our wrapper does not classify temporary failures as invalid.

## Validation and rollout

Targeted tests cover actual middleware/HTTP with mocked provider/database,
rotation, concurrent/late 401, invalid/transient refresh, logout/account races,
profile guard/retry, multipart identity/receipt and aborted/non-replayable bodies.
The provider test executes real handlers with retained hook slots; it is not a
browser DOM/form-state UAT. Existing multipart HTTP and draft receipt/CAS tests
remain required, along with backend/frontend `tsc --noEmit` and diff checks.

The existing frontend registration source-string regression fails identically
on HEAD: it searches literal `Create account` although HEAD already renders the
i18n key. Test/login/register files were confirmed identical to HEAD and left
untouched; this pre-existing failure must not be represented as a passing suite.

An isolated temporary Next/browser fixture with mock accounts was attempted.
Browser reported `ERR_BLOCKED_BY_CLIENT`; fixture Next compilation also failed
resolving a cross-drive node_modules junction. No expiry/account mutation was
performed against the running live application or database. Browser/session UAT
is unverified, and temporary helper servers were stopped.

Deploy backend before frontend so the explicit 401 codes and refresh route are
available together. No migration, environment change or new dependency required.
Reload old application tabs after rollout (credential storage format changed).
Use dedicated test accounts/environment for browser expiry, temporary outage,
retry, cross-tab rotation/logout and retained native file/dialog UAT. Evaluate
per-IP limiter capacity with observed traffic before tuning it; do not broaden
trusted proxy configuration to bypass limits.

## Files changed in this task

- `backend/src/config/supabase.ts`
- `backend/src/controllers/auth.controller.ts`
- `backend/src/middlewares/auth-rate-limit.middleware.ts`
- `backend/src/middlewares/auth-security.test.ts`
- `backend/src/middlewares/auth-session.test.ts`
- `backend/src/middlewares/auth.middleware.ts`
- `backend/src/middlewares/error.middleware.ts`
- `backend/src/routes/auth.routes.ts`
- `backend/src/services/auth-session.service.ts`
- `backend/src/utils/auth-error.ts`
- `backend/src/validators/auth.validator.ts`
- `docs/auth-session-hardening.md`
- `frontend/package.json`
- `frontend/src/app/providers.tsx`
- `frontend/src/components/auth/auth-provider.tsx`
- `frontend/src/components/auth/session-notice.tsx`
- `frontend/src/i18n/en.ts`
- `frontend/src/i18n/id.ts`
- `frontend/src/lib/api-client.ts`
- `frontend/src/lib/auth-profile.ts`
- `frontend/src/lib/auth-provider.test.tsx`
- `frontend/src/lib/auth-session.test.ts`
- `frontend/src/lib/auth.ts`

Final targeted results: 11 backend test files and 6 frontend test files pass.
Backend/frontend type checks and `git diff --check` pass. The separately
reported HEAD-existing registration regression remains failed and unchanged.
Index remains empty. Of 64 original dirty paths, 61 remain byte-identical;
only frontend/package.json and EN/ID dictionaries received task additions.
Existing Phase 24?25/Dashboard code and SQL were not modified in this task.
