'use strict';
// Actual project page/components with synthetic auth and intercepted API reads.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launch, pause } = require('./cdp.cjs');
const { createFixture } = require('./fixtures.cjs');
require('../register.cjs');
const { en } = require('../../src/i18n/en');
const { id } = require('../../src/i18n/id');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3036';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback frontend only');
const output = path.resolve(__dirname, '../../../.cache/clean-code-project-detail/browser');

async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = createFixture(), checks = [];
  let draft = false;
  const respond = fixture.respond;
  fixture.respond = (url, method, body) => {
    const route = new URL(url).pathname.replace(/^\/api/, '');
    if (method === 'GET' && route === '/face-login/capabilities')
      return { status: 200, body: { success: true, data: { enabled: false } } };
    if (method === 'GET' && route === `/projects/${fixture.pid}/intake-attachments`)
      return { status: 200, body: { success: true, data: [{ id: 'intake-fixture', project_id: fixture.pid, kind: 'MOM',
        file_name: 'Synthetic intake memo.pdf', mime_type: 'application/pdf', size_bytes: 2048, created_at: '2026-10-01T12:00:00Z' }] } };
    const response = respond(url, method, body);
    if (draft && method === 'GET' && route === `/projects/${fixture.pid}`) response.body.data.status = 'DRAFT';
    if (draft && method === 'GET' && route === `/projects/${fixture.pid}/plan-approval`) response.body.data.status = 'PENDING';
    return response;
  };
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  const namedButton = label => `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(label)})`;
  const languageSelect = "[...document.querySelectorAll('select')].find(e => [...e.options].some(o => o.value === 'en') && [...e.options].some(o => o.value === 'id'))";
  const setLanguage = async locale => {
    await cdp.wait(`(${languageSelect}) && !(${languageSelect}).disabled`, 'language control');
    await cdp.evaluate(`(() => { const select = (${languageSelect}); select.value = ${JSON.stringify(locale)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await cdp.wait(`document.documentElement.lang === ${JSON.stringify(locale)}`, 'locale applied');
  };
  const checkLayout = async label => {
    await pause(120);
    assert(await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), label + ': horizontal overflow');
  };
  try {
    for (const role of ['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN']) {
      draft = false; fixture.state.locale = 'en';
      await cdp.navigate(origin + '/login');
      await cdp.wait("document.querySelector('#email')", 'login form');
      await cdp.evaluate(`(() => { for (const [selector, value] of [['#email', ${JSON.stringify(role.toLowerCase() + '@fixture.invalid')}], ['#password', 'SyntheticOnly!123']]) {
        const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
      await cdp.click("document.querySelector('form button[type=submit]')");
      await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'synthetic login');
      await cdp.navigate(origin + `/projects/${fixture.pid}`);
      await cdp.wait(`document.querySelector('#project-milestone-${fixture.mid}') && document.querySelector('main')?.textContent.includes('Synthetic intake memo.pdf')`, 'project detail data');
      for (const locale of ['en', 'id']) {
        const dictionary = locale === 'en' ? en : id;
        await setLanguage(locale);
        for (const width of [1440, 390]) {
          await cdp.viewport(width);
          await cdp.wait(`document.querySelector('main')?.textContent.includes(${JSON.stringify(dictionary.copy.projectIntake)})`, 'translated intake section');
          assert(await cdp.evaluate(`document.querySelector('main').textContent.includes(${JSON.stringify(dictionary.copy.activity)})`));
          const toggle = `document.querySelector('button[aria-controls="milestone-panel-${fixture.mid}"]')`;
          if (await cdp.evaluate(`(${toggle}).getAttribute('aria-expanded') === 'false'`)) await cdp.click(toggle);
          await cdp.wait(`document.querySelector('#milestone-panel-${fixture.mid}')?.textContent.includes(${JSON.stringify(dictionary.milestoneCompact.scheduleDetails)})`, 'milestone details');
          await cdp.click(toggle);
          assert(await cdp.evaluate(`document.querySelector('#milestone-panel-${fixture.mid}').hidden`), 'Collapse preserves the milestone target');
          await cdp.click(toggle);
          const hasDangerZone = await cdp.evaluate(`document.querySelector('main').textContent.includes(${JSON.stringify(dictionary.copy.deleteProject)})`);
          assert.equal(hasDangerZone, role === 'SUPER_ADMIN', 'Only Super Admin sees project deletion');
          await checkLayout(`${role} ${locale} ${width}`);
          checks.push({ role, locale, width, state: 'ACTIVE', intake: true, activity: true, expandCollapse: true, dangerZoneScoped: true });
          if (role === 'SA' && locale === 'id' && width === 390 || role === 'HEAD_SA' && locale === 'en' && width === 1440) {
            await cdp.evaluate('scrollTo(0, 0)');
            await cdp.screenshot(path.join(output, `active-${role.toLowerCase()}-${locale}-${width}.png`));
          }
        }
      }
      if (role === 'HEAD_SA') {
        draft = true;
        await cdp.navigate(origin + `/projects/${fixture.pid}`);
        for (const locale of ['en', 'id']) {
          const dictionary = locale === 'en' ? en : id;
          await setLanguage(locale);
          await cdp.viewport(390);
          await cdp.wait(namedButton(dictionary.copy.rejectPlan), 'plan review controls');
          await cdp.click(namedButton(dictionary.copy.rejectPlan));
          await cdp.wait("document.querySelector('#project-plan-review-note')", 'extracted plan review dialog');
          assert(await cdp.evaluate("document.querySelector('#project-plan-review-note').required"));
          assert.equal(await cdp.evaluate("!!document.querySelector('#project-plan-pic')"), false);
          await checkLayout('plan review dialog');
          await cdp.click(namedButton(dictionary.common.cancel));
          await cdp.wait("!document.querySelector('#project-plan-review-note')", 'plan dialog cancelled');
          checks.push({ role, locale, width: 390, state: 'DRAFT', rejectReasonRequired: true, cancelWithoutWrite: true });
        }
      }
      await cdp.click("document.querySelector('button[aria-label=" + JSON.stringify(fixture.state.locale === 'id' ? id.nav.logout : en.nav.logout) + "]')");
      await cdp.wait("document.querySelector('#email')", 'logout');
    }
    assert.deepEqual(fixture.state.unknown, []);
    assert.deepEqual(traffic.errors, []);
    const businessWrites = traffic.api.filter(request => !['GET', 'OPTIONS'].includes(request.method)
      && !['/api/auth/login', '/api/auth/logout', '/api/auth/preferences/language'].includes(request.path));
    assert.deepEqual(businessWrites, [], 'No project mutation is sent by the browser checks');
    console.log(`${checks.length} project detail browser scenarios passed: four roles, EN/ID, desktop/mobile, intake/activity, milestone expansion and plan dialog cancellation.`);
  } catch (error) {
    await cdp.screenshot(path.join(output, 'failure.png')).catch(() => {});
    throw error;
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors: traffic.errors, unknown: fixture.state.unknown, browser: runtime.browser }, null, 2));
    await runtime.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
