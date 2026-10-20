'use strict';
// Actual production pages, synthetic API only; no real account or camera access.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launch } = require('./cdp.cjs');
const { createFixture } = require('./fixtures.cjs');
require('../register.cjs');
const { en } = require('../../src/i18n/en');
const { id } = require('../../src/i18n/id');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3035';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Loopback app only');
const output = path.resolve(__dirname, '../../../.cache/frontend-rendering');
async function main() {
  const fixture = createFixture(), checks = [], projectQueries = [];
  const respond = fixture.respond;
  fixture.respond = (url, method, body) => {
    const request = new URL(url), route = request.pathname.replace(/^\/api/, '');
    if (method === 'GET' && route === '/face-login/capabilities')
      return { status: 200, body: { success: true, data: { enabled: false } } };
    if (method === 'GET' && route === '/projects') {
      projectQueries.push(request.search);
      const response = respond(url, method, body);
      const sample = response.body.data.projects[0];
      let projects = [
        { ...sample, name: 'Fixture active delivery', status: 'ACTIVE', progress: 0, totalMilestones: 3, completedMilestones: 0 },
        { ...sample, id: '90000000-0000-4000-8000-000000000099', name: 'Fixture won delivery', status: 'WON', progress: 100, totalMilestones: 3, completedMilestones: 3 },
      ];
      if (request.searchParams.has('status')) projects = projects.filter(project => project.status === request.searchParams.get('status'));
      if (request.searchParams.get('status_group') === 'DELIVERY_COMPLETED')
        projects = projects.filter(project => ['COMPLETED', 'WAITING_RESULT', 'WON', 'LOST'].includes(project.status));
      response.body.data = { projects, pagination: { page: 1, limit: 10, total: projects.length, totalPages: 1, hasNextPage: false, hasPrevPage: false } };
      return response;
    }
    return respond(url, method, body);
  };
  await fs.mkdir(output, { recursive: true });
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  try {
    await cdp.navigate(origin + '/login');
    await cdp.wait("document.querySelector('#email')", 'login form');
    await cdp.evaluate(`(() => { for (const [selector, value] of [['#email', 'sales@fixture.invalid'], ['#password', 'SyntheticOnly!123']]) {
      const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
    await cdp.click("document.querySelector('form button[type=submit]')");
    await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'synthetic login');
    const languageSelect = "[...document.querySelectorAll('select')].find(e => [...e.options].some(o => o.value === 'en') && [...e.options].some(o => o.value === 'id'))";
    for (const width of [1440, 390]) {
      await cdp.viewport(width);
      for (const route of ['/projects', '/documents']) {
        await cdp.navigate(origin + route);
        await cdp.wait(`(${languageSelect}) && !(${languageSelect}).disabled`, 'language switcher');
        for (const locale of ['en', 'id']) {
          const dictionary = locale === 'en' ? en : id;
          const label = route === '/projects' ? dictionary.projectsList.matching : dictionary.documentPage.available;
          await cdp.evaluate(`(() => { const select = (${languageSelect}); select.value = ${JSON.stringify(locale)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
          await cdp.wait(`document.documentElement.lang === ${JSON.stringify(locale)} && document.querySelector('main')?.innerText.includes(${JSON.stringify(label)})`, 'translated summary');
          let completion;
          if (route === '/projects') {
            const summary = `Array.from(document.querySelector('section[aria-label=${JSON.stringify(dictionary.projectsList.snapshot)}]').children, card => Number(card.querySelector('p').textContent))`;
            const tab = label => `[...document.querySelectorAll('button[aria-pressed]')].find(button => button.textContent.trim() === ${JSON.stringify(label)})`;
            await cdp.wait(`JSON.stringify(${summary}) === '[2,1,0,1]'`, 'one ACTIVE and one WON summary');
            await cdp.click(tab(dictionary.projectsList.deliveryComplete));
            await cdp.wait(`JSON.stringify(${summary}) === '[1,0,0,1]' && !document.querySelector('main').innerText.includes('Fixture active delivery')`, 'completed filter excludes active delivery');
            assert(await cdp.evaluate(`document.querySelector('main').innerText.includes('Fixture won delivery') && document.querySelector('main').innerText.includes(${JSON.stringify(dictionary.projectStatus.WON)})`), 'WON project retains its outcome');
            completion = { all: [2, 1, 0, 1], filtered: [1, 0, 0, 1], wonVisible: true };
            await cdp.click(tab(dictionary.projectsList.allProjects));
            await cdp.wait(`JSON.stringify(${summary}) === '[2,1,0,1]'`, 'all-projects summary restored');
          }
          await cdp.evaluate('document.fonts.ready.then(() => true)');
          const metrics = await cdp.evaluate(`(() => { const family = getComputedStyle(document.body).fontFamily.split(',')[0].trim();
            return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
              fontLoaded: [...document.fonts].some(font => font.status === 'loaded' && font.family.replaceAll('"', '') === family.replaceAll('"', '')) }; })()`);
          assert.equal(metrics.overflow, false, `${route} ${locale} ${width}: page overflow`);
          assert.equal(metrics.fontLoaded, true, 'Bundled font must load successfully');
          checks.push({ route, locale, width, summaryUpdated: true, ...metrics, ...(completion ? { completion } : {}) });
          if (width === 1440 && route === '/projects' && locale === 'en' || width === 390 && route === '/documents' && locale === 'id')
            await cdp.screenshot(path.join(output, `${route.slice(1)}-${locale}-${width}.png`));
        }
      }
    }
    assert(traffic.allowed.some(request => /\.(ttf|woff2?)(\?|$)/.test(request.path)), 'Font must be fetched from the local app');
    assert(!traffic.blocked.some(request => /fonts\.(googleapis|gstatic)\.com/.test(request.host)), 'No external Google Fonts request');
    assert.deepEqual(traffic.errors, []); assert.deepEqual(fixture.state.unknown, []);
    assert(projectQueries.some(query => new URLSearchParams(query).get('status_group') === 'DELIVERY_COMPLETED'), 'Completed tab must request the server-side group');
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ browser: runtime.browser, checks, projectQueries, errors: traffic.errors, unknown: fixture.state.unknown }, null, 2));
    console.log(`${checks.length} browser checks passed: projects/documents EN/ID, desktop/mobile, completed count/filter, local font and overflow.`);
  } finally { await runtime.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
