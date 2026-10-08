import assert from 'node:assert/strict';
import React from 'react';
const query: typeof import('@tanstack/react-query') = require('@tanstack/react-query');
import * as auth from '../components/auth/auth-provider';
import { useDashboardActivity } from '../hooks/use-dashboard';
import { dashboardKeys } from './query-keys';
import { setAuthTokens, getAuthSession } from './auth';
import { SessionChangedError } from './api-client';

async function run() {
  const original = { state: React.useRef, effect: React.useEffect, auth: auth.useAuth, query: query.useQuery, client: query.useQueryClient,
    window: globalThis.window, fetch: globalThis.fetch };
  const store = new Map<string, string>();
  (globalThis as any).window = { localStorage: { getItem: (key: string) => store.get(key) || null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) } };
  setAuthTokens({ accessToken: 'fixture-session-a' });
  let user: any = { id: 'sales-a', role: 'SALES', isActive: true }, hydration = false, options: any, ref: any, refetches = 0;
  let effects: Array<() => void> = [], requests: string[] = [];
  const client = new query.QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  (React as any).useRef = (initial: any) => ref || (ref = { current: initial });
  (React as any).useEffect = (effect: () => void) => effects.push(effect);
  (auth as any).useAuth = () => ({ user, isLoading: hydration });
  (query as any).useQueryClient = () => client;
  (query as any).useQuery = (value: any) => { options = value; return { refetch: () => { refetches++; } }; };
  globalThis.fetch = async (url: any) => {
    requests.push(String(url));
    return new Response(JSON.stringify({ success: true, data: { items: [], nextCursor: null, pageSize: 8 } }), { status: 200 });
  };
  const render = (cursor: string | null, enabled = true) => { effects = []; const result = useDashboardActivity(cursor, enabled); effects.forEach(effect => effect()); return result; };
  try {
    const initial = render(null); assert.equal(options.enabled, false); await initial.refetch(); assert.equal(refetches, 0, 'No duplicate initial-page request');
    for (const role of ['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN']) { user = { ...user, role }; render('cursor-8'); assert.equal(options.enabled, true); }
    user = undefined; const guest = render('cursor-8'); assert.equal(options.enabled, false); await guest.refetch(); assert.equal(refetches, 0);
    for (const invalid of [{ id: 'x', role: 'SA', isActive: false }, { id: 'x', role: 'SA', isActive: true, mustChangePassword: true }, { id: 'x', role: 'UNKNOWN', isActive: true }]) {
      user = invalid; const disabled = render('cursor-8'); assert.equal(options.enabled, false); await disabled.refetch(); assert.equal(refetches, 0);
    }
    user = { id: 'sales-a', role: 'SALES', isActive: true }; hydration = true; render('cursor-8'); assert.equal(options.enabled, false); hydration = false;
    const blocked = render('cursor-8', false); assert.equal(options.enabled, false); await blocked.refetch(); assert.equal(refetches, 0);
    const active = render('cursor-8'); const sessionA = getAuthSession()!;
    assert.deepEqual(options.queryKey, dashboardKeys.activityPage(user.id, sessionA.id, user.role, 'cursor-8'));
    assert.equal(options.refetchInterval, 30000, 'Retain freshness policy only on eligible active page queries');
    const result = await options.queryFn({ signal: new AbortController().signal }); assert.equal(result.pageSize, 8);
    assert(new URL(requests[0]).searchParams.get('cursor') === 'cursor-8'); assert.equal(new URL(requests[0]).pathname, '/api/dashboard/activity');
    active.refetch(); assert.equal(refetches, 1);
    const oldKey = options.queryKey; client.setQueryData(oldKey, result); client.setQueryData(dashboardKeys.overview(), { fixture: true });
    await client.invalidateQueries({ queryKey: dashboardKeys.overview() });
    assert(client.getQueryState(oldKey)?.isInvalidated, 'Existing mutation invalidation covers cursor page caches');
    setAuthTokens({ accessToken: 'fixture-session-b' }); user = { ...user, id: 'sales-b' }; render('cursor-8');
    await Promise.resolve(); await Promise.resolve();
    assert.notDeepEqual(options.queryKey, oldKey); assert.equal(client.getQueryData(oldKey), undefined, 'Account/session change removes private page cache');
    let resolve!: (value: Response) => void;
    globalThis.fetch = async () => new Promise<Response>(done => { resolve = done; });
    const inflight = options.queryFn({ signal: new AbortController().signal });
    setAuthTokens({ accessToken: 'fixture-session-c' });
    resolve(new Response(JSON.stringify({ success: true, data: result }), { status: 200 }));
    await assert.rejects(inflight, SessionChangedError, 'Late account response is rejected');
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: null }), { status: 200 });
    render('cursor-8'); await assert.rejects(() => options.queryFn({ signal: new AbortController().signal }), /Invalid activity response/, 'Missing page data is not an empty history');
    console.log('Dashboard activity query: role/hydration eligibility, no first-page duplicate, cursor URL, account/session keys, cache removal, mutation invalidation and late-response protection passed');
  } finally {
    client.clear(); (React as any).useRef = original.state; (React as any).useEffect = original.effect;
    (auth as any).useAuth = original.auth; (query as any).useQuery = original.query; (query as any).useQueryClient = original.client;
    (globalThis as any).window = original.window; globalThis.fetch = original.fetch;
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
