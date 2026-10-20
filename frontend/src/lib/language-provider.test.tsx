import assert from 'node:assert/strict';
import React from 'react';
import * as auth from '../components/auth/auth-provider';
import * as api from './api-client';
import { LanguageProvider } from '../components/i18n/language-provider';
import { getLanguageCacheKey, setActiveLanguage } from '../i18n';

export async function testLanguageProviderLifecycle() {
  const original = { auth: auth.useAuth, api: api.apiClient, window: globalThis.window, document: globalThis.document };
  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previousDispatcher = internals.H;
  const slots: any[] = [], cleanups: any[] = [];
  const storage = new Map<string, string>();
  storage.set(getLanguageCacheKey('account-a'), 'id');
  let user: any = { id: 'account-a', preferredLanguage: 'id' }, calls = 0;
  const responses: Array<(value: { language: 'en' | 'id' }) => void> = [];
  (auth as any).useAuth = () => ({ user });
  (api as any).apiClient = () => { calls++; return new Promise(resolve => responses.push(resolve)); };
  (globalThis as any).window = { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } };
  (globalThis as any).document = { documentElement: { lang: 'en' } };
  function render() {
    let cursor = 0; const effects: Array<() => void> = [];
    const memo = (compute: () => unknown, deps: unknown[]) => {
      const index = cursor++;
      if (!slots[index] || deps.some((value, at) => !Object.is(value, slots[index].deps[at]))) slots[index] = { deps, value: compute() };
      return slots[index].value;
    };
    internals.H = {
      useRef: (initial: unknown) => slots[cursor++] ??= { current: initial },
      useState: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], (value: any) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
      useMemo: memo,
      useCallback: (fn: unknown, deps: unknown[]) => memo(() => fn, deps),
      useEffect: (effect: () => unknown, deps: unknown[]) => {
        const index = cursor++;
        if (!slots[index] || deps.some((value, at) => !Object.is(value, slots[index][at]))) {
          slots[index] = deps; effects.push(() => { cleanups[index]?.(); cleanups[index] = effect(); });
        }
      },
    };
    let tree: React.ReactElement<any>;
    try { tree = LanguageProvider({ children: null }); }
    finally { internals.H = previousDispatcher; }
    effects.forEach(effect => effect());
    return tree.props.value;
  }
  const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };
  try {
    render(); await flush();
    assert.equal(render().isLoading, true); assert.equal(render().locale, 'id'); assert.equal(calls, 1);
    user = { ...user, fullName: 'Updated profile name' }; render(); await flush();
    assert.equal(calls, 1, 'Unrelated profile updates must not restart preference loading');
    user = null; render();
    assert.equal(render().isLoading, false, 'Logout clears loading even while the old request is pending');
    responses[0]({ language: 'id' }); await flush();
    assert.equal(render().locale, 'en', 'A late response from the signed-out account cannot override guest language');
    user = { id: 'account-b', preferredLanguage: 'en' }; render(); await flush();
    assert.equal(calls, 2); responses[1]({ language: 'id' }); await flush();
    const result = render(); assert.equal(result.locale, 'id'); assert.equal(result.isLoading, false);
    assert.equal(document.documentElement.lang, 'id');
    assert.equal(storage.get(getLanguageCacheKey('account-b')), 'id');
    assert.notEqual(result.t('common.cancel'), 'common.cancel');
    console.log('Language provider: stable profile dependencies, pending logout, late response isolation and new account preference passed.');
  } finally {
    cleanups.forEach(cleanup => cleanup?.()); internals.H = previousDispatcher;
    (auth as any).useAuth = original.auth; (api as any).apiClient = original.api;
    (globalThis as any).window = original.window; (globalThis as any).document = original.document;
    setActiveLanguage('en');
  }
}
