'use strict';
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createFixture } = require('./fixtures.cjs');
const { launch } = require('./cdp.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Only loopback frontend allowed');
const output = path.resolve('docs/project-activity-verification');
async function main() {
  const fixture = createFixture(), respond = fixture.respond;
  fixture.respond = (url, method, body) => {
    const result = respond(url, method, body), route = new URL(url).pathname.replace(/^\/api/, '');
    if (method === 'GET' && route === `/projects/${fixture.pid}/activities`) {
      const base = result.body.data.items[0];
      result.body.data.items = [
        { ...base, action: 'PROJECT_TIMELINE_UPDATED', description: null, businessChange: {
          objectType: 'PROJECT', objectId: fixture.pid, changedFields: ['schedule'],
          before: { schedule: [{ id: fixture.mid, start_date: '2026-10-07', duration_working_days: null, due_date: null }] },
          after: { schedule: [{ id: fixture.mid, start_date: '2026-10-09', duration_working_days: 1, due_date: '2026-10-09' }] }
        } },
        { ...base, id: 'synthetic-creation', action: 'PROJECT_CREATED', description: null, businessChange: {
          objectType: 'PROJECT', objectId: fixture.pid, changedFields: ['name', 'scenario_id', 'estimated_revenue', 'status'],
          before: {}, after: { name: 'Synthetic project', scenario_id: '90000000-0000-4000-8000-000000000004', estimated_revenue: '15000000', status: 'DRAFT' }
        } }
      ];
    }
    return result;
  };
  await fs.mkdir(output, { recursive: true });
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime, results = [];
  try {
    await cdp.navigate(origin + '/login');
    await cdp.wait("document.querySelector('#email')", 'login');
    await cdp.evaluate(`(() => { for(const [selector,value] of [['#email','sales@fixture.invalid'],['#password','SyntheticOnly!123']]) { const e=document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value); e.dispatchEvent(new Event('input',{bubbles:true})); } })()`);
    await cdp.click("document.querySelector('form button[type=submit]')");
    await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'synthetic dashboard');
    await cdp.navigate(origin + `/projects/${fixture.pid}`);
    await cdp.wait("document.querySelector('time')?.closest('ol')?.textContent.includes('Project Timeline Updated')", 'structured activities');
    for (const locale of ['en', 'id']) {
      if (locale === 'id') {
        await cdp.evaluate("(() => { const e=document.querySelector('select'); e.value='id'; e.dispatchEvent(new Event('change',{bubbles:true})); })()");
        await cdp.wait("document.documentElement.lang==='id'", 'Indonesian locale');
      }
      for (const width of [1440, 360, 390]) {
        await cdp.viewport(width);
        const metrics = await cdp.evaluate("({width:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,text:document.querySelector('time').closest('ol').innerText})");
        assert(metrics.scrollWidth <= metrics.clientWidth);
        assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(metrics.text));
        assert(!metrics.text.includes('null'));
        assert(metrics.text.includes('Solution Assessment') && metrics.text.includes('Pra-Tender'));
        assert(metrics.text.includes(locale === 'en' ? 'Working days' : 'Hari kerja'));
        assert(metrics.text.includes(locale === 'en' ? 'Not set' : 'Belum diatur'));
        if (width !== 390) await cdp.screenshot(path.join(output, `sales-${locale}-${width}.png`));
        results.push({ locale, ...metrics });
      }
    }
    assert(!fixture.state.requests.some(r => !['GET', 'OPTIONS'].includes(r.method) && !r.path.startsWith('/auth/')));
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
    console.log('PASS: readable audit EN/ID at 360/390/1440px, no technical IDs/null/overflow or business writes.');
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ results, errors: traffic.errors, unknown: fixture.state.unknown }, null, 2) + '\n');
    await runtime.cleanup();
  }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
