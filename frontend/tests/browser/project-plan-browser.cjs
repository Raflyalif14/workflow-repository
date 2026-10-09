'use strict';
// Existing app + synthetic APIs only; no business mutation is permitted by this check.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createFixture } = require('./fixtures.cjs');
const { launch } = require('./cdp.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Only loopback frontend allowed');
const output = path.resolve('docs/project-plan-cta-verification');

async function main() {
  const fixture = createFixture(), respond = fixture.respond;
  fixture.respond = (url, method, body) => {
    const result = respond(url, method, body), route = new URL(url).pathname.replace(/^\/api/, '');
    if (method === 'GET' && route === `/projects/${fixture.pid}`) {
      const project = result.body.data;
      project.status = 'DRAFT'; project.phases[0].status = 'DRAFT';
    }
    if (method === 'GET' && route === `/projects/${fixture.pid}/milestones`) {
      result.body.data.forEach(row => { row.status = 'CREATED'; });
    }
    if (method === 'GET' && route === `/projects/${fixture.pid}/plan-approval`) result.body.data = null;
    return result;
  };
  await fs.mkdir(output, { recursive: true });
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime, results = [];
  try {
    await cdp.navigate(origin + '/login');
    await cdp.wait("document.querySelector('#email')", 'login');
    await cdp.evaluate(`(() => { for (const [selector, value] of [['#email','sales@fixture.invalid'],['#password','SyntheticOnly!123']]) { const e=document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value); e.dispatchEvent(new Event('input',{bubbles:true})); } })()`);
    await cdp.click("document.querySelector('form button[type=submit]')");
    await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'synthetic dashboard');
    await cdp.navigate(origin + `/projects/${fixture.pid}`);
    await cdp.wait("document.querySelector('#next-step-title')?.textContent==='Submit the plan for review'", 'saved draft plan');
    for (const locale of ['en', 'id']) {
      if (locale === 'id') {
        await cdp.evaluate(`(() => { const e=document.querySelector('select'); e.value='id'; e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
        await cdp.wait("document.documentElement.lang==='id'", 'Indonesian locale');
      }
      for (const width of [1440, 360, 390]) {
        await cdp.viewport(width);
        const metrics = await cdp.evaluate(`(() => {
          const section=document.querySelector('#next-step-title').closest('section'), button=section.querySelector('button'), description=section.querySelector('p.max-w-2xl');
          const b=button.getBoundingClientRect(), d=description.getBoundingClientRect();
          return {width:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,
            button:button.textContent.trim(), belowDescription:b.top>=d.bottom, aligned:Math.abs(b.left-d.left)<2,
            progress:[...document.querySelector('#plan-progress-title').closest('section').querySelectorAll('li')].map(e=>e.textContent), dates:[...document.querySelectorAll('input[type=date]')].map(e=>e.value)};
        })()`);
        assert(metrics.scrollWidth <= metrics.clientWidth, 'No horizontal page overflow');
        assert(metrics.belowDescription && metrics.aligned, 'CTA remains next to its explanation');
        assert.equal(metrics.button, locale === 'en' ? 'Submit plan for review' : 'Ajukan rencana untuk ditinjau');
        assert(metrics.progress[0].includes(locale === 'en' ? 'Completed' : 'Selesai'));
        assert(metrics.progress[1].includes(locale === 'en' ? 'In progress' : 'Sedang berjalan'));
        if (results.length) assert.deepEqual(metrics.dates, results[0].dates, 'Locale and viewport changes preserve timeline inputs');
        if (width !== 390) await cdp.screenshot(path.join(output, `sales-${locale}-${width}.png`));
        results.push({ locale, ...metrics });
      }
    }
    await cdp.viewport(1440);
    await cdp.evaluate("document.querySelector('#next-step-title').closest('section').querySelector('button').focus()");
    await cdp.key('Enter', 'Enter', 13);
    await cdp.wait("document.querySelector('[role=dialog]')", 'existing submission confirmation');
    await cdp.click("[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()==='Batal')");
    await cdp.wait("!document.querySelector('[role=dialog]')", 'confirmation cancelled');
    assert(!fixture.state.requests.some(r => !['GET', 'OPTIONS'].includes(r.method) && !r.path.startsWith('/auth/')), 'Cancel causes no business mutation');
    assert.deepEqual(fixture.state.unknown, []);
    assert.deepEqual(traffic.errors, []);
    console.log('PASS: Sales plan CTA EN/ID at 360/390/1440, saved timeline progress, preserved inputs, keyboard confirmation/cancel, no business writes.');
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ results, errors: traffic.errors, unknown: fixture.state.unknown }, null, 2) + '\n');
    await runtime.cleanup();
  }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
