'use strict';
// Real UI / browser storage, synthetic API only; never touches live accounts or camera.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launch, pause } = require('./cdp.cjs');
const { createFixture } = require('./fixtures.cjs');
require('../register.cjs');
const { en } = require('../../src/i18n/en');
const { id } = require('../../src/i18n/id');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3036';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Loopback frontend only');
const output = path.resolve(__dirname, '../../../.cache/dark-mode/browser');
const sid = '90000000-0000-4000-8000-000000000004';
const now = '2026-10-22T04:00:00.000Z';

async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = createFixture(), base = fixture.respond, checks = [];
  let forced = false;
  const ok = data => ({ status: 200, body: { success: true, data } });
  fixture.respond = (url, method, body) => {
    const u = new URL(url), p = u.pathname.replace(/^\/api/, '');
    if (method === 'GET') {
      if (p === '/auth/me') return ok({ ...fixture.user(fixture.state.role), mustChangePassword: forced });
      if (p === '/face-login/capabilities') return ok({ enabled: true, singleGlance: true });
      if (p === '/face-pad/capabilities' || p === '/face-experiment/capabilities') return ok({ enabled: false });
      if (p === '/face-login/devices') return ok({ devices: [] });
      if (p === '/notifications/preferences') return ok({ in_app_enabled: true, telegram_enabled: false, telegram_linked: false, telegram_username: null, telegram_linked_at: null });
      if (p === '/notifications/admin/telegram-delivery-health') return ok({ generatedAt: now, summary: { total: 0, sent: 0, pending: 0, failed: 0, retryable: 0, ambiguous: 0, terminal: 0, dueRetryable: 0 }, recentFailures: [] });
      if (p === '/notifications/admin/output-outbox') return ok({ generatedAt: now, page: 1, limit: 20, totalPages: 1, items: [], summary: { pending: 0, previouslyFailed: 0, oldestCreatedAt: null, oldestAgeSeconds: null, latestAttemptAt: null } });
      if (p === '/projects/deletion-cleanups') return ok({ page: 1, limit: 20, totalPages: 1, items: [], status: 'ALL', summary: { total: 0, pending: 0, failed: 0, completed: 0 } });
      if (p === '/users') return ok({ users: [fixture.user('SALES'), fixture.user('SA')].map(v => ({ ...v, createdAt: now })), pagination: { page: 1, limit: 10, total: 2, totalPages: 1, hasNextPage: false, hasPrevPage: false } });
      if (p === `/scenarios/${sid}/workflow`) return ok({ scenario: { id: sid, name: 'Pra-Tender' }, stages: [{ id: 'fixture-stage', scenario_id: sid, name: 'Solution assessment', description: 'Synthetic workflow stage', step_order: 1, default_role: 'SA', default_duration_working_days: 5, is_active: true, is_required: true, created_at: now, updated_at: now }] });
      if (p === '/me/deadline-calendar') {
        const month = u.searchParams.get('month'), day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', day: '2-digit' }).format(new Date());
        return ok({ month, items: ['COMPLETED', 'IN_PROGRESS', 'APPROVED'].map((status, i) => ({ id: `calendar-${i}`, name: `Fixture deadline ${i + 1}`, dueDate: `${month}-${day}`, status, project: { id: fixture.pid, name: 'Project calendar', status: 'ACTIVE', is_postponed: false } })) });
      }
    }
    const result = base(url, method, body);
    if (p === '/scenarios' && method === 'GET') result.body.data = result.body.data.map(s => ({ ...s, is_active: true, created_at: now, updated_at: now, total_steps: 1 }));
    return result;
  };
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  const dark = "document.documentElement.classList.contains('dark')";
  const namedButton = text => `[...document.querySelectorAll('main button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
  const routes = ['/', '/projects', '/projects/[id]', '/projects/new', '/milestones', '/approvals', '/documents', '/users', '/settings', '/settings/notifications', '/settings/workflows', '/settings/workflows/[id]', '/settings/telegram-delivery-health', '/settings/face-verification', '/settings/face-verification/quick', '/settings/face-verification/passive', '/settings/face-verification/advanced', '/login', '/register', '/forgot-password', '/reset-password', '/change-password'];
  const walk = async dir => (await Promise.all((await fs.readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(path.join(dir, e.name)) : path.join(dir, e.name)))).flat();
  const app = path.resolve(__dirname, '../../src/app');
  const actual = (await walk(app)).filter(f => path.basename(f) === 'page.tsx').map(f => '/' + path.relative(app, path.dirname(f)).replaceAll('\\', '/'));
  assert.deepEqual([...routes].sort(), actual.sort(), 'Every app page must be covered; update this matrix when adding routes');
  const publicRoutes = ['/login', '/register', '/forgot-password', '/reset-password'];
  async function account(role, anonymous = false) {
    fixture.state.role = role;
    await cdp.evaluate(`(()=>{${anonymous ? "localStorage.removeItem('workflow.session');localStorage.removeItem('workflow.accessToken')" : `localStorage.setItem('workflow.session',JSON.stringify({id:crypto.randomUUID(),accessToken:'fixture-theme-${role}',refreshToken:'fixture-only'}))`}})()`);
  }
  async function inspect(label, theme, width) {
    await cdp.wait(`document.querySelector('main')?.textContent.trim().length > 40`, label + ' content');
    await pause(250);
    const state = await cdp.evaluate(`(()=>{const s=getComputedStyle(document.body);const lightSurfaces=[...document.querySelectorAll('main *')].filter(e=>!e.closest('#appearance [aria-hidden=true]')&&e.getBoundingClientRect().width>50&&e.getBoundingClientRect().height>30&&getComputedStyle(e).backgroundColor==='rgb(255, 255, 255)').map(e=>e.tagName+'.'+e.className);return {dark:${dark},color:s.color,background:s.backgroundColor,scheme:getComputedStyle(document.documentElement).colorScheme,overflow:document.documentElement.scrollWidth>innerWidth+1,lightSurfaces,native:[...document.querySelectorAll('select,textarea,input[type=date]')].map(e=>getComputedStyle(e).colorScheme)}})()`);
    assert.equal(state.dark, theme === 'dark', label);
    assert.equal(state.scheme, theme, label);
    assert(!state.overflow, label + ' horizontal overflow at ' + width);
    if (theme === 'dark') assert.deepEqual(state.lightSurfaces, [], label + ' unintended white panels');
    assert(state.native.every(s => s === theme), label + ' native controls follow theme');
    checks.push({ label, theme, width, ...state });
  }
  try {
    await cdp.navigate(origin + '/login');
    await cdp.wait("document.querySelector('#email')", 'initial login');
    assert.equal(await cdp.evaluate(dark), false, 'Default stays light');
    await account('SUPER_ADMIN');
    await cdp.navigate(origin + '/settings');
    await cdp.wait("document.querySelector('[data-theme-option=dark]:not(:disabled)')", 'theme setting');
    await cdp.click("document.querySelector('[data-theme-option=dark]')");
    assert.equal(await cdp.evaluate("localStorage.getItem('workflow-theme')"), 'dark');

    // Each route in both themes, on desktop and phone; alternate languages.
    for (const theme of ['dark', 'light']) {
      await account('SUPER_ADMIN'); forced = false;
      await cdp.navigate(origin + '/settings');
      await cdp.wait(`document.querySelector('[data-theme-option=${theme}]:not(:disabled)')`, 'theme setting');
      await cdp.click(`document.querySelector('[data-theme-option=${theme}]')`);
      for (const width of [1440, 360]) {
        fixture.state.locale = width === 360 ? 'id' : 'en';
        const d = width === 360 ? id : en;
        await cdp.viewport(width);
        for (const route of routes) {
          forced = route === '/change-password';
          await account(route === '/projects/new' ? 'SALES' : 'SUPER_ADMIN', publicRoutes.includes(route));
          const url = route.replace('/projects/[id]', `/projects/${fixture.pid}`).replace('/settings/workflows/[id]', `/settings/workflows/${sid}`);
          await cdp.navigate(origin + url);
          await cdp.wait(`location.pathname===${JSON.stringify(route === '/settings/notifications' ? '/settings' : url)} && document.querySelector('main')`, 'route ' + route);
          await inspect(route, theme, width);
          if (route === '/settings') {
            await cdp.wait(`document.querySelector('[data-theme-option=${theme}]')?.getAttribute('aria-pressed')==='true'`, 'selected theme restored');
            assert(await cdp.evaluate(`document.querySelector('#appearance').textContent.includes(${JSON.stringify(d.appearance.title)})`));
          }
          if (route === '/projects/[id]') {
            await cdp.wait(namedButton(d.reportExport.button), 'export button');
            await cdp.click(namedButton(d.reportExport.button));
            await inspect('export dialog', theme, width);
            await cdp.key('Escape', 'Escape', 27);
          }
          if (route === '/milestones') {
            await cdp.wait(namedButton(d.deadlineCalendar.calendar), 'calendar tab');
            await cdp.click(namedButton(d.deadlineCalendar.calendar));
            await cdp.wait("document.querySelector('[data-calendar-event]')", 'calendar events');
            await inspect('calendar', theme, width);
          }
          if (['/settings', '/milestones', '/projects/new', '/login', '/'].includes(route)) {
            await cdp.evaluate('window.scrollTo(0,0)');
            await cdp.screenshot(path.join(output, `${theme}-${width}-${route === '/' ? 'dashboard' : route.slice(1).replaceAll('/', '-')}.png`));
          }
        }
        forced = false;
        await account('SUPER_ADMIN');
        await cdp.navigate(origin + '/fixture-missing-page');
        await cdp.wait(`document.querySelector('main h1')?.textContent===${JSON.stringify(d.notFound.title)}`, 'themed 404');
        await inspect('404', theme, width);
      }
    }
    forced = false; fixture.state.locale = 'en'; await cdp.viewport(1440);
    for (const role of ['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN']) {
      await account(role); await cdp.navigate(origin + '/settings');
      await cdp.wait("document.querySelector('[data-theme-option=dark]:not(:disabled)')", role + ' appearance setting');
      await cdp.click("document.querySelector('[data-theme-option=dark]')");
      assert.equal(await cdp.evaluate(dark), true);
    }
    // Storage event propagation (other tab changing/clearing only this preference).
    await cdp.evaluate("localStorage.setItem('workflow-theme','light');window.dispatchEvent(new StorageEvent('storage',{key:'workflow-theme',newValue:'light',storageArea:localStorage}))");
    await cdp.wait(`!${dark}`, 'other tab theme sync');
    await cdp.evaluate("localStorage.removeItem('workflow-theme');window.dispatchEvent(new StorageEvent('storage',{key:'workflow-theme',newValue:null,storageArea:localStorage}))");
    await cdp.wait(`!${dark}`, 'removed preference resets light');
    // Storage quota denial must keep the chosen appearance usable and explain persistence failure.
    await cdp.evaluate("window.__originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='workflow-theme')throw new DOMException('Synthetic quota','QuotaExceededError');return window.__originalSetItem.call(this,k,v)}");
    await cdp.click("document.querySelector('[data-theme-option=dark]')");
    await cdp.wait("document.querySelector('#appearance [role=alert]')", 'storage failure message');
    assert.equal(await cdp.evaluate(dark), true);
    await cdp.evaluate('Storage.prototype.setItem=window.__originalSetItem');
    await cdp.click("document.querySelector('[data-theme-option=dark]')");
    await cdp.wait("!document.querySelector('#appearance [role=alert]')", 'save retry');

    // Pre-hydration paint: block Next JS only; head script must still restore dark.
    await account('SUPER_ADMIN', true);
    await cdp.send('Network.setBlockedURLs', { urls: ['*/_next/static/*.js'] });
    await cdp.navigate(origin + '/login');
    assert.equal(await cdp.evaluate(dark), true, 'Saved theme before React loads');
    assert.equal(await cdp.evaluate("getComputedStyle(document.body).backgroundColor"), 'rgb(14, 19, 32)');
    await cdp.send('Network.setBlockedURLs', { urls: [] });
    await cdp.navigate(origin + '/login');
    await cdp.wait("document.querySelector('#email')", 'login after reopening');
    assert.equal(await cdp.evaluate(dark), true, 'Theme survives sign-out/reopening');
    assert.deepEqual(traffic.errors, [], 'No runtime errors');
    assert.deepEqual(fixture.state.unknown, [], 'All API reads explicitly modeled');
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ routes, checks, persistence: true, storageFailure: true, preHydration: true, errors: traffic.errors }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, routes: routes.length, themes: 2, widths: [1440, 360], storageAndPreHydration: 'passed' }));
  } catch (error) {
    await cdp.screenshot(path.join(output, 'failure.png')).catch(() => {});
    await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ checks, errors: traffic.errors, unknown: fixture.state.unknown }, null, 2));
    throw error;
  } finally { await runtime.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
