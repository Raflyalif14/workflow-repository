'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launch } = require('./cdp.cjs');
const { createFixture } = require('./fixtures.cjs');
require('../register.cjs');
const { en } = require('../../src/i18n/en');
const { id } = require('../../src/i18n/id');
const { getLocalDateOnlyKey } = require('../../src/lib/dates');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3036';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback frontend only');
const output = path.resolve(__dirname, '../../../.cache/deadline-calendar/browser');

async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = createFixture(), checks = [];
  const today = getLocalDateOnlyKey(), month = today.slice(0, 7);
  let mode = 'ready';
  const baseRespond = fixture.respond;
  fixture.respond = (url, method, body) => {
    const u = new URL(url);
    if (method === 'GET' && u.pathname.replace(/^\/api/, '') === '/me/deadline-calendar') {
      const requested = u.searchParams.get('month');
      if (mode === 'error') return { status: 503, body: { success: false, message: 'Synthetic read failure' } };
      const row = (n, name, day, status = 'IN_PROGRESS', extra = {}) => ({ id: `calendar-${n}`, name, dueDate: `${requested}-${day}`, status,
        project: { id: fixture.pid, name: n % 2 ? 'Integrasi Sistem Pelabuhan' : 'Dashboard Operasional', status: 'ACTIVE', is_postponed: false, ...extra } });
      const items = mode === 'empty' || requested !== month ? [] : [
        row(1, 'Perancangan solusi', today.slice(8)), row(2, 'Review proposal', today.slice(8)), row(3, 'Konfirmasi kebutuhan', today.slice(8)),
        row(4, 'Analisis kebutuhan', '06', 'COMPLETED'), row(5, 'Dokumen penawaran', '12'),
        row(6, 'Evaluasi teknis', '17', 'IN_PROGRESS', { is_postponed: true }), row(7, 'Persiapan presentasi', '25'),
        row(8, 'Review arsitektur', '28'), row(9, 'Persetujuan solusi', '30', 'COMPLETED'),
      ];
      return { status: 200, delay: mode === 'loading' ? 1500 : 0, body: { success: true, data: { month: requested, items } } };
    }
    return baseRespond(url, method, body);
  };
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  const button = text => `[...document.querySelectorAll('main button')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`;
  const includes = text => `document.querySelector('[data-deadline-calendar]')?.textContent.includes(${JSON.stringify(text)})`;
  const setLanguage = async locale => {
    const select = "[...document.querySelectorAll('select')].find(e => [...e.options].some(o => o.value === 'en') && [...e.options].some(o => o.value === 'id'))";
    await cdp.wait(`(${select}) && !(${select}).disabled`, 'language ready');
    await cdp.evaluate(`(() => { const e = (${select}); e.value = ${JSON.stringify(locale)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await cdp.wait(`document.documentElement.lang === ${JSON.stringify(locale)}`, 'language applied');
  };
  const open = async d => {
    await cdp.navigate(origin + '/milestones');
    await cdp.wait(button(d.deadlineCalendar.calendar), 'calendar switch');
    await cdp.click(button(d.deadlineCalendar.calendar));
  };
  try {
    await cdp.viewport(1440);
    for (const role of ['HEAD_SA', 'SA', 'SALES', 'SUPER_ADMIN']) {
      fixture.state.locale = 'en'; mode = 'ready';
      await cdp.navigate(origin + '/login');
      await cdp.wait("document.querySelector('#email')", 'login');
      await cdp.evaluate(`(() => { for (const [selector, value] of [['#email', ${JSON.stringify(role.toLowerCase() + '@fixture.invalid')}], ['#password', 'SyntheticOnly!123']]) { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
      await cdp.click("document.querySelector('form button[type=submit]')");
      await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'login complete');
      const before = traffic.api.length;
      await cdp.navigate(origin + '/milestones');
      await cdp.wait(button(en.deadlineCalendar.calendar), 'list initially selected');
      assert(!traffic.api.slice(before).some(row => row.path.endsWith('/deadline-calendar')), 'List view does not fetch calendar');
      await cdp.click(button(en.deadlineCalendar.calendar));
      await cdp.wait("document.querySelector('[data-calendar-day]')", 'calendar dates');
      assert.equal(await cdp.evaluate(`document.querySelectorAll('[data-calendar-event]').length`), 3);
      for (const locale of ['en', 'id']) {
        await setLanguage(locale); const d = locale === 'en' ? en : id;
        await cdp.wait(includes(d.deadlineCalendar.title), 'localized calendar');
        for (const width of [1440, 360]) {
          await cdp.viewport(width);
          assert(await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'No horizontal overflow');
          assert.equal(await cdp.evaluate(`document.querySelector('[data-calendar-day="${today}"]').getAttribute('aria-current')`), 'date');
          const links = await cdp.evaluate("[...document.querySelectorAll('[data-calendar-event]')].map(e=>e.getAttribute('href'))");
          assert.deepEqual(links, [1, 2, 3].map(n => `/projects/${fixture.pid}#project-milestone-calendar-${n}`));
          if (role === 'HEAD_SA') {
            await cdp.evaluate("new Promise(resolve => { window.scrollTo({top:0,behavior:'instant'}); requestAnimationFrame(() => requestAnimationFrame(resolve)); })");
            await cdp.screenshot(path.join(output, `calendar-${locale}-${width}.png`));
          }
          await cdp.click(`document.querySelector('[data-calendar-day="${month}-17"]')`);
          await cdp.wait(includes(d.deadlineCalendar.paused), 'paused event');
          await cdp.click(`document.querySelector('[data-calendar-day="${month}-02"]')`);
          await cdp.wait(includes(d.deadlineCalendar.emptyDay), 'empty agenda');
          await cdp.click(button(d.deadlineCalendar.todayButton));
          await cdp.wait("document.querySelectorAll('[data-calendar-event]').length === 3", 'today resets day');
          checks.push({ role, locale, width, calendar: true, links: true, dailyAgenda: true });
        }
      }
      const d = id;
      await cdp.click(`document.querySelector('button[aria-label="${d.deadlineCalendar.nextMonth}"]')`);
      await cdp.wait(includes(d.deadlineCalendar.emptyMonth), 'next month empty');
      await cdp.click(button(d.deadlineCalendar.todayButton));
      await cdp.wait("document.querySelectorAll('[data-calendar-event]').length === 3", 'return to current month');
      if (role === 'HEAD_SA') {
        for (const state of ['loading', 'error', 'empty']) {
          mode = state;
          await open(d);
          if (state === 'loading') await cdp.wait(includes(d.deadlineCalendar.loading), 'loading feedback');
          await cdp.wait(state === 'error' ? includes(d.deadlineCalendar.error) : state === 'empty' ? includes(d.deadlineCalendar.emptyMonth) : "document.querySelector('[data-calendar-event]')", `${state} feedback`);
          if (state === 'error') {
            assert.equal(await cdp.evaluate("document.querySelectorAll('[data-calendar-event]').length"), 0);
            mode = 'ready'; await cdp.click(button(d.deadlineCalendar.retry));
            await cdp.wait("document.querySelector('[data-calendar-event]')", 'retry succeeds');
          }
          checks.push({ state, feedback: true });
        }
      }
      mode = 'ready';
      await cdp.click(`document.querySelector('button[aria-label="${d.nav.logout}"]')`);
      await cdp.wait("document.querySelector('#email')", 'logout');
    }
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
    assert.deepEqual(traffic.api.filter(row => !['GET', 'OPTIONS'].includes(row.method) && !['/api/auth/login', '/api/auth/logout', '/api/auth/preferences/language'].includes(row.path)), []);
    console.log(`${checks.length} calendar browser scenarios passed: four roles, EN/ID, desktop/mobile, agenda, links, month navigation, loading/error/retry/empty.`);
  } catch (error) {
    await cdp.screenshot(path.join(output, 'failure.png')).catch(() => {}); throw error;
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors: traffic.errors, unknown: fixture.state.unknown }, null, 2));
    await runtime.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
