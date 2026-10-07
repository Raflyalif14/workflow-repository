import assert from 'node:assert/strict';
import express from 'express';
import { AddressInfo } from 'net';
import { supabaseAdmin } from '../config/supabase';
import * as config from '../config/supabase';
import authRoutes from '../routes/auth.routes';
import { AuthService } from '../services/auth.service';
import { authenticateUser, requireRoles } from './auth.middleware';
import { errorHandler } from './error.middleware';
import { AUTH_RATE_LIMITS } from './auth-rate-limit.middleware';
import { refreshAuthSession } from '../services/auth-session.service';

async function run() {
  const original = { getUser: supabaseAdmin.auth.getUser, from: supabaseAdmin.from, factory: config.createSupabaseAuthClient, register: AuthService.register };
  let authError: any = null, profileError: any = null, authThrows = false, profileThrows = false;
  let active = true, role = 'SA', refreshError: any = null, refreshThrows = false;
  let controllerCalls = 0, registrations = 0, authCreates = 0, emails = 0, profiles = 0, factories = 0;
  let registerFails = '';
  (supabaseAdmin.auth as any).getUser = async () => {
    if (authThrows) throw new Error('private auth details');
    return { data: { user: { id: 'verified-user' } }, error: authError };
  };
  (supabaseAdmin as any).from = (table: string) => {
    assert.equal(table, 'users');
    const query: any = { select: (columns: string) => { assert(!columns.includes('*')); return query; }, eq: (key: string, value: string) => { assert.equal(key, 'id'); assert.equal(value, 'verified-user'); return query; },
      single: async () => { profiles++; if (profileThrows) throw new Error('private database details'); return { data: { id: 'verified-user', is_active: active, role, must_change_password: false }, error: profileError }; } };
    return query;
  };
  (config as any).createSupabaseAuthClient = () => {
    factories++;
    return { auth: { refreshSession: async (input: any) => {
      assert.equal(input.refresh_token, 'test-refresh');
      if (refreshThrows) throw new Error('private refresh details');
      return { data: { user: { id: 'verified-user' }, session: { access_token: 'test-access', refresh_token: 'test-rotated' } }, error: refreshError };
    } } };
  };
  AuthService.register = async () => {
    registrations++; if (registerFails) throw new Error(registerFails);
    authCreates++; emails++; return {} as any;
  };
  let errorCalls = 0, finished = 0, started = 0;
  const app = express();
  app.use((_req,res,next) => { started++; res.on('finish', () => finished++); next(); });
  app.use(express.json()); app.use('/api/auth', authRoutes);
  app.post('/protected', authenticateUser, requireRoles(['SA']), (_req,res) => { controllerCalls++; res.json({ success: true }); });
  app.use((error: any, req: any, res: any, next: any) => { errorCalls++; errorHandler(error, req, res, next); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (path: string, payload?: unknown, bearer = true) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer local-test' } : {}) }, body: JSON.stringify(payload || {}) });
    const body = await response.json() as any; return { response, body };
  };
  try {
    for (const source of ['auth', 'profile']) {
      authThrows = source === 'auth'; profileThrows = source === 'profile';
      const before = errorCalls;
      const result = await request('/protected');
      assert.equal(result.response.status, 503); assert.equal(result.body.errors.code, 'AUTH_UNAVAILABLE');
      assert(!JSON.stringify(result.body).includes('private')); assert(!JSON.stringify(result.body).includes('stack'));
      assert.equal(errorCalls, before + 1); assert.equal(controllerCalls, 0);
      authThrows = profileThrows = false;
    }
    authError = { status: 503 }; assert.equal((await request('/protected')).response.status, 503); assert.equal(controllerCalls, 0);
    authError = { status: 401, code: 'bad_jwt' }; assert.equal((await request('/protected')).body.errors.code, 'AUTH_TOKEN_INVALID');
    authError = null; profileError = { code: '08006' }; assert.equal((await request('/protected')).response.status, 503);
    profileError = null; active = false; const inactive = await request('/protected'); assert.equal(inactive.response.status, 401); assert.equal(inactive.body.errors.code, 'AUTH_ACCOUNT_INACTIVE');
    active = true; role = 'SALES'; assert.equal((await request('/protected')).response.status, 403); assert.equal(controllerCalls, 0);
    role = 'SA'; assert.equal((await request('/protected')).response.status, 200); assert.equal(controllerCalls, 1);
    assert.equal((await request('/protected', {}, false)).response.status, 401); assert.equal(controllerCalls, 1);

    const refreshed = await request('/api/auth/refresh', { refreshToken: 'test-refresh' }, false);
    assert.equal(refreshed.response.status, 200); assert.equal(refreshed.response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(refreshed.body.data, { accessToken: 'test-access', refreshToken: 'test-rotated' });
    assert.equal(factories, 1); assert(!('user' in refreshed.body.data));
    await refreshAuthSession('test-refresh'); assert.equal(factories, 2, 'Every request gets its own SDK client');
    for (const error of [{ status: 400, code: 'refresh_token_not_found' }, { status: 400, code: 'refresh_token_already_used' }, { status: 401 }]) {
      refreshError = error; const result = await request('/api/auth/refresh', { refreshToken: 'test-refresh' }, false);
      assert.equal(result.response.status, 401); assert.equal(result.body.errors.code, 'AUTH_REFRESH_INVALID');
    }
    for (const status of [0, 429, 500]) {
      refreshError = { status }; const result = await request('/api/auth/refresh', { refreshToken: 'test-refresh' }, false);
      assert.equal(result.response.status, status === 429 ? 429 : 503); assert(!JSON.stringify(result.body).includes('test-refresh'));
    }
    refreshError = null; refreshThrows = true;
    const thrown = await request('/api/auth/refresh', { refreshToken: 'test-refresh' }, false); assert.equal(thrown.response.status, 503); assert(!JSON.stringify(thrown.body).includes('private'));
    refreshThrows = false; active = false; assert.equal((await request('/api/auth/refresh', { refreshToken: 'test-refresh' }, false)).body.errors.code, 'AUTH_ACCOUNT_INACTIVE'); active = true;
    const reads = profiles;
    const invalidInput = await request('/api/auth/refresh', { refreshToken: 'test-refresh', role: 'SUPER_ADMIN' }, false);
    assert.equal(invalidInput.response.status, 422); assert.equal(profiles, reads);
    assert.equal((await request('/api/auth/refresh', {}, false)).response.status, 422);
    const malformed = await fetch(base + '/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"refreshToken":"private-test-body" invalid}' });
    assert.equal(malformed.status, 400);
    const malformedBody = await malformed.text(); assert(!malformedBody.includes('private-test-body')); assert(!malformedBody.includes('stack'));

    const payload = { full_name: 'Local Test', email: 'local@example.test' };
    registerFails = 'Email is already registered.'; const duplicate = await request('/api/auth/register', payload, false);
    registerFails = 'private provider failure'; const ordinary = await request('/api/auth/register', payload, false);
    assert.equal(duplicate.response.status, ordinary.response.status); assert.deepEqual(duplicate.body, ordinary.body);
    registerFails = '';
    for (let i = registrations; i < AUTH_RATE_LIMITS.register.max; i++) assert.equal((await request('/api/auth/register', payload, false)).response.status, 201);
    const before = { registrations, authCreates, emails };
    const limited = await request('/api/auth/register', payload, false);
    assert.equal(limited.response.status, 429); assert(limited.response.headers.has('ratelimit-limit'));
    assert.deepEqual({ registrations, authCreates, emails }, before, 'Limited requests perform no account/email operations');
    assert.equal(limited.body.message, 'Too many requests. Please try again later.');
    assert.equal(finished, started, 'Every request finishes exactly once, including forwarded async errors');
    console.log('Auth HTTP: refresh validation/isolation, inactive/role guards, transient/invalid distinction, safe async errors and register limiter passed.');
  } finally {
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
    (supabaseAdmin.auth as any).getUser = original.getUser; supabaseAdmin.from = original.from;
    (config as any).createSupabaseAuthClient = original.factory; AuthService.register = original.register;
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
