import assert from 'node:assert/strict';
import React, { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as auth from '../components/auth/auth-provider';
import * as language from '../components/i18n/language-provider';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import * as approvalHooks from '../hooks/use-approvals';
import * as projectHooks from '../hooks/use-projects';
import * as hooks from '../hooks/use-notifications';
import { Sidebar } from '../components/app-shell';
import SettingsPage from '../app/settings/page';
import LegacyNotificationSettingsPage from '../app/settings/notifications/page';
import { PersonalNotificationSettings } from '../components/settings/personal-notification-settings';
import { Dialog } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { canShowNavigationItem, canUsePersonalNotificationSettings, PERSONAL_NOTIFICATIONS_SETTINGS_HREF } from './settings-access';
import { canReadOperationalHealth } from './operational-health';
import { getSalesDashboardItems } from './dashboard-ux';
import { getAuthSession, setAuthTokens } from './auth';
import { notificationKeys } from './query-keys';
import { SessionChangedError } from './api-client';
import { setActiveLanguage, translate } from '../i18n';
import type { Project } from '../types/project';

type Element = React.ReactElement<any>;
const elements = (node: ReactNode): Element[] => Array.isArray(node) ? node.flatMap(elements) :
  isValidElement(node) ? [node as Element, ...elements((node as Element).props.children)] : [];
const storage = new Map<string, string>();
const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
(globalThis as any).window = { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} };
let user: any = { id: 'account-a', role: 'SALES', isActive: true };
let authLoading = false;
(auth as any).useAuth = () => ({ user, isLoading: authLoading });
(language as any).useLanguage = () => ({ t: translate, locale: 'en' });
setAuthTokens({ accessToken: 'fixture' });

function navigationChecks() {
  const originals = { context: React.useContext, stats: approvalHooks.useApprovalStats, assigned: projectHooks.useMyAssignedMilestones };
  let assigned: any[] = [];
  (approvalHooks as any).useApprovalStats = () => ({ data: {} });
  (projectHooks as any).useMyAssignedMilestones = () => ({ data: assigned });
  try {
    for (const collapsed of [false, true]) {
      (React as any).useContext = (context: any) => context === PathnameContext ? '/settings' : ({ collapsed, mobileOpen: true, setMobileOpen() {}, setCollapsed() {} });
      for (const role of ['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN', undefined, 'UNKNOWN']) {
        user = role ? { id: 'account-a', role, isActive: true } : null;
        const tree = elements(Sidebar());
        const panels = tree.filter(node => node.type === 'aside');
        assert.equal(panels.length, 2);
        for (const panel of panels) {
          const hrefs = elements(panel).map(node => node.props.href).filter(Boolean);
          assert.equal(hrefs.includes('/milestones'), ['SA', 'HEAD_SA', 'SUPER_ADMIN'].includes(role ?? ''));
          assert.equal(hrefs.includes('/settings'), Boolean(role && role !== 'UNKNOWN'));
          if (role === 'SALES') { assert(hrefs.includes('/projects')); assert(hrefs.includes('/')); }
          if (!role || role === 'UNKNOWN') assert.equal(hrefs.length, 0);
          assert.equal(hrefs.includes('/approvals'), role === 'HEAD_SA' || role === 'SUPER_ADMIN');
          assert.equal(hrefs.includes('/users'), role === 'SUPER_ADMIN');
        }
        assert.equal(canShowNavigationItem(role), Boolean(role && role !== 'UNKNOWN'));
        assert.equal(canUsePersonalNotificationSettings(user), Boolean(role && role !== 'UNKNOWN'));
        assert.equal(canReadOperationalHealth(user), role === 'SUPER_ADMIN');
      }
    }
    for (const locale of ['en', 'id'] as const) {
      setActiveLanguage(locale);
      for (const role of ['SA', 'HEAD_SA']) {
        user = { id: 'account-a', role, isActive: true };
        for (const [statuses, expected] of [
          [['IN_REVIEW'], 0], [['SUBMITTED'], 0], [['REVISION_REQUIRED'], 1], [['IN_REVIEW', 'DRAFT'], 1],
        ] as const) {
          assigned = [{ status: 'IN_PROGRESS', project: { status: 'ACTIVE', is_postponed: false },
            outputs: statuses.map(status => ({ status, is_required: true, is_selected: true })) }];
          const links = elements(Sidebar()).filter(node => node.props.href === '/milestones');
          assert.equal(links.length, 2, 'Desktop and drawer keep the same milestone link');
          for (const link of links) {
            assert.equal(link.props.title, `${translate('nav.milestones')} — ${translate('milestonePage.needsAction')}: ${expected}`);
            const numbers = elements(link).filter(node => node.type === 'span' && node.props.children === expected);
            assert.equal(numbers.length, expected > 0 ? 1 : 0, 'Waiting-only has no numeric badge; actionable work has one');
          }
        }
      }
    }
    assigned = []; setActiveLanguage('en');
    assert(!canUsePersonalNotificationSettings({ id: 'a', role: 'SALES', isActive: false }));
    assert(!canUsePersonalNotificationSettings({ id: 'a', role: 'SALES', isActive: true, mustChangePassword: true }));
    const base = { id: 'p', name: 'Fixture', sales_id: 'owner', is_postponed: false };
    for (const p of [
      { ...base, status: 'DRAFT', currentRole: 'SALES' },
      { ...base, status: 'WAITING_RESULT' },
      { ...base, status: 'POSTPONED' },
      { ...base, status: 'ACTIVE', currentMilestone: { id: 'm', name: 'Tender', default_role: 'SALES', status: 'IN_PROGRESS' } },
    ]) {
      const tasks = getSalesDashboardItems([p as Project], 'owner');
      assert.equal(tasks.length, 1); assert(tasks[0].href?.startsWith('/projects/p'));
      assert(!tasks[0].href?.startsWith('/milestones'));
    }
    assert.equal(PERSONAL_NOTIFICATIONS_SETTINGS_HREF, '/settings#personal-notifications');
    user = { id: 'account-a', role: 'SALES', isActive: true };
    const personal = () => elements(SettingsPage()).filter(node => node.type === PersonalNotificationSettings);
    assert.equal(personal().length, 1, 'Settings mounts exactly one personal form');
    const originalKey = personal()[0].key;
    setActiveLanguage('id'); assert.equal(personal()[0].key, originalKey, 'Locale cannot remount the form');
    setActiveLanguage('en'); user = { ...user, id: 'account-b' };
    assert.notEqual(personal()[0].key, originalKey, 'Account change resets private dialog state');
    assert.throws(() => LegacyNotificationSettingsPage(), (error: any) =>
      error.digest?.includes(PERSONAL_NOTIFICATIONS_SETTINGS_HREF), 'Old URL redirects instead of mounting a duplicate form');
  } finally {
    (React as any).useContext = originals.context;
    (approvalHooks as any).useApprovalStats = originals.stats;
    (projectHooks as any).useMyAssignedMilestones = originals.assigned;
  }
}

async function panelChecks() {
  const originals = { state: React.useState, ref: React.useRef, memo: React.useMemo, effect: React.useEffect, ...hooks };
  const states: any[] = [], refs: any[] = [];
  let si = 0, ri = 0, fail = false;
  const writes: any[] = [];
  const preferences = { in_app_enabled: true, telegram_enabled: false, telegram_linked: true, telegram_username: null, telegram_linked_at: null };
  const mutation = (operation: string) => ({ isPending: false, mutateAsync: async (input: any) => {
    writes.push({ operation, input }); if (fail) throw new Error('fixture');
  } });
  (React as any).useState = (initial: any) => { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], (next: any) => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; };
  (React as any).useRef = (initial: any) => refs[ri++] ??= { current: initial };
  (React as any).useMemo = (fn: any) => fn();
  (React as any).useEffect = () => {};
  (hooks as any).useNotificationPreferences = (enabled: boolean) => { assert(enabled); return { data: preferences, refetch() { throw new Error('No refetch needed on open'); } }; };
  for (const [name, operation] of [['useUpdateNotificationPreferences', 'save'], ['useUnlinkTelegram', 'unlink'], ['useCreateTelegramLink', 'link'], ['useInvalidateTelegramLink', 'cancel-link']]) (hooks as any)[name] = () => mutation(operation);
  user = { id: 'account-a', role: 'SALES', isActive: true };
  const render = () => { si = 0; ri = 0; return PersonalNotificationSettings(); };
  const dialogs = () => elements(render()).filter(node => node.type === Dialog);
  const button = (label: string, tree = render()) => elements(tree).find(node => node.type === Button &&
    (node.props.children === label || (Array.isArray(node.props.children) && node.props.children.includes(label))))!;
  try {
    render(); assert.equal(writes.length, 0, 'Opening Settings never writes/links/sends');
    button(translate('notificationSettings.disconnect')).props.onClick();
    assert(dialogs()[1].props.open);
    button(translate('common.cancel'), dialogs()[1]).props.onClick();
    assert(!dialogs()[1].props.open); assert.equal(writes.length, 0);
    elements(render()).find(node => node.props.id === 'in-app-enabled')!.props.onCheckedChange(false);
    assert(dialogs()[0].props.open); assert.equal(writes.length, 0);
    setActiveLanguage('id');
    assert(dialogs()[0].props.open, 'Locale does not reset confirmation');
    button(translate('common.cancel'), dialogs()[0]).props.onClick();
    assert.equal(writes.length, 0);
    elements(render()).find(node => node.props.id === 'in-app-enabled')!.props.onCheckedChange(false);
    fail = true;
    await button(translate('common.save'), dialogs()[0]).props.onClick();
    await new Promise(resolve => setImmediate(resolve));
    assert(dialogs()[0].props.open); assert(elements(dialogs()[0]).some(node => node.props.role === 'alert'));
    assert.deepEqual(writes[0].input, { in_app_enabled: false });
    fail = false;
    button(translate('common.save'), dialogs()[0]).props.onClick();
    button(translate('common.save'), dialogs()[0]).props.onClick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes.length, 2, 'Busy ref prevents double submit'); assert(!dialogs()[0].props.open);
    assert.equal(writes.filter(item => item.operation === 'link').length, 0);
    button(translate('notificationSettings.disconnect')).props.onClick(); fail = true;
    button(translate('notificationSettings.disconnect'), dialogs()[1]).props.onClick();
    await new Promise(resolve => setImmediate(resolve));
    assert(dialogs()[1].props.open); assert(elements(dialogs()[1]).some(node => node.props.role === 'alert'));
    fail = false; button(translate('notificationSettings.disconnect'), dialogs()[1]).props.onClick();
    await new Promise(resolve => setImmediate(resolve)); assert(!dialogs()[1].props.open);
  } finally {
    for (const key of ['useState', 'useRef', 'useMemo', 'useEffect'] as const) (React as any)[key] = originals[({ useState: 'state', useRef: 'ref', useMemo: 'memo', useEffect: 'effect' } as const)[key]];
    for (const key of ['useNotificationPreferences', 'useUpdateNotificationPreferences', 'useUnlinkTelegram', 'useCreateTelegramLink', 'useInvalidateTelegramLink'] as const) (hooks as any)[key] = originals[key];
    setActiveLanguage('en');
  }
}

async function queryChecks() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  let query: ReturnType<typeof hooks.useNotificationPreferences>, mutation: ReturnType<typeof hooks.useUpdateNotificationPreferences>;
  const keys: unknown[] = [];
  const invalidate = client.invalidateQueries.bind(client);
  client.invalidateQueries = ((options: any) => { keys.push(options.queryKey); return invalidate(options); }) as any;
  function Harness() { query = hooks.useNotificationPreferences(); mutation = hooks.useUpdateNotificationPreferences(); return null; }
  const render = () => renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Harness)));
  let reads = 0;
  const data = { in_app_enabled: false, telegram_enabled: true, telegram_linked: true, telegram_username: null, telegram_linked_at: null };
  const reply = () => new Response(JSON.stringify({ success: true, data }), { status: 200 });
  globalThis.fetch = (async () => { reads++; return reply(); }) as typeof fetch;
  try {
    user = { id: 'account-a', role: 'SALES', isActive: true }; render();
    for (const role of ['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN']) {
      user = { ...user, role }; render();
      assert.equal(query!.isEnabled, true);
      const refreshed = await query!.refetch({ throwOnError: true });
      assert.equal(refreshed.fetchStatus, 'idle');
    }
    const keyA = notificationKeys.preferences(user.id, getAuthSession()!.id);
    await mutation!.mutateAsync({ in_app_enabled: false });
    assert.deepEqual(client.getQueryData(keyA), data); assert(keys.some(key => JSON.stringify(key) === JSON.stringify(keyA)));
    user = { id: 'account-b', role: 'HEAD_SA', isActive: true }; setAuthTokens({ accessToken: 'fixture-b' }); render();
    assert.equal(query!.data, undefined, 'New account cannot see old cache');
    const keyB = notificationKeys.preferences(user.id, getAuthSession()!.id);
    assert.notDeepEqual(keyA, keyB);
    const before = reads;
    for (const [fixture, loading] of [[null, false], [{ id: 'x', role: 'SALES', isActive: false }, false], [{ id: 'x', role: 'SALES', isActive: true }, true]] as const) {
      user = fixture; authLoading = loading; render();
      assert.equal(query!.isEnabled, false); assert.equal(query!.fetchStatus, 'idle');
      await assert.rejects(() => mutation!.mutateAsync({ in_app_enabled: false }), SessionChangedError);
    }
    authLoading = false; assert.equal(reads, before);
    user = { id: 'account-b', role: 'HEAD_SA', isActive: true }; render();
    let release!: (response: Response) => void;
    globalThis.fetch = (() => new Promise<Response>(resolve => { release = resolve; })) as typeof fetch;
    const pending = mutation!.mutateAsync({ telegram_enabled: true });
    const rejection = assert.rejects(pending, SessionChangedError);
    await new Promise(resolve => setImmediate(resolve));
    setAuthTokens({ accessToken: 'fixture-c' }); user = { ...user, id: 'account-c' }; render();
    release(reply()); await rejection;
    assert.equal(client.getQueryData(keyB), undefined, 'Late success is discarded');
    assert.equal(query!.data, undefined);
  } finally { client.clear(); }
}

void (async () => {
  navigationChecks(); await panelChecks(); await queryChecks();
  console.log('Settings navigation, personal preferences confirmation, eligibility, account isolation and invalidation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = originalFetch; (globalThis as any).window = originalWindow;
});
