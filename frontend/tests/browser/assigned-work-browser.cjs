'use strict';
// Actual app, AuthProvider and Assigned work page; API traffic is fixture-only.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createFixture } = require('./fixtures.cjs');
const { launch } = require('./cdp.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Loopback app only');
const outputDir = path.resolve('docs/assigned-work-verification');

async function main() {
  const fixture = createFixture(), respond = fixture.respond;
  let items = [{ id: fixture.mid, status: 'IN_PROGRESS', outputs: ['IN_REVIEW'] }];
  fixture.respond = (url, method, body) => {
    const result = respond(url, method, body);
    if (method === 'GET' && new URL(url).pathname.replace(/^\/api/, '') === '/me/assigned-milestones') {
      const original = result.body.data[0];
      result.body.data = items.map(item => ({ ...original, id: item.id, name: `Synthetic ${item.id === fixture.mid ? 'delivery' : item.id}`,
        status: item.status, project: { ...original.project, is_postponed: Boolean(item.paused) },
        outputs: item.outputs.map(status => ({ status, is_required: true, is_selected: true })) }));
    }
    return result;
  };
  await fs.mkdir(outputDir, { recursive: true });
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime, checks = [];
  let locale = 'en';
  const labels = () => locale === 'en'
    ? ['Needs action', 'Waiting for Head SA review', 'Completed', 'All assigned']
    : ['Perlu tindakan', 'Menunggu review Head SA', 'Selesai', 'Semua tugas'];
  const button = label => `[...document.querySelectorAll('main button')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(label)}))`;
  async function verify(expected) {
    await cdp.wait(`${button(labels()[3])}?.textContent.trim().endsWith(${JSON.stringify(String(expected[3]))})`, 'assigned counters loaded');
    const actual = await cdp.evaluate(`[${labels().map(label => `${button(label)}?.querySelector('span')?.textContent`).join(',')}].map(Number)`);
    assert.deepEqual(actual, expected);
    const badge = await cdp.evaluate("document.querySelector('aside a[href=\"/milestones\"]')?.title");
    assert(badge.endsWith(': ' + expected[0]), 'Sidebar uses the same action count');
  }
  async function page(expected) {
    await cdp.navigate(origin + '/milestones'); await verify(expected);
  }
  async function rows(count) {
    await cdp.wait(`document.querySelectorAll('main a[href*="#project-milestone-"]').length===${count}`, 'filtered milestone rows');
  }
  try {
    await cdp.viewport(1440, 1000);
    await cdp.navigate(origin + '/login'); await cdp.wait("document.querySelector('#email')", 'login form');
    await cdp.evaluate(`(() => {for(const [s,v] of [['#email','sa@fixture.invalid'],['#password','SyntheticOnly!123']]){const e=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await cdp.click("document.querySelector('form button[type=submit]')");
    await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'synthetic SA session');
    await page([0, 1, 0, 1]); await cdp.click(button(labels()[1])); await rows(1);
    await fs.writeFile(path.join(outputDir, 'waiting-en-1440.png'), Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    checks.push({ check: 'Submitted waiting-only: KPI/tab=1, Needs action/sidebar=0, waiting row visible', passed: true });

    await cdp.evaluate("(() => {const e=document.querySelector('header select');if(!e)throw Error('Language selector unavailable');e.value='id';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    locale = 'id'; await verify([0, 1, 0, 1]);
    assert.equal(await cdp.evaluate(`${button(labels()[1])}?.getAttribute('aria-pressed')`), 'true'); await rows(1);
    await cdp.viewport(390, 1000); await cdp.screenshot(path.join(outputDir, 'waiting-id-390.png'));
    checks.push({ check: 'EN/ID waiting label; locale switch preserves selected review tab', passed: true });

    items = [{ id: fixture.mid, status: 'IN_PROGRESS', outputs: ['IN_REVIEW', 'DRAFT'] }];
    await page([1, 0, 0, 1]); await rows(1);
    await cdp.wait("document.querySelector('main')?.textContent.includes('1 output menunggu review Head SA')", 'mixed output indicator');
    await cdp.screenshot(path.join(outputDir, 'partial-id-390.png'));
    await cdp.click(button(labels()[1])); await rows(0);
    checks.push({ check: 'Partial submit: Needs action=1, waiting tab=0, row indicates one waiting output', passed: true });

    items = [{ id: fixture.mid, status: 'IN_PROGRESS', outputs: ['REVISION_REQUIRED'] }];
    await page([1, 0, 0, 1]); await rows(1);
    checks.push({ check: 'Returned revision restores SA action/sidebar', passed: true });

    items = [{ id: fixture.mid, status: 'COMPLETED', outputs: ['APPROVED'] }];
    await page([0, 0, 1, 1]); await cdp.click(button(labels()[2])); await rows(1);
    checks.push({ check: 'Completed uses milestone completion', passed: true });
    items = [{ id: fixture.mid, status: 'IN_PROGRESS', outputs: ['APPROVED'] }];
    await page([0, 0, 0, 1]); await cdp.click(button(labels()[3])); await rows(1);
    checks.push({ check: 'Approved-only never fabricates completion and remains in All assigned', passed: true });

    items = [{ id: fixture.mid, status: 'IN_PROGRESS', outputs: ['IN_REVIEW'], paused: true }];
    await cdp.viewport(360, 1000); await page([0, 0, 0, 1]); await cdp.click(button(labels()[3])); await rows(1);
    await cdp.wait("document.querySelector('main')?.textContent.includes('Ditunda')", 'postponed label');
    assert(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Page must not overflow horizontally');
    checks.push({ check: 'Postponed remains visible in All assigned and never becomes waiting; 360px page fits', passed: true });
    assert.equal(fixture.state.unknown.length, 0); assert.equal(traffic.errors.length, 0);
    assert.equal(traffic.api.filter(item => item.path.endsWith('/documents/outputs')).length, 0, 'SA must not fetch approved repository for review classification');
    const report = { browser: runtime.browser, role: 'SA', checks, unknownRequests: fixture.state.unknown,
      runtimeErrors: traffic.errors, liveRequests: 0,
      limits: 'Actual browser with intercepted synthetic API. No backend authorization, database workflow or live project state verification.' };
    await fs.writeFile(path.join(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await runtime.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
