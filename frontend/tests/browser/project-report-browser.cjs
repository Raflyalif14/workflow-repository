'use strict';
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
const output = path.resolve(__dirname, '../../../.cache/project-report/browser');
const downloads = path.join(output, 'downloads');

async function main() {
  await fs.mkdir(downloads, { recursive: true });
  const fixture = createFixture(), checks = [], files = [];
  const respond = fixture.respond;
  let mode = 'ready';
  fixture.respond = (url, method, body) => {
    const p = new URL(url).pathname.replace(/^\/api/, '');
    if (method === 'GET' && /^\/milestones\/report-\d+\/deadline-(status|approval)$/.test(p))
      return respond(url.replace(/report-\d+/, fixture.mid), method, body);
    if (method === 'GET' && p === `/projects/${fixture.pid}/intake-attachments`) return { status: 200, body: { success: true, data: [] } };
    if (method === 'GET' && [`/projects/${fixture.pid}`, `/projects/${fixture.pid}/milestones`].includes(p) && mode === 'error')
      return { status: 403, body: { success: false, message: 'Synthetic access denied' } };
    const result = respond(url, method, body);
    if (method === 'GET' && p === `/projects/${fixture.pid}`) {
      result.body.data.name = 'Integrasi Sistem Pelabuhan'; result.body.data.customer = 'Pelabuhan Démo & Mitra';
      result.body.data.active_scenario = result.body.data.scenario;
    }
    if (method === 'GET' && p === `/projects/${fixture.pid}/milestones`) {
      const base = result.body.data[0];
      result.body.data = mode === 'empty' ? [] : Array.from({ length: mode === 'long' ? 58 : 3 }, (_, index) => ({ ...base,
        id: `report-${index}`, step_order: index + 1,
        name: mode === 'long' ? `Milestone ${index + 1}: Review arsitektur & integrasi sistem lintas departemen untuk pelanggan Démo dengan penyesuaian infrastruktur dan persetujuan operasional` : ['Analisis kebutuhan', 'Perancangan solusi', 'Review proposal & persetujuan'][index],
        status: index === 0 ? 'COMPLETED' : index === 1 ? 'APPROVED' : 'IN_PROGRESS',
        start_date: '2026-10-01', due_date: index === 2 ? null : '2026-10-31',
      }));
      result.body.data.push({ ...base, id: 'old-phase', phase_id: 'phase-old', name: 'MUST NOT EXPORT HISTORICAL PHASE', status: 'COMPLETED' });
    }
    return result;
  };
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  const namedButton = label => `[...document.querySelectorAll('main button')].find(e => e.textContent.trim() === ${JSON.stringify(label)})`;
  const dialog = "document.querySelector('[role=dialog]')";
  const exportFile = async (format, archive) => {
    const previous = new Map(await Promise.all((await fs.readdir(downloads)).map(async name => [name, (await fs.stat(path.join(downloads, name))).mtimeMs])));
    await cdp.click(`document.querySelector('[data-report-format=${format}]')`);
    let downloaded;
    for (let tries = 0; tries < 180; tries++) {
      for (const name of (await fs.readdir(downloads)).filter(name => name.endsWith('.' + format))) {
        const stat = await fs.stat(path.join(downloads, name));
        if (!previous.has(name) || stat.mtimeMs !== previous.get(name)) {
          await pause(200);
          if ((await fs.stat(path.join(downloads, name))).size === stat.size) { downloaded = name; break; }
        }
      }
      if (downloaded) break;
      await pause(100);
    }
    assert(downloaded, `Real ${format} download must complete`);
    const destination = path.join(output, archive + '.' + format);
    await fs.rename(path.join(downloads, downloaded), destination);
    const bytes = await fs.readFile(destination);
    assert.equal(bytes.subarray(0, format === 'pdf' ? 5 : 2).toString(), format === 'pdf' ? '%PDF-' : 'PK');
    files.push({ path: destination, bytes: bytes.length });
  };
  const changeLanguage = async locale => {
    const selector = "[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='en')&&[...e.options].some(o=>o.value==='id'))";
    await cdp.wait(`(${selector})&&!(${selector}).disabled`, 'language selector');
    await cdp.evaluate(`(()=>{const e=(${selector});e.value=${JSON.stringify(locale)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await cdp.wait(`document.documentElement.lang===${JSON.stringify(locale)}`, 'language applied');
  };
  try {
    for (const role of ['HEAD_SA', 'SA', 'SALES', 'SUPER_ADMIN']) {
      mode = 'ready'; fixture.state.locale = 'en'; await cdp.viewport(1440);
      await cdp.navigate(origin + '/login'); await cdp.wait("document.querySelector('#email')", 'login form');
      await cdp.evaluate(`(()=>{for(const [selector,value] of [['#email',${JSON.stringify(role.toLowerCase() + '@fixture.invalid')}],['#password','SyntheticOnly!123']]){const e=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
      await cdp.click("document.querySelector('form button[type=submit]')");
      await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'login complete');
      await cdp.navigate(origin + `/projects/${fixture.pid}`);
      for (const locale of ['en', 'id']) {
        const d = locale === 'en' ? en : id;
        await changeLanguage(locale); await cdp.wait(namedButton(d.reportExport.button), 'export button');
        for (const width of [1440, 360]) {
          await cdp.viewport(width); await cdp.click(namedButton(d.reportExport.button));
          await cdp.wait(dialog, 'export dialog');
          assert(await cdp.evaluate(`(${dialog}).textContent.includes(${JSON.stringify(d.reportExport.scope)})`));
          assert(await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'No page overflow');
          assert(await cdp.evaluate(`(()=>{const r=(${dialog}).getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;})()`), 'Dialog fits screen');
          if (role === 'HEAD_SA') {
            if (width === 1440) { await exportFile('xlsx', `report-${locale}`); await exportFile('pdf', `report-${locale}`); }
            await cdp.screenshot(path.join(output, `dialog-${locale}-${width}.png`));
          }
          await cdp.key('Escape', 'Escape', 27); await cdp.wait(`!(${dialog})`, 'escape closes dialog');
          checks.push({ role, locale, width, dialog: true });
        }
      }
      if (role === 'HEAD_SA') {
        await cdp.viewport(1440); await cdp.click(namedButton(id.reportExport.button)); mode = 'error';
        await cdp.click("document.querySelector('[data-report-format=pdf]')");
        await cdp.wait(`(${dialog})?.textContent.includes(${JSON.stringify(id.reportExport.failed)})`, 'failed read feedback');
        assert.equal((await fs.readdir(downloads)).filter(name => name.endsWith('.pdf')).length, 0, 'Denied reads never download cached data');
        mode = 'long'; await exportFile('pdf', 'report-long-id'); await exportFile('xlsx', 'report-long-id');
        checks.push({ errorRetry: true, multipage: true });
        mode = 'empty'; await exportFile('pdf', 'report-empty-id'); await exportFile('xlsx', 'report-empty-id');
        checks.push({ emptyPhase: true }); await cdp.key('Escape', 'Escape', 27);
      }
      mode = 'ready';
      await cdp.click(`document.querySelector('button[aria-label="${id.nav.logout}"]')`);
      await cdp.wait("document.querySelector('#email')", 'logout');
    }
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
    assert.deepEqual(traffic.api.filter(row => !['GET', 'OPTIONS'].includes(row.method) && !['/api/auth/login', '/api/auth/logout', '/api/auth/preferences/language'].includes(row.path)), []);
    console.log(`${checks.length} report browser scenarios and ${files.length} real Excel/PDF downloads passed: roles, EN/ID, desktop/mobile, failure/retry, long and empty reports.`);
  } catch (error) { await cdp.screenshot(path.join(output, 'failure.png')).catch(() => {}); throw error;
  } finally { await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, files, errors: traffic.errors, unknown: fixture.state.unknown }, null, 2)); await runtime.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
