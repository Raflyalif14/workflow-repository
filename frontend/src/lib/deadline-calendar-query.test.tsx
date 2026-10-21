import assert from 'node:assert/strict';
const query: typeof import('@tanstack/react-query') = require('@tanstack/react-query');
import * as auth from '../components/auth/auth-provider';
import { useDeadlineCalendar } from '../hooks/use-deadline-calendar';
import { getAuthSession, setAuthTokens } from './auth';
import { SessionChangedError } from './api-client';
import { projectKeys } from './query-keys';

async function run() {
  const original = { auth: auth.useAuth, query: query.useQuery, window: globalThis.window, fetch: globalThis.fetch };
  const store = new Map<string, string>();
  (globalThis as any).window = { localStorage: { getItem: (key: string) => store.get(key) || null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) } };
  let user: any = { id: 'account-a', role: 'SA', isActive: true }, isLoading = false, options: any, requested: URL | undefined;
  (auth as any).useAuth = () => ({ user, isLoading });
  (query as any).useQuery = (value: any) => { options = value; return {}; };
  const client = new query.QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  try {
    useDeadlineCalendar('2026-10'); assert.equal(options.enabled, false, 'No session, no request');
    setAuthTokens({ accessToken: 'fixture-a' });
    for (const role of ['SA', 'SALES', 'HEAD_SA', 'SUPER_ADMIN']) { user.role = role; useDeadlineCalendar('2026-10'); assert.equal(options.enabled, true); }
    for (const invalid of [undefined, { id: 'a', role: 'SA', isActive: false }, { id: 'a', role: 'SA', isActive: true, mustChangePassword: true }, { id: 'a', role: 'UNKNOWN', isActive: true }]) {
      user = invalid; useDeadlineCalendar('2026-10'); assert.equal(options.enabled, false);
      await assert.rejects(() => options.queryFn({ signal: new AbortController().signal }), SessionChangedError);
    }
    user = { id: 'account-a', role: 'SA', isActive: true }; isLoading = true;
    useDeadlineCalendar('2026-10'); assert.equal(options.enabled, false); isLoading = false;
    useDeadlineCalendar('2026-10');
    const key = options.queryKey;
    assert.deepEqual(key, [...projectKeys.all(), 'deadline-calendar', user.id, getAuthSession()!.id, user.role, '2026-10']);
    const signal = new AbortController().signal;
    globalThis.fetch = async (url: any, init: any) => {
      requested = new URL(url); assert.equal(init.signal, signal, 'Forward cancellation');
      return new Response(JSON.stringify({ success: true, data: { month: '2026-10', items: [] } }));
    };
    await options.queryFn({ signal });
    assert.equal(requested!.pathname, '/api/me/deadline-calendar'); assert.equal(requested!.searchParams.get('month'), '2026-10');
    client.setQueryData(key, { month: '2026-10', items: [] });
    await client.invalidateQueries({ queryKey: projectKeys.all() });
    assert(client.getQueryState(key)?.isInvalidated, 'Existing project/milestone writes invalidate the calendar');
    useDeadlineCalendar('2026-11'); assert.notDeepEqual(options.queryKey, key, 'Month cache isolation');
    let resolve!: (response: Response) => void;
    globalThis.fetch = async () => new Promise<Response>(done => { resolve = done; });
    useDeadlineCalendar('2026-10'); const pending = options.queryFn({ signal });
    setAuthTokens({ accessToken: 'fixture-b' }); user = { ...user, id: 'account-b' };
    resolve(new Response(JSON.stringify({ success: true, data: { month: '2026-10', items: [] } })));
    await assert.rejects(pending, SessionChangedError, 'Reject a late response from the previous login');
    useDeadlineCalendar('2026-10'); assert.notDeepEqual(options.queryKey, key);
    for (const data of [null, { month: '2026-11', items: [] }, { month: '2026-10', items: null }]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data }));
      await assert.rejects(() => options.queryFn({ signal }), /Invalid calendar response/);
    }
    console.log('Calendar query: account/role/month isolation, eligibility, cancellation, invalidation, late-session and malformed responses passed.');
  } finally {
    client.clear(); (auth as any).useAuth = original.auth; (query as any).useQuery = original.query;
    (globalThis as any).window = original.window; globalThis.fetch = original.fetch;
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
