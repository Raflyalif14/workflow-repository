import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Module from "node:module";
import { clearStoredAuth, getAuthSession, setAuthTokens } from "./auth";
import * as activity from "./session-activity";
import * as profiles from "./auth-profile";
import { setActiveLanguage } from "../i18n";

const events = new EventTarget(), storage = new Map<string,string>();
(globalThis as any).window = { localStorage: { getItem: (k:string) => storage.get(k) ?? null, setItem: (k:string,v:string) => storage.set(k,v), removeItem: (k:string) => storage.delete(k) },
  addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) };
const response = (status:number, data?:unknown, code?:string) => new Response(JSON.stringify({ message: 'safe', data, errors: { code } }), { status });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = <T,>() => { let resolve!: (value:T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; };
const originalLoad = (Module as any)._load, originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout;
const recoveryTimers = new Map<ReturnType<typeof setTimeout>, () => void>();
(globalThis as any).setTimeout = (callback: () => void, delay: number) => {
  const timer = originalSetTimeout(callback, delay);
  if (delay === 10_000) recoveryTimers.set(timer, callback);
  return timer;
};
(globalThis as any).clearTimeout = (timer: ReturnType<typeof setTimeout>) => {
  recoveryTimers.delete(timer);
  originalClearTimeout(timer);
};
const originalActivity = activity.startSessionActivity;
(activity as any).startSessionActivity = () => () => {};
const originalVerify = profiles.loadVerifiedProfileWithRetry;
(profiles as any).loadVerifiedProfileWithRetry = (session: any, current: () => boolean) => originalVerify(session, current, async () => {});
const redirects: string[] = []; let cacheClears = 0;
const router = { replace: (path:string) => redirects.push(path) }, cache = { clear: () => cacheClears++ };
(Module as any)._load = function(name:string, ...args:any[]) {
  if (name === 'next/navigation') return { usePathname: () => '/projects/test', useRouter: () => router };
  if (name === '@tanstack/react-query') return { useQueryClient: () => cache };
  return originalLoad.call(this,name,...args);
};
const { AuthProvider } = require('../components/auth/auth-provider') as typeof import('../components/auth/auth-provider');
(Module as any)._load = originalLoad;
const slots: any[] = [], cleanups: (()=>void)[] = [];
let cursor = 0, effects: (()=>void)[] = [];
const hooks = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useMemo: React.useMemo, useCallback: React.useCallback };
const child = React.createElement('form', { 'data-testid':'preserved' });
function render() {
  cursor=0; effects=[];
  (React as any).useState = (initial:any) => { const index=cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], (value:any) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; };
  (React as any).useRef = (initial:any) => { const index=cursor++; return slots[index] ??= { current: initial }; };
  (React as any).useMemo = (fn:()=>any) => { cursor++; return fn(); };
  (React as any).useCallback = (fn:any, deps:any[]) => {
    const index=cursor++;
    if (!slots[index] || deps.some((dep,i) => dep !== slots[index].deps[i])) slots[index]={ deps, callback:fn };
    return slots[index].callback;
  };
  (React as any).useEffect = (fn:()=>any,deps:any[]) => { const index=cursor++; if (!slots[index] || deps.some((dep,i) => dep !== slots[index][i])) { slots[index]=deps; effects.push(() => { cleanups[index]?.(); cleanups[index]=fn(); }); } };
  let tree: React.ReactElement<any>;
  try { tree = AuthProvider({ children: child }); }
  finally { Object.assign(React,hooks); }
  effects.forEach(effect => effect());
  return tree;
}
async function settle() { for (let i=0;i<5;i++) await tick(); return render(); }
async function run() {
  try {
    setAuthTokens({ accessToken:'old',refreshToken:'refresh' });
    const storedSession = getAuthSession()!;
    globalThis.fetch = (async () => response(503)) as typeof fetch;
    render(); let tree = await settle();
    assert.equal(tree.props.value.user,null); assert.equal(tree.props.value.profileError,'temporary');
    assert.equal(getAuthSession()?.id,storedSession.id,'An unavailable profile service preserves the session on reload');
    assert.notEqual(tree.props.children,child,'Unverified role cannot open protected UI');
    assert.equal(redirects.length,0,'A temporary failure must not redirect to login');
    for (const locale of ['en','id'] as const) {
      setActiveLanguage(locale);
      const markup = renderToStaticMarkup(tree.props.children);
      assert(markup.includes(locale === 'en' ? 'Reconnecting automatically' : 'menyambungkan kembali secara otomatis'));
      assert(!markup.includes('<button'), 'Reconnection requires no verification buttons');
    }
    setActiveLanguage('en');
    assert.equal(recoveryTimers.size,1,'An outage schedules one automatic recovery timer');
    const [timer, retry] = [...recoveryTimers][0];
    clearTimeout(timer);
    retry();
    render();
    tree=await settle();
    assert.equal(tree.props.value.profileError,'temporary');
    assert.equal(getAuthSession()?.id,storedSession.id);
    assert.equal(recoveryTimers.size,1,'A persistent outage schedules the next recovery attempt');
    let recoveryCalls = 0;
    globalThis.fetch = (async () => { recoveryCalls++; return response(200,{ id:'user-a',role:'SA',is_active:true }); }) as typeof fetch;
    events.dispatchEvent(new Event('online'));
    events.dispatchEvent(new Event('focus'));
    tree=await settle();
    assert.equal(tree.props.value.user.id,'user-a'); assert.equal(tree.props.children,child);
    assert.equal(getAuthSession()?.id,storedSession.id,'Reconnecting restores the original session');
    assert.equal(recoveryCalls,1,'Online and focus events must not start duplicate recovery requests');
    assert.equal(recoveryTimers.size,0,'Successful recovery removes its timer');
    const previousCacheClears = cacheClears;
    globalThis.fetch = (async () => { throw new TypeError('Network unavailable'); }) as typeof fetch;
    await tree.props.value.retryProfile(); tree=render();
    assert.equal(tree.props.value.user.id,'user-a'); assert.equal(tree.props.value.profileError,'temporary');
    assert.equal(tree.props.children,child,'Previously verified work remains visible during a connection outage');
    assert.equal(cacheClears,previousCacheClears,'A connection outage must preserve private work in the current session');
    assert.equal(getAuthSession()?.id,storedSession.id);
    globalThis.fetch = (async () => response(200,{ id:'user-a',role:'SA',is_active:true })) as typeof fetch;
    events.dispatchEvent(new Event('focus'));
    tree=await settle();
    assert.equal(tree.props.value.profileError,null,'Focusing the browser retries profile verification');
    let temporaryCalls=0;
    globalThis.fetch = (async () => ++temporaryCalls===1 ? response(503) : response(200,{id:'user-a',role:'SA',is_active:true})) as typeof fetch;
    await tree.props.value.retryProfile(); tree=render();
    assert.equal(tree.props.value.user.id,'user-a'); assert.equal(tree.props.value.profileError,null);
    assert.equal(tree.props.children,child,'An automatic retry recovers a brief outage'); assert(getAuthSession());
    for (const locale of ['en','id'] as const) { setActiveLanguage(locale); assert.equal(render().props.children,child); }
    globalThis.fetch = (async () => response(403)) as typeof fetch;
    await tree.props.value.retryProfile(); tree=render();
    assert.equal(tree.props.value.profileError,null); assert.equal(tree.props.value.user,null); assert.equal(getAuthSession(),null);
    assert.equal(recoveryTimers.size,0,'Forbidden sessions must not keep retrying');
    assert.notEqual(tree.props.children,child,'Forbidden verification logs out and hides protected content');
    setAuthTokens({ accessToken:'another',refreshToken:'another-refresh' });
    globalThis.fetch = (async () => response(200,{id:'user-a',role:'SA',is_active:true})) as typeof fetch;
    await tree.props.value.retryProfile(); tree=render(); assert.equal(tree.props.children,child);

    const delayed=deferred<Response>(); globalThis.fetch=(async () => delayed.promise) as typeof fetch;
    const oldProfile=tree.props.value.retryProfile();
    const token = getAuthSession()!.accessToken;
    // Local logout invalidates immediately, before remote sign-out completes.
    const loggingOut=tree.props.value.logout(); assert.equal(getAuthSession(),null);
    globalThis.fetch=(async () => response(200,{ accessToken:'other-token',refreshToken:'other-refresh',user:{ id:'user-b',role:'HEAD_SA',is_active:true } })) as typeof fetch;
    const afterLogout=render(); await afterLogout.props.value.login({ email:'local@test.invalid',password:'local-password' });
    delayed.resolve(response(200,{ id:'user-a',role:'SA',is_active:true })); await Promise.all([oldProfile,loggingOut]);
    tree=render(); assert.equal(tree.props.value.user.id,'user-b'); assert.equal(getAuthSession()?.accessToken,'other-token'); assert.notEqual(token,'other-token');
    assert.equal(tree.props.value.profileError,null); assert.equal(recoveryTimers.size,0,'An old account request cannot schedule retries for the new account');
    assert(cacheClears>=2);
    globalThis.fetch=(async () => response(401,undefined,'AUTH_ACCOUNT_INACTIVE')) as typeof fetch;
    await tree.props.value.retryProfile(); tree=render(); assert.equal(tree.props.value.user,null); assert.equal(getAuthSession(),null); assert.notEqual(tree.props.children,child);
    setAuthTokens({ accessToken:'expired-access',refreshToken:'expired-refresh' });
    globalThis.fetch=(async (url) => String(url).endsWith('/auth/refresh')
      ? response(401,undefined,'AUTH_REFRESH_INVALID')
      : response(401,undefined,'AUTH_TOKEN_INVALID')) as typeof fetch;
    await tree.props.value.retryProfile(); tree=render();
    assert.equal(getAuthSession(),null,'Expired refresh credentials must still clear the session');
    assert.equal(tree.props.value.user,null); assert.equal(recoveryTimers.size,0);
    assert(redirects.some(path => path.startsWith('/login?next=')),'Invalid sessions return to login');
    console.log('AuthProvider: connection recovery, session/cache preservation, forbidden/expired logout, protected content and account-switch race passed.');
  } finally {
    (activity as any).startSessionActivity=originalActivity;
    (profiles as any).loadVerifiedProfileWithRetry=originalVerify;
    cleanups.forEach(stop => stop?.());
    for (const timer of recoveryTimers.keys()) originalClearTimeout(timer);
    globalThis.setTimeout=originalSetTimeout;
    globalThis.clearTimeout=originalClearTimeout;
    Object.assign(React,hooks); globalThis.fetch=originalFetch; setActiveLanguage('en'); clearStoredAuth();
  }
}
run().catch(error => { console.error(error); process.exitCode=1; });
