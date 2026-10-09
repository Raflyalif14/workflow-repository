'use strict';
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createFixture } = require('./fixtures.cjs');
const { launch, pause } = require('./cdp.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback frontend required');
const output = path.resolve(__dirname, '../../../docs/project-delivery-verification');
async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = createFixture(), runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  const checks = [], panel = "document.querySelector('[aria-labelledby=project-delivery-heading]')";
  const locale = async lang => {
    await cdp.evaluate(`(() => {const s=document.querySelector('select[aria-label]');s.value=${JSON.stringify(lang)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await cdp.wait(`document.documentElement.lang===${JSON.stringify(lang)}`, 'locale');
  };
  async function inspect(role, lang, width, sidebar) {
    await pause(350);
    const result = await cdp.evaluate(`(() => {
      const p=${panel}, rows=[...p.querySelectorAll('.delivery-row')], r=rows[0], header=p.querySelector('.delivery-columns');
      const fits=e=>{const range=document.createRange();range.selectNodeContents(e);const box=e.getBoundingClientRect();return [...range.getClientRects()].every(x=>x.left>=box.left-1&&x.right<=box.right+1);};
      return {panelWidth:p.clientWidth, pageWidth:document.documentElement.clientWidth, scrollWidth:document.documentElement.scrollWidth,
        rowCount:rows.length, columns:r?getComputedStyle(r).gridTemplateColumns.split(' ').length:null,
        headerVisible:header?getComputedStyle(header).display!=='none':false,
        headerAligned:r&&header?[...header.children].slice(0,5).every((e,i)=>Math.abs(e.getBoundingClientRect().left-r.children[i].getBoundingClientRect().left)<1):false,
        rowHeights:rows.map(e=>e.getBoundingClientRect().height),
        labelsVisible:r?[...r.querySelectorAll('.delivery-cell-label')].some(e=>getComputedStyle(e).display!=='none'):null,
        overflow:rows.some(e=>e.scrollWidth>e.clientWidth), nameFits:r?fits(r.querySelector('.delivery-project p')):true,
        links:[...p.querySelectorAll('a[href^="/projects/"]')].map(e=>({href:e.getAttribute('href'),width:e.getBoundingClientRect().width,rowWidth:e.parentElement.clientWidth})),
        progress:r?[r.querySelector('.delivery-progress').textContent,r.querySelector('.bg-primary').style.width]:null};
    })()`);
    assert(result.scrollWidth <= result.pageWidth, 'Page overflow');
    assert(!result.overflow && result.nameFits, 'Long project name must fit without truncation');
    assert(result.links.some(l => l.href === `/projects/${fixture.pid}`), 'Project link retained');
    assert(result.links.every(l => l.width < 110 && l.width < l.rowWidth), 'Open remains a compact button');
    if (role !== 'SALES') {
      const desktop = result.panelWidth >= 960;
      assert.equal(result.columns, desktop ? 6 : 2);
      assert.equal(result.headerVisible, desktop); assert.equal(result.labelsVisible, !desktop);
      if (desktop) assert(result.headerAligned, 'Header and row columns align');
      assert(result.progress[0].includes('50%') && result.progress[1] === '50%', 'Existing progress and bar retained');
      assert(result.progress[0].includes(lang === 'en' ? '1 of 2 stages' : '1 dari 2 tahap'), 'Existing stage count retained');
      if (desktop) assert(result.rowHeights.every(h => h < 150), 'Desktop rows should be compact');
    }
    checks.push({ role, language: lang, viewport: width, sidebar, ...result, passed: true });
    console.log(JSON.stringify(checks.at(-1)));
  }
  async function screenshot(name) {
    const clip = await cdp.evaluate(`(() => {const r=${panel}.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()`);
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
    await fs.writeFile(path.join(output, name + '.png'), Buffer.from(image.data, 'base64'));
  }
  try {
    for (const role of ['HEAD_SA', 'SA', 'SUPER_ADMIN', 'SALES']) {
      fixture.state.role = role; fixture.state.locale = 'en';
      await cdp.viewport(1440); await cdp.navigate(origin + '/login');
      await cdp.wait("document.querySelector('#email')", 'login');
      await cdp.evaluate(`(() => {for(const [s,v] of [['#email',${JSON.stringify(role.toLowerCase() + '@fixture.invalid')}],['#password','SyntheticOnly!123']]){const e=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
      await cdp.click("document.querySelector('form button[type=submit]')");
      await cdp.wait(`${panel}?.querySelector('a[href="/projects/${fixture.pid}"]')`, 'delivery data');
      for (const lang of ['en', 'id']) {
        await locale(lang); await cdp.viewport(1440);
        const sidebarButton = "[...document.querySelectorAll('button[title]')].find(e=>/sidebar|samping/i.test(e.getAttribute('title')) && e.getClientRects().length)";
        await inspect(role, lang, 1440, 'open');
        if (role === 'HEAD_SA' && lang === 'en') await screenshot('head-sa-en-1440-open');
        await cdp.click(sidebarButton);
        await inspect(role, lang, 1440, 'closed');
        if (role === 'HEAD_SA' && lang === 'en') await screenshot('head-sa-en-1440-closed');
        await cdp.click(sidebarButton);
        for (const width of [768, 390, 360]) {
          await cdp.viewport(width); await inspect(role, lang, width, 'mobile drawer closed');
          if (role === 'HEAD_SA' && lang === 'id') await screenshot(`head-sa-id-${width}`);
        }
      }
      await cdp.viewport(1440);
      await cdp.click("document.querySelector('button[aria-label=\"Sign out\"],button[aria-label=\"Log out\"],button[aria-label=\"Logout\"],button[aria-label=\"Keluar\"]')");
      await cdp.wait("document.querySelector('#email')", 'logout');
    }
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ browser: runtime.browser, checks,
      unknownRequests: fixture.state.unknown, runtimeErrors: traffic.errors, liveRequests: 0,
      limits: 'Actual app/AuthProvider in Chrome; synthetic API only. No live backend authorization, GoTrue or Storage integration tested.' }, null, 2) + '\n');
    await runtime.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
