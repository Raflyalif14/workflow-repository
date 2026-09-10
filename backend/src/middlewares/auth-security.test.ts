import { AddressInfo } from 'net';
import { request as httpRequest, Server } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import express, { Application } from 'express';
import app from '../app';
import { ENV, parseTrustProxy } from '../config/env';
import authRoutes from '../routes/auth.routes';
import { AuthService } from '../services/auth.service';
import {
  AUTH_RATE_LIMIT_MESSAGE,
  AUTH_RATE_LIMITS,
  createAuthRateLimiter,
  loginRateLimiter,
} from './auth-rate-limit.middleware';

type HttpResponse = {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
};

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const withServer = async <T>(expressApp: Application, action: (server: Server) => Promise<T>): Promise<T> => {
  const server = expressApp.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    return await action(server);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
};

const sendRequest = (
  server: Server,
  path: string,
  method = 'GET',
  payload?: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<HttpResponse> => {
  const address = server.address() as AddressInfo;
  const body = payload === undefined ? undefined : JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method,
        headers: {
          ...extraHeaders,
          ...(body
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: responseBody,
            headers: response.headers,
          });
        });
      }
    );

    request.once('error', reject);
    if (body) request.write(body);
    request.end();
  });
};

const LOGIN_PAYLOAD = {
  email: 'limit-test@example.com',
  password: 'CorrectPassword123!',
};

const resetLocalLoginBucket = (): void => {
  loginRateLimiter.resetKey('127.0.0.1');
};

const assertThrows = (action: () => unknown, message: string): void => {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(message);
};

async function run(): Promise<void> {
  assert(parseTrustProxy(undefined) === false && parseTrustProxy('false') === false && parseTrustProxy('') === false, 'Test 0: trust proxy must default to disabled');
  const loopbackTrustProxy = parseTrustProxy('loopback');
  assert(Array.isArray(loopbackTrustProxy) && loopbackTrustProxy[0] === 'loopback', 'Test 0: loopback trust proxy configuration must be supported');
  const linklocalTrustProxy = parseTrustProxy('linklocal');
  assert(Array.isArray(linklocalTrustProxy) && linklocalTrustProxy[0] === 'linklocal', 'Test 0: linklocal trust proxy configuration must be supported');
  const uniquelocalTrustProxy = parseTrustProxy('uniquelocal');
  assert(Array.isArray(uniquelocalTrustProxy) && uniquelocalTrustProxy[0] === 'uniquelocal', 'Test 0: uniquelocal trust proxy configuration must be supported');
  assert(parseTrustProxy('2') === 2, 'Test 0: bounded numeric trust proxy hop counts must be supported');
  assert(
    JSON.stringify(parseTrustProxy('192.0.2.10, 2001:db8::/32')) === JSON.stringify(['192.0.2.10', '2001:db8::/32']),
    'Test 0: literal trusted proxy IP/CIDR lists must be supported'
  );
  assertThrows(() => parseTrustProxy('true'), 'Test 0: blanket trust proxy true must be rejected');
  assertThrows(() => parseTrustProxy('proxy.example.com'), 'Test 0: untrusted proxy hostnames must be rejected');
  assertThrows(() => parseTrustProxy('11'), 'Test 0: hop counts greater than 10 must be rejected');
  assertThrows(() => parseTrustProxy('-1'), 'Test 0: negative hop counts must be rejected');
  assertThrows(() => parseTrustProxy('256.0.0.1'), 'Test 0: invalid IP addresses must be rejected');
  assertThrows(() => parseTrustProxy('192.168.1.1/33'), 'Test 0: invalid IPv4 CIDR prefix must be rejected');
  assertThrows(() => parseTrustProxy('loopback, invalid-ip'), 'Test 0: lists containing invalid entries must be rejected');
  const appSource = readFileSync(join(__dirname, '../app.ts'), 'utf8');
  assert(app.get('trust proxy') === false && appSource.includes("app.set('trust proxy', ENV.TRUST_PROXY)") && !appSource.includes("app.set('trust proxy', true)"), 'Test 0: application must explicitly keep trust proxy disabled by default');
  console.log('Test 0 - Trust proxy configuration defaults to disabled and rejects unsafe values: passed');

  const forwardedClientIp = '198.51.100.24';
  const trustedProxyApp = express();
  trustedProxyApp.set('trust proxy', parseTrustProxy('loopback'));
  trustedProxyApp.get('/ip', (req, res) => res.json({ ip: req.ip }));
  await withServer(trustedProxyApp, async (server) => {
    const response = await sendRequest(server, '/ip', 'GET', undefined, { 'X-Forwarded-For': forwardedClientIp });
    assert(JSON.parse(response.body).ip === forwardedClientIp, 'Test 0b: trusted proxy must expose the forwarded client IP');
  });

  const untrustedProxyApp = express();
  untrustedProxyApp.set('trust proxy', false);
  untrustedProxyApp.get('/ip', (req, res) => res.json({ ip: req.ip }));
  await withServer(untrustedProxyApp, async (server) => {
    const response = await sendRequest(server, '/ip', 'GET', undefined, { 'X-Forwarded-For': forwardedClientIp });
    assert(JSON.parse(response.body).ip !== forwardedClientIp, 'Test 0b: disabled trust proxy must ignore X-Forwarded-For');
  });

  // Default app instance verification: must not trust spoofed X-Forwarded-For
  const defaultApp = express();
  defaultApp.set('trust proxy', ENV.TRUST_PROXY);
  defaultApp.get('/ip', (req, res) => res.json({ ip: req.ip }));
  await withServer(defaultApp, async (server) => {
    const response = await sendRequest(server, '/ip', 'GET', undefined, { 'X-Forwarded-For': forwardedClientIp });
    assert(JSON.parse(response.body).ip !== forwardedClientIp, 'Test 0b: default app trust proxy must not trust spoofed X-Forwarded-For');
  });
  console.log('Test 0b - Forwarded client IP is accepted only behind an explicit trusted proxy: passed');

  const proxiedLimiterApp = express();
  proxiedLimiterApp.set('trust proxy', parseTrustProxy('loopback'));
  proxiedLimiterApp.post('/login', createAuthRateLimiter({ windowMs: 60_000, max: 1 }), (_req, res) => res.status(204).end());
  await withServer(proxiedLimiterApp, async (server) => {
    const clientA = { 'X-Forwarded-For': '198.51.100.31' };
    const clientB = { 'X-Forwarded-For': '198.51.100.32' };
    assert((await sendRequest(server, '/login', 'POST', undefined, clientA)).statusCode === 204, 'Test 0c: first trusted client request should pass');
    assert((await sendRequest(server, '/login', 'POST', undefined, clientB)).statusCode === 204, 'Test 0c: distinct trusted client request should use a separate bucket');
    assert((await sendRequest(server, '/login', 'POST', undefined, clientA)).statusCode === 429, 'Test 0c: repeated trusted client request should be limited in its own bucket');
  });
  console.log('Test 0c - Rate limiting separates forwarded clients behind a trusted proxy: passed');

  const health = await withServer(app, (server) => sendRequest(server, '/api/health'));
  assert(health.statusCode === 200, 'Test 1: health endpoint should remain available');
  assert(health.headers['x-content-type-options'] === 'nosniff', 'Test 1: Helmet should set security headers');
  console.log('Test 1 - Helmet security headers are applied: passed');

  const registrationApp = express();
  registrationApp.use(express.json());
  registrationApp.use('/api/auth', authRoutes);
  await withServer(registrationApp, async (server) => {
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await sendRequest(server, '/api/auth/register', 'POST', {});
      assert(response.statusCode === 422, 'Test 2: registration must remain active and unrate-limited');
    }
  });
  console.log('Test 2 - Registration route remains active and is not rate limited: passed');

  assert(AUTH_RATE_LIMITS.login.max === 10, 'Test 3: login limit must be 10 requests');
  assert(AUTH_RATE_LIMITS.forgotPassword.max === 5, 'Test 3: forgot-password limit must be 5 requests');
  assert(AUTH_RATE_LIMITS.resetPassword.max === 10, 'Test 3: reset-password limit must be 10 requests');
  assert(
    AUTH_RATE_LIMITS.login.windowMs === 15 * 60 * 1000 &&
      AUTH_RATE_LIMITS.forgotPassword.windowMs === 15 * 60 * 1000 &&
      AUTH_RATE_LIMITS.resetPassword.windowMs === 15 * 60 * 1000,
    'Test 3: every auth limit must use a 15-minute window'
  );

  const limitedApp = express();
  limitedApp.post(
    '/login',
    createAuthRateLimiter({ windowMs: 60_000, max: 2 }),
    (_req, res) => res.status(204).end()
  );
  await withServer(limitedApp, async (server) => {
    const first = await sendRequest(server, '/login', 'POST');
    const second = await sendRequest(server, '/login', 'POST');
    const third = await sendRequest(server, '/login', 'POST', {
      email: 'sensitive@example.com',
      password: 'Never reflect this password',
    });
    assert(first.statusCode === 204 && second.statusCode === 204, 'Test 3: requests within the limit must pass');
    assert(third.statusCode === 429, 'Test 3: requests above the limit must be rejected');
    assert(JSON.parse(third.body).message === AUTH_RATE_LIMIT_MESSAGE, 'Test 3: rejection message must be safe');
    assert(!third.body.includes('sensitive@example.com'), 'Test 3: rejection must not reflect submitted credentials');
  });
  console.log('Test 3 - Auth rate limiter enforces its configured IP limit: passed');

  const loginApp = express();
  loginApp.use(express.json());
  loginApp.use('/api/auth', authRoutes);
  const originalLogin = AuthService.login;
  const originalResetKey = loginRateLimiter.resetKey;
  try {
    (AuthService as any).login = async (input: typeof LOGIN_PAYLOAD) => {
      if (input.password === LOGIN_PAYLOAD.password) {
        return { accessToken: 'test-access-token', refreshToken: 'test-refresh-token', user: { id: 'user-1' } };
      }
      throw new Error('Invalid email or password');
    };

    await withServer(loginApp, async (server) => {
      resetLocalLoginBucket();

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const failed = await sendRequest(server, '/api/auth/login', 'POST', { ...LOGIN_PAYLOAD, password: 'wrong-password' });
        assert(failed.statusCode === 401, 'Test 4: failed login attempts must reach the safe authentication response');
      }

      const success = await sendRequest(server, '/api/auth/login', 'POST', LOGIN_PAYLOAD);
      assert(success.statusCode === 200, 'Test 4: a successful login must complete normally');

      for (let attempt = 0; attempt < AUTH_RATE_LIMITS.login.max; attempt += 1) {
        const failed = await sendRequest(server, '/api/auth/login', 'POST', { ...LOGIN_PAYLOAD, password: 'wrong-password' });
        assert(failed.statusCode === 401, 'Test 4: successful login must reset the previous failed-attempt bucket');
      }
      const blockedAfterReset = await sendRequest(server, '/api/auth/login', 'POST', {
        ...LOGIN_PAYLOAD,
        password: 'never-reflect-this-password',
      });
      assert(blockedAfterReset.statusCode === 429, 'Test 4: repeated failures after a reset must still be rate limited');
      assert(!blockedAfterReset.body.includes(LOGIN_PAYLOAD.email), 'Test 4: login rate-limit response must not reflect an email');
      assert(!blockedAfterReset.body.includes('never-reflect-this-password'), 'Test 4: login rate-limit response must not reflect a password');

      resetLocalLoginBucket();
      for (let attempt = 0; attempt < AUTH_RATE_LIMITS.login.max; attempt += 1) {
        const failed = await sendRequest(server, '/api/auth/login', 'POST', { ...LOGIN_PAYLOAD, password: 'wrong-password' });
        assert(failed.statusCode === 401, 'Test 5: failed login attempts must never reset the bucket');
      }
      const blockedSuccessfulCredential = await sendRequest(server, '/api/auth/login', 'POST', LOGIN_PAYLOAD);
      assert(blockedSuccessfulCredential.statusCode === 429, 'Test 5: a blocked request must not bypass rate limiting before authentication');
    });
    console.log('Test 4-5 - Successful login resets failed attempts; failed login never resets brute-force protection: passed');

    await withServer(loginApp, async (server) => {
      resetLocalLoginBucket();
      (loginRateLimiter as any).resetKey = () => {
        throw new Error('test reset failure');
      };
      const success = await sendRequest(server, '/api/auth/login', 'POST', LOGIN_PAYLOAD);
      assert(success.statusCode === 200, 'Test 6: limiter reset failure must not turn a valid login into a failure');
    });
    console.log('Test 6 - Limiter reset failure is best-effort after successful authentication: passed');
  } finally {
    (AuthService as any).login = originalLogin;
    (loginRateLimiter as any).resetKey = originalResetKey;
    resetLocalLoginBucket();
  }

  const proxiedLoginApp = express();
  proxiedLoginApp.set('trust proxy', parseTrustProxy('loopback'));
  proxiedLoginApp.use(express.json());
  proxiedLoginApp.use('/api/auth', authRoutes);
  const originalProxiedLogin = AuthService.login;
  try {
    (AuthService as any).login = async (input: typeof LOGIN_PAYLOAD) => {
      if (input.password === LOGIN_PAYLOAD.password) {
        return { accessToken: 'test-access-token', refreshToken: 'test-refresh-token', user: { id: 'user-1' } };
      }
      throw new Error('Invalid email or password');
    };

    const clientA = { 'X-Forwarded-For': '198.51.100.41' };
    const clientB = { 'X-Forwarded-For': '198.51.100.42' };
    loginRateLimiter.resetKey(clientA['X-Forwarded-For']);
    loginRateLimiter.resetKey(clientB['X-Forwarded-For']);
    await withServer(proxiedLoginApp, async (server) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        assert((await sendRequest(server, '/api/auth/login', 'POST', { ...LOGIN_PAYLOAD, password: 'wrong-password' }, clientA)).statusCode === 401, 'Test 6b: failed trusted-client logins should accumulate');
        assert((await sendRequest(server, '/api/auth/login', 'POST', { ...LOGIN_PAYLOAD, password: 'wrong-password' }, clientB)).statusCode === 401, 'Test 6b: second client failures should accumulate separately');
      }

      assert((await sendRequest(server, '/api/auth/login', 'POST', LOGIN_PAYLOAD, clientA)).statusCode === 200, 'Test 6b: successful trusted-client login should complete');
      for (let attempt = 0; attempt < AUTH_RATE_LIMITS.login.max; attempt += 1) {
        assert((await sendRequest(server, '/api/auth/login', 'POST', { ...LOGIN_PAYLOAD, password: 'wrong-password' }, clientA)).statusCode === 401, 'Test 6b: successful login must reset only the forwarded client bucket');
      }
      assert((await sendRequest(server, '/api/auth/login', 'POST', { ...LOGIN_PAYLOAD, password: 'wrong-password' }, clientA)).statusCode === 429, 'Test 6b: forwarded client failures should still be limited after reset');

      for (let attempt = 0; attempt < AUTH_RATE_LIMITS.login.max - 4; attempt += 1) {
        assert((await sendRequest(server, '/api/auth/login', 'POST', { ...LOGIN_PAYLOAD, password: 'wrong-password' }, clientB)).statusCode === 401, 'Test 6b: another client bucket must not be reset');
      }
      assert((await sendRequest(server, '/api/auth/login', 'POST', LOGIN_PAYLOAD, clientB)).statusCode === 429, 'Test 6b: successful login for an already-blocked different client must remain limited');
    });
    console.log('Test 6b - Successful login resets only the matching forwarded-client limiter key: passed');
  } finally {
    (AuthService as any).login = originalProxiedLogin;
    loginRateLimiter.resetKey('198.51.100.41');
    loginRateLimiter.resetKey('198.51.100.42');
  }

  const passwordLimiterApp = express();
  passwordLimiterApp.post('/forgot', createAuthRateLimiter(AUTH_RATE_LIMITS.forgotPassword), (_req, res) => res.status(204).end());
  passwordLimiterApp.post('/reset', createAuthRateLimiter(AUTH_RATE_LIMITS.resetPassword), (_req, res) => res.status(204).end());
  await withServer(passwordLimiterApp, async (server) => {
    for (let attempt = 0; attempt < AUTH_RATE_LIMITS.forgotPassword.max; attempt += 1) {
      assert((await sendRequest(server, '/forgot', 'POST')).statusCode === 204, 'Test 7: forgot-password limit must remain unchanged');
    }
    assert((await sendRequest(server, '/forgot', 'POST')).statusCode === 429, 'Test 7: forgot-password limiter must still block above its configured limit');

    for (let attempt = 0; attempt < AUTH_RATE_LIMITS.resetPassword.max; attempt += 1) {
      assert((await sendRequest(server, '/reset', 'POST')).statusCode === 204, 'Test 7: reset-password limit must remain unchanged');
    }
    assert((await sendRequest(server, '/reset', 'POST')).statusCode === 429, 'Test 7: reset-password limiter must still block above its configured limit');
  });

  const proxiedPasswordLimiterApp = express();
  proxiedPasswordLimiterApp.set('trust proxy', parseTrustProxy('loopback'));
  proxiedPasswordLimiterApp.post('/forgot', createAuthRateLimiter(AUTH_RATE_LIMITS.forgotPassword), (_req, res) => res.status(204).end());
  proxiedPasswordLimiterApp.post('/reset', createAuthRateLimiter(AUTH_RATE_LIMITS.resetPassword), (_req, res) => res.status(204).end());
  await withServer(proxiedPasswordLimiterApp, async (server) => {
    const clientA = { 'X-Forwarded-For': '198.51.100.51' };
    const clientB = { 'X-Forwarded-For': '198.51.100.52' };
    for (let attempt = 0; attempt < AUTH_RATE_LIMITS.forgotPassword.max; attempt += 1) {
      assert((await sendRequest(server, '/forgot', 'POST', undefined, clientA)).statusCode === 204, 'Test 7b: forgot-password requests for client A should pass within limit');
    }
    assert((await sendRequest(server, '/forgot', 'POST', undefined, clientA)).statusCode === 429, 'Test 7b: forgot-password client A should be rate limited');
    assert((await sendRequest(server, '/forgot', 'POST', undefined, clientB)).statusCode === 204, 'Test 7b: forgot-password client B should remain unaffected in separate bucket');

    for (let attempt = 0; attempt < AUTH_RATE_LIMITS.resetPassword.max; attempt += 1) {
      assert((await sendRequest(server, '/reset', 'POST', undefined, clientA)).statusCode === 204, 'Test 7b: reset-password requests for client A should pass within limit');
    }
    assert((await sendRequest(server, '/reset', 'POST', undefined, clientA)).statusCode === 429, 'Test 7b: reset-password client A should be rate limited');
    assert((await sendRequest(server, '/reset', 'POST', undefined, clientB)).statusCode === 204, 'Test 7b: reset-password client B should remain unaffected in separate bucket');
  });
  console.log('Test 7 - Forgot-password and reset-password limiters enforce limits and inherit trusted-proxy behavior: passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
