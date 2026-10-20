'use strict';
// Production UI with synthetic accounts/APIs. Route gates reproduce slow navigation.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launch, pause } = require('./cdp.cjs');
const { createFixture } = require('./fixtures.cjs');
require('../register.cjs');
const { en } = require('../../src/i18n/en');
const { id } = require('../../src/i18n/id');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3035';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Loopback app only');
const baseline = process.argv.includes('--baseline');
const output = path.resolve(__dirname, '../../../.cache/navigation-feedback');

async function checkNavigation(width, locale) {
  const dictionary = locale === 'en' ? en : id;
  const fixture = createFixture();
  fixture.state.locale = locale;
  const gates = new Map();
  for (const route of ['/milestones', '/projects']) {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    gates.set(route, { promise, release, requests: 0 });
  }
  fixture.beforeAppRequest = request => {
    const route = new URL(request.url).pathname;
    const gate = gates.get(route);
    if (gate) { gate.requests++; return gate.promise; }
  };
  let navigating = false, failProjects = false;
  const respond = fixture.respond;
  fixture.respond = (url, method, body) => {
    const route = new URL(url).pathname.replace(/^\/api/, '');
    if (method === 'GET' && route === '/face-login/capabilities')
      return { status: 200, body: { success: true, data: { enabled: false } } };
    if (failProjects && method === 'GET' && route === '/projects')
      return { status: 503, delay: 600, body: { success: false, message: 'Synthetic project API failure' } };
    const response = respond(url, method, body);
    if (navigating && method === 'GET' && route === '/me/assigned-milestones') response.delay = 600;
    return response;
  };
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  const requests = new Map(), timings = [];
  cdp.on('Network.requestWillBeSent', event => {
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/api/') && event.request.method === 'GET')
      requests.set(event.requestId, { path: url.pathname, start: event.timestamp });
  });
  cdp.on('Network.loadingFinished', event => {
    const request = requests.get(event.requestId);
    if (request) timings.push({ path: request.path, durationMs: Math.round((event.timestamp - request.start) * 1000) });
  });
  const visibleLink = route => `[...document.querySelectorAll('nav a[href="${route}"]')].find(e => e.getBoundingClientRect().width > 0 && !e.closest('[inert]'))`;
  const openMenu = async () => {
    if (width < 1024) {
      await cdp.click("document.querySelector('button[aria-controls=mobile-navigation]')");
      await cdp.wait("document.querySelector('#mobile-navigation')?.getAttribute('aria-hidden') === 'false'", 'mobile menu open');
      await pause(350);
    }
  };
  try {
    await cdp.viewport(width);
    await cdp.navigate(origin + '/login');
    await cdp.wait("document.querySelector('#email')", 'login form');
    await cdp.evaluate(`(() => { for (const [selector, value] of [['#email', 'head_sa@fixture.invalid'], ['#password', 'SyntheticOnly!123']]) {
      const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
    await cdp.click("document.querySelector('form button[type=submit]')");
    await cdp.wait(`document.querySelector('#dashboard-summary-heading') && document.documentElement.lang === ${JSON.stringify(locale)}`, 'dashboard and language ready');
    await cdp.wait("document.querySelector('main')?.innerText.includes('Synthetic') || document.querySelector('main')?.innerText.includes('Fixture')", 'dashboard API ready');
    await openMenu();
    await cdp.evaluate(`(() => {
      const metrics = window.__navigationMetrics = {};
      document.addEventListener('click', event => {
        if (!event.target.closest('nav a[href="/milestones"]') || metrics.click !== undefined) return;
        metrics.click = performance.now();
      }, true);
      const observe = () => {
        if (metrics.click === undefined) return;
        if (document.querySelector('[data-navigation-status]') && metrics.feedback === undefined) metrics.feedback = performance.now();
        if (location.pathname === '/milestones' && metrics.route === undefined) metrics.route = performance.now();
      };
      new MutationObserver(observe).observe(document.body, { subtree: true, childList: true, attributes: true });
    })()`);
    navigating = true;
    await cdp.click(visibleLink('/milestones'));
    if (!baseline) await cdp.wait("document.querySelector('[data-navigation-status]')", 'immediate navigation status');
    await pause(500);
    const pending = await cdp.evaluate(`(() => {
      const status = document.querySelector('[data-navigation-status]');
      const rect = status?.getBoundingClientRect();
      return { path: location.pathname, text: status?.textContent ?? null,
        visible: !!rect && rect.width > 0 && rect.top >= 0 && rect.right <= innerWidth + 1,
        outsideDrawer: !!status && !status.closest('aside'),
        drawerClosed: document.querySelector('#mobile-navigation').getAttribute('aria-hidden') === 'true' };
    })()`);
    assert.equal(pending.path, '/', 'Slow route must still be pending during observation');
    assert(gates.get('/milestones').requests > 0, 'Test must hold an actual route request');
    if (baseline) assert.equal(pending.text, null, 'Baseline has no navigation status');
    else {
      assert.equal(pending.text, dictionary.nav.openingPage.replace('{page}', dictionary.nav.milestones));
      assert(pending.visible && pending.outsideDrawer && pending.drawerClosed, 'Status remains visible after mobile drawer closes');
      if (width === 390 && locale === 'id' || width === 1440 && locale === 'en')
        await cdp.screenshot(path.join(output, `pending-${locale}-${width}.png`));
    }
    gates.get('/milestones').release();
    await cdp.wait("location.pathname === '/milestones' && document.querySelector('main')?.innerText.includes('Solution Assessment')", 'milestones loaded with cached data');
    await cdp.wait("!document.querySelector('[data-navigation-status]')", 'pending status cleared');
    await pause(700);
    const measured = await cdp.evaluate(`(() => { const m = window.__navigationMetrics; return {
      clickToFeedbackMs: m.feedback === undefined ? null : Math.round(m.feedback - m.click),
      clickToRouteMs: Math.round(m.route - m.click),
      overflow: document.documentElement.scrollWidth > innerWidth + 1
    }; })()`);
    assert.equal(measured.overflow, false);
    if (!baseline) assert(measured.clickToFeedbackMs < 300, 'Feedback appears before the held route responds');
    await openMenu();
    await cdp.click(visibleLink('/milestones'));
    await pause(200);
    assert.equal(await cdp.evaluate("!!document.querySelector('[data-navigation-status]')"), false, 'Same-page click must not leave a spinner');

    let apiFailureHandled = false;
    if (!baseline) {
      // A route can finish while its data request fails: navigation must not stay pending.
      failProjects = true;
      await openMenu();
      await cdp.click(visibleLink('/projects'));
      await cdp.wait("document.querySelector('[data-navigation-status]')", 'second navigation pending');
      gates.get('/projects').release();
      await cdp.wait("location.pathname === '/projects' && !document.querySelector('[data-navigation-status]')", 'route finishes independently of API');
      await cdp.wait(`document.querySelector('main')?.innerText.includes(${JSON.stringify(dictionary.project.loadError)})`, 'project API error shown', 25000);
      apiFailureHandled = true;
      await cdp.evaluate('history.back()');
      await cdp.wait("location.pathname === '/milestones' && !document.querySelector('[data-navigation-status]')", 'back navigation does not leave a spinner');
    }
    assert.deepEqual(traffic.errors, []);
    assert.deepEqual(fixture.state.unknown, []);
    return { width, locale, browser: runtime.browser, ...measured, pending, apiFailureHandled, apiTimings: timings };
  } finally {
    for (const gate of gates.values()) gate.release();
    await pause(100);
    await runtime.cleanup();
  }
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const checks = [];
  for (const width of [1440, 390]) for (const locale of ['en', 'id']) {
    const result = await checkNavigation(width, locale);
    checks.push(result);
    console.log(`${baseline ? 'BASELINE' : 'PASS'} ${locale} ${width}: feedback ${result.clickToFeedbackMs ?? 'absent'} ms, controlled route ${result.clickToRouteMs} ms`);
  }
  await fs.writeFile(path.join(output, baseline ? 'baseline.json' : 'results.json'), JSON.stringify({ synthetic: true, routeHoldMs: 500, apiDelayMs: 600, checks }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
