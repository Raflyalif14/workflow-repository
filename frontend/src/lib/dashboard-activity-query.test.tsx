import assert from 'node:assert/strict';
import React from 'react';
const query: typeof import('@tanstack/react-query') = require('@tanstack/react-query');
import * as auth from '../components/auth/auth-provider';
import { useDashboardActivity } from '../hooks/use-dashboard';
import { dashboardKeys } from './query-keys';
import { setAuthTokens, getAuthSession } from './auth';
import { SessionChangedError } from './api-client';
import type { DashboardActivityFilters } from '../types/dashboard';

async function run() {
  const original = { state: React.useRef, effect: React.useEffect, memo: React.useMemo, auth: auth.useAuth, query: query.useQuery, client: query.useQueryClient,
    window: globalThis.window, fetch: globalThis.fetch };
  const store = new Map<string, string>();
  (globalThis as any).window = { localStorage: { getItem: (key: string) => store.get(key) || null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) } };
  setAuthTokens({ accessToken: 'fixture-session-a' });
  let user: any = { id: 'sales-a', role: 'SALES', isActive: true }, hydration = false, options: any, ref: any, refetches = 0;
  let effects: Array<() => void> = [], requests: string[] = [];
  const client = new query.QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  (React as any).useRef = (initial: any) => ref || (ref = { current: initial });
  (React as any).useEffect = (effect: () => void) => effects.push(effect);
  let memo: { deps: unknown[]; value: unknown } | undefined;
  (React as any).useMemo = (compute: () => unknown, deps: unknown[]) => {
    if (!memo || deps.some((value, index) => !Object.is(value, memo!.deps[index]))) memo = { deps, value: compute() };
    return memo.value;
  };
  (auth as any).useAuth = () => ({ user, isLoading: hydration });
  (query as any).useQueryClient = () => client;
  (query as any).useQuery = (value: any) => { options = value; return { refetch: () => { refetches++; } }; };
  globalThis.fetch = async (url: any) => {
    requests.push(String(url));
    return new Response(JSON.stringify({ success: true, data: { items: [], nextCursor: null, pageSize: 8, page: 2, total: 19, totalPages: 3 } }), { status: 200 });
  };
  const render = (page: number | null, enabled = true, filters: DashboardActivityFilters = {}) => { effects = []; const result = useDashboardActivity(page, enabled, filters); effects.forEach(effect => effect()); return result; };
  try {
    const initial = render(null); assert.equal(options.enabled, false); await initial.refetch(); assert.equal(refetches, 0, 'No duplicate initial-page request');
    for (const role of ['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN']) { user = { ...user, role }; render(2); assert.equal(options.enabled, true); }
    user = undefined; const guest = render(2); assert.equal(options.enabled, false); await guest.refetch(); assert.equal(refetches, 0);
    for (const invalid of [{ id: 'x', role: 'SA', isActive: false }, { id: 'x', role: 'SA', isActive: true, mustChangePassword: true }, { id: 'x', role: 'UNKNOWN', isActive: true }]) {
      user = invalid; const disabled = render(2); assert.equal(options.enabled, false); await disabled.refetch(); assert.equal(refetches, 0);
    }
    user = { id: 'sales-a', role: 'SALES', isActive: true }; hydration = true; render(2); assert.equal(options.enabled, false); hydration = false;
    const blocked = render(2, false); assert.equal(options.enabled, false); await blocked.refetch(); assert.equal(refetches, 0);
    const active = render(2); const sessionA = getAuthSession()!;
    assert.deepEqual(options.queryKey, dashboardKeys.activityPage(user.id, sessionA.id, user.role, 2));
    assert.equal(options.refetchInterval, 30000, 'Retain freshness policy only on eligible active page queries');
    const result = await options.queryFn({ signal: new AbortController().signal }); assert.equal(result.pageSize, 8);
    assert(new URL(requests[0]).searchParams.get('page') === '2'); assert.equal(new URL(requests[0]).pathname, '/api/dashboard/activity');
    active.refetch(); assert.equal(refetches, 1);
    const unfilteredKey = options.queryKey;
    const filters = { projectId: 'fixture-project', kind: 'DOCUMENT' as const, from: '2026-10-08T00:00:00.000Z', to: '2026-10-09T00:00:00.000Z' };
    render(2, true, filters); assert.notDeepEqual(options.queryKey, unfilteredKey, 'Filtered pages have distinct cache keys');
    await options.queryFn({ signal: new AbortController().signal });
    const filteredUrl = new URL(requests.at(-1)!); for (const [key, value] of Object.entries(filters)) assert.equal(filteredUrl.searchParams.get(key), value);
    render(2);
    const oldKey = options.queryKey; client.setQueryData(oldKey, result); client.setQueryData(dashboardKeys.overview(), { fixture: true });
    await client.invalidateQueries({ queryKey: dashboardKeys.overview() });
    assert(client.getQueryState(oldKey)?.isInvalidated, 'Existing mutation invalidation covers cursor page caches');
    setAuthTokens({ accessToken: 'fixture-session-b' }); user = { ...user, id: 'sales-b' }; render(2);
    await Promise.resolve(); await Promise.resolve();
    assert.notDeepEqual(options.queryKey, oldKey); assert.equal(client.getQueryData(oldKey), undefined, 'Account/session change removes private page cache');
    let resolve!: (value: Response) => void;
    globalThis.fetch = async () => new Promise<Response>(done => { resolve = done; });
    const inflight = options.queryFn({ signal: new AbortController().signal });
    setAuthTokens({ accessToken: 'fixture-session-c' });
    resolve(new Response(JSON.stringify({ success: true, data: result }), { status: 200 }));
    await assert.rejects(inflight, SessionChangedError, 'Late account response is rejected');
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: null }), { status: 200 });
    render(2); await assert.rejects(() => options.queryFn({ signal: new AbortController().signal }), /Invalid activity response/, 'Missing page data is not an empty history');
    for (const invalid of [
      { items: [], nextCursor: null, pageSize: 8 },
      { items: [], nextCursor: null, pageSize: 8, page: 2, total: 19, totalPages: 2 },
      { items: [], nextCursor: null, pageSize: 8, page: 4, total: 19, totalPages: 3 },
    ]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: invalid }), { status: 200 });
      await assert.rejects(() => options.queryFn({ signal: new AbortController().signal }), /Invalid activity response/);
    }
    console.log('Dashboard activity query: role/hydration eligibility, no first-page duplicate, cursor URL, account/session keys, cache removal, mutation invalidation and late-response protection passed');
  } finally {
    client.clear(); (React as any).useRef = original.state; (React as any).useEffect = original.effect; (React as any).useMemo = original.memo;
    (auth as any).useAuth = original.auth; (query as any).useQuery = original.query; (query as any).useQueryClient = original.client;
    (globalThis as any).window = original.window; globalThis.fetch = original.fetch;
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
