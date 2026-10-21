'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launch } = require('./cdp.cjs');
const { createFixture } = require('./fixtures.cjs');
require('../register.cjs');
const { en } = require('../../src/i18n/en');
const { id } = require('../../src/i18n/id');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3036';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback frontend only');
const output = path.resolve(__dirname, '../../../.cache/clean-code-milestones/browser');

async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = createFixture(), checks = [];
  let mode = 'ready';
  const respond = fixture.respond;
  fixture.respond = (url, method, body) => {
    const route = new URL(url).pathname.replace(/^\/api/, '');
    if (method === 'GET' && route === '/face-login/capabilities')
      return { status: 200, body: { success: true, data: { enabled: false } } };
    const response = respond(url, method, body);
    if (method !== 'GET' || !['/me/assigned-milestones', '/documents/outputs'].includes(route)) return response;
    if (mode === 'error') return { status: 503, delay: 1200, body: { success: false, message: 'Synthetic queue failure' } };
    if (mode === 'empty') { response.body.data = []; return response; }
    if (route === '/me/assigned-milestones') {
      const base = response.body.data[0];
      const row = (name, statuses, extra = {}) => ({ ...base, id: name, name: `Synthetic ${name}`,
        outputs: statuses.map(status => ({ status, is_selected: true, is_required: false })), ...extra });
      response.body.data = [row('mixed', ['IN_REVIEW', 'DRAFT']), row('revision', ['REVISION_REQUIRED']),
        row('waiting', ['IN_REVIEW']), row('completed', ['APPROVED'], { status: 'COMPLETED' }),
        row('paused', ['DRAFT'], { project: { ...base.project, is_postponed: true } }),
        row('approved-only', ['APPROVED']), row('paused-status', ['IN_REVIEW'], { project: { ...base.project, status: 'POSTPONED' } })];
    } else {
      response.body.data = ['IN_REVIEW', 'APPROVED'].map((status, index) => ({ projectId: fixture.pid,
        milestoneId: `review-${index}`, projectName: 'Synthetic review project', documentKey: `synthetic-output-${index}`,
        name: `Synthetic ${status}`, status, files: [] }));
    }
    return response;
  };
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  const tab = label => `[...document.querySelectorAll('main button[aria-pressed]')].find(e => e.textContent.trim().startsWith(${JSON.stringify(label)}))`;
  const mainIncludes = text => `document.querySelector('main')?.textContent.includes(${JSON.stringify(text)})`;
  const rows = () => cdp.evaluate(`[...document.querySelectorAll('main a[href*="#project-milestone-"]')].map(e => e.getAttribute('href').split('#project-milestone-')[1]).sort()`);
  const setLanguage = async locale => {
    const select = "[...document.querySelectorAll('select')].find(e => [...e.options].some(o => o.value === 'en') && [...e.options].some(o => o.value === 'id'))";
    await cdp.wait(`(${select}) && !(${select}).disabled`, 'language selector ready');
    await cdp.evaluate(`(() => { const e = (${select}); e.value = ${JSON.stringify(locale)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await cdp.wait(`document.documentElement.lang === ${JSON.stringify(locale)}`, 'locale applied');
  };
  try {
    for (const role of ['SA', 'HEAD_SA', 'SALES', 'SUPER_ADMIN']) {
      mode = 'ready'; fixture.state.locale = 'en';
      await cdp.navigate(origin + '/login');
      await cdp.wait("document.querySelector('#email')", 'login form');
      await cdp.evaluate(`(() => { for (const [selector, value] of [['#email', ${JSON.stringify(role.toLowerCase() + '@fixture.invalid')}], ['#password', 'SyntheticOnly!123']]) {
        const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
      await cdp.click("document.querySelector('form button[type=submit]')");
      await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'synthetic login');
      for (const locale of ['en', 'id']) {
        mode = 'ready';
        const start = traffic.api.length;
        await cdp.navigate(origin + '/milestones');
        await setLanguage(locale);
        const d = locale === 'en' ? en : id;
        const assignedRole = ['SA', 'HEAD_SA'].includes(role);
        for (const width of [1440, 390]) {
          await cdp.viewport(width);
          if (assignedRole) {
            await cdp.wait(tab(d.milestonePage.needsAction), 'queue tabs');
            await cdp.click(tab(d.milestonePage.needsAction));
            await cdp.wait(mainIncludes('Synthetic mixed'), 'assigned work ready');
            assert.deepEqual(await rows(), ['mixed', 'revision']);
            const snapshot = await cdp.evaluate(`[...document.querySelector('main section[aria-label]').children].map(e => Number(e.querySelector('p').textContent))`);
            assert.deepEqual(snapshot, role === 'HEAD_SA' ? [2, 1, 1, 1] : [2, 1, 1, 7]);
            for (const [label, expected] of [[d.milestonePage.needsAction, ['mixed', 'revision']],
              [d.milestonePage.underReview, ['waiting']], [d.projectStatus.COMPLETED, ['completed']],
              [d.milestonePage.allAssigned, ['approved-only', 'completed', 'mixed', 'paused', 'paused-status', 'revision', 'waiting']]]) {
              await cdp.click(tab(label));
              assert.deepEqual(await rows(), expected, `${role} ${locale}: ${label}`);
              assert.equal(await cdp.evaluate(`(${tab(label)}).querySelector('span').textContent`), String(expected.length));
            }
            assert(await cdp.evaluate(mainIncludes(d.projectStatus.POSTPONED)), 'Paused rows remain visible under All');
            assert.equal(await cdp.evaluate(`!!(${tab(d.milestonePage.pendingReview)})`), role === 'HEAD_SA');
            if (role === 'HEAD_SA') {
              await cdp.click(tab(d.milestonePage.pendingReview));
              await cdp.wait(`document.querySelector('main a[href$="#milestone-outputs-review-0"]')`, 'review output link');
              const links = await cdp.evaluate(`[...document.querySelectorAll('main a[href*="#milestone-outputs-"]')].map(e => e.getAttribute('href'))`);
              assert.deepEqual(links, [`/projects/${fixture.pid}#milestone-outputs-review-0`]);
              assert.equal(await cdp.evaluate(`(${tab(d.milestonePage.pendingReview)}).querySelector('span').textContent`), '1');
            }
          } else {
            await cdp.wait(mainIncludes(d.copy.milestoneLocation), 'project-based role guidance');
            assert.equal(await cdp.evaluate("document.querySelectorAll('main button[aria-pressed]').length"), 2, 'List/calendar switch remains available');
          }
          assert(await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'No horizontal page overflow');
          checks.push({ role, locale, width, state: 'ready', tabsAndCounts: assignedRole, roleScoped: true });
          if (role === 'SA' && locale === 'id' && width === 390 || role === 'HEAD_SA' && locale === 'en' && width === 1440)
            await cdp.screenshot(path.join(output, `${role.toLowerCase()}-${locale}-${width}.png`));
        }
        const reads = traffic.api.slice(start).filter(request => request.method === 'GET');
        if (!assignedRole) assert(!reads.some(request => request.path === '/api/me/assigned-milestones'));
        if (role !== 'HEAD_SA') assert(!reads.some(request => request.path === '/api/documents/outputs'));
        if (assignedRole) {
          for (const state of ['error', 'empty']) {
            mode = state;
            await cdp.navigate(origin + '/milestones');
            await cdp.wait(tab(d.milestonePage.needsAction), 'reloaded queue');
            if (state === 'error') await cdp.wait("document.querySelector('main [role=status]')", 'assignment loading announcement');
            await cdp.wait(mainIncludes(state === 'error' ? d.milestonePage.loadFailed : d.milestonePage.noAction), `assignment ${state}`);
            assert.deepEqual(await rows(), []);
            if (role === 'HEAD_SA') {
              await cdp.click(tab(d.milestonePage.pendingReview));
              await cdp.wait(mainIncludes(state === 'error' ? d.milestonePage.reviewLoadFailed : d.milestonePage.noReviewOutputs), `reviews ${state}`);
            }
            checks.push({ role, locale, width: 390, state, localizedFeedback: true });
          }
        }
      }
      const dictionary = fixture.state.locale === 'id' ? id : en;
      await cdp.click(`document.querySelector('button[aria-label=${JSON.stringify(dictionary.nav.logout)}]')`);
      await cdp.wait("document.querySelector('#email')", 'logout');
    }
    assert.deepEqual(fixture.state.unknown, []);
    assert.deepEqual(traffic.errors, []);
    assert.deepEqual(traffic.api.filter(request => !['GET', 'OPTIONS'].includes(request.method)
      && !['/api/auth/login', '/api/auth/logout', '/api/auth/preferences/language'].includes(request.path)), []);
    console.log(`${checks.length} Milestones browser scenarios passed: role access, all tabs/counts/links, EN/ID, desktop/mobile, loading/error/empty.`);
  } catch (error) {
    await cdp.screenshot(path.join(output, 'failure.png')).catch(() => {});
    throw error;
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors: traffic.errors, unknown: fixture.state.unknown, browser: runtime.browser }, null, 2));
    await runtime.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
