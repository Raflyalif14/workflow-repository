'use strict';
// Production UI; synthetic accounts and APIs only. Does not measure live Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launch, pause } = require('./cdp.cjs');
const { createFixture } = require('./fixtures.cjs');
require('../register.cjs');
const { en } = require('../../src/i18n/en');
const { id } = require('../../src/i18n/id');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3036';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Loopback app only');
const baseline = process.argv.includes('--baseline');
const capture = process.argv.includes('--capture');
const output = path.resolve(__dirname, '../../../.cache/navigation-refresh-2026-10-20');
const delayMs = 900;

async function check(width, locale) {
  const dictionary = locale === 'en' ? en : id, fixture = createFixture(), respond = fixture.respond;
  fixture.state.locale = locale;
  let active = null;
  fixture.respond = (url, method, body) => {
    const endpoint = new URL(url).pathname.replace(/^\/api/, '');
    if (active && method === 'GET' && endpoint === active.endpoint) {
      active.requests++;
      if (active.fail) return { status: 503, delay: delayMs, body: { success: false, message: 'Synthetic refresh failure' } };
      const response = respond(url, method, body);
      if (active.route === '/milestones') response.body.data[0].name = active.updated;
      else response.body.data.projects[0].name = active.updated;
      return { ...response, delay: delayMs };
    }
    return respond(url, method, body);
  };
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  const checks = [], requests = new Map(), apiTimings = [];
  cdp.on('Network.requestWillBeSent', event => {
    const endpoint = new URL(event.request.url).pathname.replace(/^\/api/, '');
    if (active && endpoint === active.endpoint && event.request.method === 'GET')
      requests.set(event.requestId, { endpoint, start: event.timestamp, route: active.route, fail: active.fail });
  });
  cdp.on('Network.loadingFinished', event => {
    const request = requests.get(event.requestId);
    if (request) apiTimings.push({ endpoint: request.endpoint, route: request.route, fail: request.fail,
      durationMs: Math.round((event.timestamp - request.start) * 1000) });
  });
  const link = route => `[...document.querySelectorAll('nav a[href="${route}"]')].find(e => e.getBoundingClientRect().width && !e.closest('[inert]'))`;
  async function go(route) {
    if (width < 1024) {
      await cdp.click("document.querySelector('button[aria-controls=mobile-navigation]')");
      await cdp.wait("document.querySelector('#mobile-navigation').getAttribute('aria-hidden') === 'false'", 'drawer opens');
      await pause(320);
    }
    await cdp.click(link(route));
    await cdp.wait(`location.pathname === ${JSON.stringify(route)}`, 'route committed');
  }
  async function ready(route) {
    const text = route === '/milestones' ? 'Solution Assessment' : 'Fixture solution assessment';
    await cdp.wait(`document.querySelector('main')?.innerText.includes(${JSON.stringify(text)}) && !document.querySelector('[data-page-refresh-status]')`, 'warm data ready');
  }
  try {
    await cdp.viewport(width);
    await cdp.navigate(origin + '/login');
    await cdp.wait("document.querySelector('#email')", 'login form');
    await cdp.evaluate(`(() => { for (const [selector,value] of [['#email','head_sa@fixture.invalid'],['#password','SyntheticOnly!123']]) {
      const e=document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value); e.dispatchEvent(new Event('input',{bubbles:true})); } })()`);
    await cdp.click("document.querySelector('form button[type=submit]')");
    await cdp.wait(`document.querySelector('#dashboard-summary-heading') && document.documentElement.lang === ${JSON.stringify(locale)}`, 'synthetic dashboard');
    await go('/milestones'); await ready('/milestones');
    await go('/projects'); await ready('/projects');

    for (const route of ['/milestones', '/projects']) {
      const other = route === '/milestones' ? '/projects' : '/milestones';
      for (const fail of [false, true]) {
        active = null;
        await go('/');
        await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'warm dashboard');
        await go(other);
        await ready(other);
        active = { route, endpoint: route === '/milestones' ? '/me/assigned-milestones' : '/projects',
          fail, requests: 0, updated: 'Updated synthetic ' + route.slice(1) };
        await cdp.evaluate(`(() => {
          window.__refreshObserver?.disconnect();
          const metrics = window.__refreshMetrics = {};
          document.addEventListener('click', function record(event) {
            if (!event.target.closest('nav a[href="${route}"]')) return;
            metrics.click = performance.now(); document.removeEventListener('click',record,true);
          },true);
          const observe = () => {
            if (metrics.click === undefined) return;
            if (location.pathname === '${route}' && metrics.route === undefined) metrics.route = performance.now();
            const status = document.querySelector('[data-page-refresh-status]');
            if (status && metrics.feedback === undefined) metrics.feedback = performance.now();
          };
          window.__refreshObserver = new MutationObserver(observe);
          window.__refreshObserver.observe(document.body,{subtree:true,childList:true,attributes:true});
        })()`);
        await go(route);
        await cdp.wait('true', 'route observable');
        assert(active.requests > 0, 'A real query must refetch cached data');
        if (!baseline) await cdp.wait("document.querySelector('[data-page-refresh-status]')", 'cached data refresh feedback');
        const during = await cdp.evaluate(`(() => { const e=document.querySelector('[data-page-refresh-status]'); return {
          text:e?.textContent ?? null, content:document.querySelector('main').innerText,
          drawerClosed:document.querySelector('#mobile-navigation').getAttribute('aria-hidden')==='true',
          headerHeight:document.querySelector('main header').getBoundingClientRect().height,
          reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches }; })()`);
        const cachedMarker = route === '/milestones' ? 'Solution Assessment' : 'Fixture solution assessment';
        assert(during.content.includes(cachedMarker) || during.content.includes(active.updated),
          `Cached content stays available: ${route}, fail=${fail}`);
        if (baseline) assert.equal(during.text,null);
        else { assert.equal(during.text,dictionary.nav.refreshingData); assert(during.drawerClosed); }
        if (capture && !fail && route === '/milestones') {
          if (width < 1024) await pause(320); // Let the drawer's close animation finish before visual QA.
          await cdp.screenshot(path.join(output, `refreshing-${locale}-${width}.png`));
        }
        if (fail) {
          const error = route === '/milestones' ? dictionary.milestonePage.loadFailed : dictionary.project.loadError;
          await cdp.wait(`document.querySelector('main')?.innerText.includes(${JSON.stringify(error)})`, 'API failure shown');
          assert.equal(active.requests,2,'The configured single query retry remains unchanged');
        } else {
          await cdp.wait(`document.querySelector('main')?.innerText.includes(${JSON.stringify(active.updated)})`, 'fresh data replaces cached data');
          assert.equal(active.requests,1,'One shared query request, without duplicated fetching');
        }
        await cdp.wait("!document.querySelector('[data-page-refresh-status]') && !document.querySelector('[data-navigation-status]')", 'feedback cleared');
        const measured = await cdp.evaluate(`(() => { const m=window.__refreshMetrics;return {
          clickToRouteMs:Math.round(m.route-m.click),clickToFeedbackMs:m.feedback===undefined?null:Math.round(m.feedback-m.click),
          clickToResultMs:Math.round(performance.now()-m.click),overflow:document.documentElement.scrollWidth>innerWidth+1,
          headerHeight:document.querySelector('main header').getBoundingClientRect().height }; })()`);
        assert.equal(measured.overflow,false);
        if (!baseline) { assert(measured.clickToFeedbackMs<400); assert.equal(measured.headerHeight,during.headerHeight,'Status must not shift the header'); }
        checks.push({route,width,locale,fail,requests:active.requests,cacheVisible:true,...measured});
        active=null;
      }
    }
    assert.deepEqual(traffic.errors,[]); assert.deepEqual(fixture.state.unknown,[]);
    return {checks,apiTimings,browser:runtime.browser};
  } finally { active=null;await runtime.cleanup(); }
}
async function main() {
  await fs.mkdir(output,{recursive:true});
  const scenarios=[];
  for(const width of [1440,390])for(const locale of ['en','id']) {
    if (capture && !(width === 1440 && locale === 'en' || width === 390 && locale === 'id')) continue;
    scenarios.push(await check(width,locale)); console.log(`${baseline?'BASELINE':'PASS'} ${locale} ${width}: cached query success/error and feedback cleanup`);
  }
  await fs.writeFile(path.join(output,baseline?'baseline.json':capture?'visual-results.json':'results.json'),JSON.stringify({synthetic:true,apiDelayMs:delayMs,screenshotsDuringMeasurement:capture,scenarios},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
