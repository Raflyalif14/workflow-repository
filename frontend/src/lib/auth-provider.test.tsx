import assert from "node:assert/strict";
import React from "react";
import Module from "node:module";
import { clearStoredAuth, getAuthSession, setAuthTokens } from "./auth";
import { setActiveLanguage, translate } from "../i18n";

const events = new EventTarget(), storage = new Map<string,string>();
(globalThis as any).window = { localStorage: { getItem: (k:string) => storage.get(k) ?? null, setItem: (k:string,v:string) => storage.set(k,v), removeItem: (k:string) => storage.delete(k) },
  addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) };
const response = (status:number, data?:unknown, code?:string) => new Response(JSON.stringify({ message: 'safe', data, errors: { code } }), { status });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = <T,>() => { let resolve!: (value:T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; };
const originalLoad = (Module as any)._load, originalFetch = globalThis.fetch;
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
  (React as any).useCallback = (fn:any) => { cursor++; return fn; };
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
    globalThis.fetch = (async () => response(503)) as typeof fetch;
    render(); let tree = await settle();
    assert.equal(tree.props.value.user,null); assert.equal(tree.props.value.profileError,'temporary');
    assert.notEqual(tree.props.children,child,'Initial unverified role cannot open protected UI'); assert.equal(redirects.length,0);
    globalThis.fetch = (async () => response(200,{ id:'user-a',role:'SA',is_active:true })) as typeof fetch;
    await tree.props.value.retryProfile(); tree=render();
    assert.equal(tree.props.value.user.id,'user-a'); assert.equal(tree.props.children,child);
    globalThis.fetch = (async () => response(503)) as typeof fetch;
    await tree.props.value.retryProfile(); tree=render();
    assert.equal(tree.props.value.user.id,'user-a'); assert.equal(tree.props.value.profileError,'temporary');
    assert.equal(tree.props.children,child,'Temporary failure preserves the mounted child subtree'); assert(getAuthSession());
    for (const locale of ['en','id'] as const) { setActiveLanguage(locale); const rerender = render(); assert.equal(rerender.props.children,child); assert.equal(rerender.props.value.user.id,'user-a'); assert.notEqual(translate('auth.retrySession'), 'auth.retrySession'); }
    globalThis.fetch = (async () => response(403)) as typeof fetch;
    await tree.props.value.retryProfile(); tree=render();
    assert.equal(tree.props.value.profileError,'forbidden'); assert.equal(tree.props.value.user,null); assert(getAuthSession());
    globalThis.fetch = (async () => response(503)) as typeof fetch;
    await tree.props.value.retryProfile(); tree=render(); assert.notEqual(tree.props.children,child,'Transient retry cannot reopen previously forbidden UI');
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
    assert(cacheClears>=2);
    globalThis.fetch=(async () => response(401,undefined,'AUTH_ACCOUNT_INACTIVE')) as typeof fetch;
    await tree.props.value.retryProfile(); tree=render(); assert.equal(tree.props.value.user,null); assert.equal(getAuthSession(),null); assert.notEqual(tree.props.children,child);
    console.log('AuthProvider handlers: initial guard, temporary error/retry, retained child/locale, logout/account/profile race and inactive rejection passed.');
  } finally { cleanups.forEach(stop => stop?.()); Object.assign(React,hooks); globalThis.fetch=originalFetch; setActiveLanguage('en'); clearStoredAuth(); }
}
run().catch(error => { console.error(error); process.exitCode=1; });
