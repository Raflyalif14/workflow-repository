import assert from 'node:assert/strict';
import { once } from 'node:events';
import { getAuthSession, setAuthTokens } from './auth';

// Real client -> loopback HTTP -> real auth/controller/Multer. Provider,
// profile and persistence are in-memory fixtures, not PostgreSQL/Storage.
async function run() {
  const express = require('../../../backend/node_modules/express');
  const config = require('../../../backend/src/config/supabase');
  const { OutputDocumentService } = require('../../../backend/src/services/output-document.service');
  const originals = { getUser: config.supabaseAdmin.auth.getUser, from: config.supabaseAdmin.from,
    factory: config.createSupabaseAuthClient, upload: OutputDocumentService.upload,
    window: (globalThis as any).window, apiUrl: process.env.NEXT_PUBLIC_API_URL };
  const storage = new Map<string, string>(), events = new EventTarget();
  (globalThis as any).window = { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  }, addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) };
  let expiredRequests = 0, refreshes = 0, controllers = 0, writes = 0;
  let role = 'SA', profileFailed = false, requests = 0;
  let release!: () => void;
  const bothExpired = new Promise<void>(resolve => { release = resolve; });
  const receiptId = '10000000-0000-4000-8000-000000000001';
  const receipts = new Map<string, unknown>();
  let server: import('node:http').Server | undefined;
  try {
    config.supabaseAdmin.auth.getUser = async (token: string) => {
      if (token === 'fixture-expired') {
        expiredRequests++; if (expiredRequests === 2) release();
        await bothExpired;
        return { data: { user: null }, error: { status: 401, code: 'jwt_expired' } };
      }
      assert.equal(token, 'fixture-current');
      return { data: { user: { id: 'fixture-pic' } }, error: null };
    };
    config.supabaseAdmin.from = (table: string) => {
      assert.equal(table, 'users', 'No live project/database read is allowed');
      const query = { select: () => query, eq: () => query, single: async () => ({
        data: profileFailed ? null : { id: 'fixture-pic', role, is_active: true,
          full_name: 'Fixture', must_change_password: false, preferred_language: 'en' },
        error: profileFailed ? { code: '08006' } : null,
      }) };
      return query;
    };
    config.createSupabaseAuthClient = () => ({ auth: { refreshSession: async (input: any) => {
      refreshes++; assert.equal(input.refresh_token, 'fixture-refresh');
      return { data: { user: { id: 'fixture-pic' }, session: {
        access_token: 'fixture-current', refresh_token: 'fixture-rotated',
      } }, error: null };
    } } });
    OutputDocumentService.upload = async (project: string, key: string, file: any, actor: any, input: any) => {
      controllers++; assert.equal(project, 'fixture-project'); assert.equal(key, 'proposal_teknis');
      assert.equal(actor.userId, 'fixture-pic'); assert.equal(actor.role, 'SA');
      assert.equal(input.request_id, receiptId); assert.equal(input.expected_draft_revision, 8);
      assert.equal(input.replace_file_id, receiptId); assert.equal(file.originalname, 'fixture.pdf');
      assert.equal(file.buffer.toString(), 'fixture bytes');
      if (!receipts.has(input.request_id)) { writes++; receipts.set(input.request_id, { draftRevision: 9 }); }
      return receipts.get(input.request_id);
    };
    const app = express();
    app.use((_req: any, _res: any, next: () => void) => { requests++; next(); });
    app.use(express.json());
    app.use('/api/auth', require('../../../backend/src/routes/auth.routes').default);
    app.use('/api/projects', require('../../../backend/src/routes/project.routes').default);
    app.use(require('../../../backend/src/middlewares/error.middleware').errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server!, 'listening');
    const port = (server!.address() as import('node:net').AddressInfo).port;
    process.env.NEXT_PUBLIC_API_URL = `http://127.0.0.1:${port}/api`;
    // Load after choosing the owned ephemeral port; no existing server is used.
    const { apiClient, ApiError } = require('./api-client');
    setAuthTokens({ accessToken: 'fixture-expired', refreshToken: 'fixture-refresh' });
    const sessionId = getAuthSession()!.id;
    const form = new FormData();
    form.append('file', new File(['fixture bytes'], 'fixture.pdf', { type: 'application/pdf' }));
    form.append('request_id', receiptId); form.append('expected_draft_revision', '8');
    form.append('replace_file_id', receiptId);
    const endpoint = '/projects/fixture-project/output-documents/proposal_teknis/upload';
    const result = await Promise.all([apiClient(endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) }),
      apiClient(endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) })]);
    assert.deepEqual(result, [{ draftRevision: 9 }, { draftRevision: 9 }]);
    assert.equal(expiredRequests, 2); assert.equal(refreshes, 1);
    assert.equal(controllers, 2, '401 requests stop before the upload controller');
    assert.equal(writes, 1, 'Fixture receipt receives the original ID on both successful requests');
    assert.deepEqual(getAuthSession(), { id: sessionId, accessToken: 'fixture-current', refreshToken: 'fixture-rotated' });
    role = 'SALES';
    await assert.rejects(apiClient(endpoint, { method: 'POST', body: form }), (error: any) => error instanceof ApiError && error.status === 403);
    assert.equal(refreshes, 1); assert.equal(controllers, 2); assert.equal(writes, 1);
    role = 'SA'; profileFailed = true;
    const before = requests;
    await assert.rejects(apiClient('/auth/me'), (error: any) => error instanceof ApiError && error.status === 503);
    assert.equal(requests, before + 1, 'Profile 503 is not automatically replayed');
    assert.equal(getAuthSession()!.id, sessionId);
    profileFailed = false;
    await apiClient('/auth/me');
    assert.equal(refreshes, 1, 'Explicit profile retry uses the retained session');
    console.log('Auth/upload HTTP: concurrent refresh, multipart replay, receipt forwarding, role rejection and profile retry passed');
  } finally {
    release(); // Also release pending middleware if a failed request aborts the barrier.
    if (server) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve())); }
    config.supabaseAdmin.auth.getUser = originals.getUser; config.supabaseAdmin.from = originals.from;
    config.createSupabaseAuthClient = originals.factory; OutputDocumentService.upload = originals.upload;
    (globalThis as any).window = originals.window;
    if (originals.apiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originals.apiUrl;
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
