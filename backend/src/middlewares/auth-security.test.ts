import { AddressInfo } from 'net';
import { request as httpRequest, Server } from 'http';
import express, { Application } from 'express';
import app from '../app';
import authRoutes from '../routes/auth.routes';
import {
  AUTH_RATE_LIMIT_MESSAGE,
  AUTH_RATE_LIMITS,
  createAuthRateLimiter,
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

const sendRequest = (server: Server, path: string, method = 'GET', payload?: unknown): Promise<HttpResponse> => {
  const address = server.address() as AddressInfo;
  const body = payload === undefined ? undefined : JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method,
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            }
          : undefined,
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

async function run(): Promise<void> {
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
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
