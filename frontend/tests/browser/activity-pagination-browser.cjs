'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launch } = require('./cdp.cjs');
const { createFixture } = require('./fixtures.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3036';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Loopback app only');
const output = path.resolve(__dirname, '../../../.cache/activity-pagination-2026-10-20');
const panel = `document.querySelector('section[aria-labelledby="recent-activity-heading"]')`;
const nav = `${panel}.querySelector('nav')`;
const buttons = `${nav}.querySelectorAll('button[type=button]')`;
const input = `document.querySelector('#recent-activity-page')`;
async function check(width, locale) {
  const fixture = createFixture(); fixture.state.locale = locale;
  const pages = [], respond = fixture.respond;
  fixture.respond = (url, method, body) => {
    const request = new URL(url);
    if (request.pathname.endsWith('/dashboard/activity') && method === 'GET') pages.push(Number(request.searchParams.get('page')));
    return respond(url, method, body);
  };
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  const summary = page => locale === 'en' ? `Page ${page} of 3` : `Halaman ${page} dari 3`;
  const ready = n => cdp.wait(`document.querySelector('#dashboard-recent-activity-list')?.textContent.includes('activity ${String(n).padStart(2,'0')}')`, `activity ${n}`);
  async function fill(value) {
    await cdp.evaluate(`(() => {const e=${input};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.focus();})()`);
  }
  const go = async page => { await fill(String(page)); await cdp.key('Enter','Enter',13); };
  try {
    await cdp.viewport(width);
    await cdp.navigate(origin+'/login'); await cdp.wait("document.querySelector('#email')",'login form');
    await cdp.evaluate(`(() => {for(const [s,v] of [['#email','head_sa@fixture.invalid'],['#password','SyntheticOnly!123']]){const e=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await cdp.click("document.querySelector('form button[type=submit]')"); await ready(1);
    assert(await cdp.evaluate(`${nav}.textContent.includes(${JSON.stringify(summary(1))})`));
    assert(!traffic.api.some(r=>r.path.includes('/dashboard/activity')), 'First page reuses overview');
    for (const invalid of ['0','4','1.5','']) {
      await fill(invalid); assert(await cdp.evaluate(`${nav}.querySelector('button[type=submit]').disabled`));
    }
    fixture.state.activityDelay=700;
    await go(3);
    await cdp.wait(`${panel}.querySelector('[role=status]')`,'jump loading');
    assert(await cdp.evaluate(`${input}.disabled && [...${nav}.querySelectorAll('button')].every(b=>b.disabled)`));
    await ready(17);
    assert.equal(await cdp.evaluate("document.querySelector('#dashboard-recent-activity-list').children.length"),1);
    assert(await cdp.evaluate(`${nav}.textContent.includes(${JSON.stringify(summary(3))}) && ${buttons}[1].disabled`));
    assert.deepEqual(pages,[3], 'Jump skips intermediate page requests');
    await cdp.screenshot(path.join(output,`last-${locale}-${width}.png`));
    await cdp.click(`${buttons}[0]`); await ready(9);
    assert(await cdp.evaluate(`${nav}.textContent.includes(${JSON.stringify(summary(2))})`));
    await go(1); await ready(1); assert(await cdp.evaluate(`${buttons}[0].disabled`));
    // A distinct account key avoids previously cached pages during error/retry.
    fixture.state.account=2;
    await cdp.evaluate(`(() => {const key='workflow.session',oldValue=localStorage.getItem(key),newValue=JSON.stringify({id:crypto.randomUUID(),accessToken:'fixture-only-HEAD_SA-2',refreshToken:'fixture-only-refresh'});localStorage.setItem(key,newValue);window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue,storageArea:localStorage}));})()`);
    await cdp.wait("document.querySelector('#dashboard-recent-activity-list')?.textContent.includes('activity 01 - account 2')",'account reset');
    assert(await cdp.evaluate(`${nav}.textContent.includes(${JSON.stringify(summary(1))})`));
    fixture.state.activityFailure=true;
    await go(2); await cdp.wait(`${panel}.querySelector('[role=alert]')`,'page error');
    assert(!await cdp.evaluate("Boolean(document.querySelector('#dashboard-recent-activity-list'))"));
    fixture.state.activityFailure=false;
    await cdp.click(`${panel}.querySelector('[role=alert] button')`); await ready(9);
    const dimensions = await cdp.evaluate(`({width:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})`);
    assert(dimensions.scroll<=dimensions.client, 'No horizontal overflow');
    await cdp.screenshot(path.join(output,`page-two-${locale}-${width}.png`));
    assert.deepEqual(fixture.state.unknown,[]); assert.deepEqual(traffic.errors,[]);
    return {width,locale,totalPages:3,directJump:true,enterShortcut:true,bounds:true,pending:true,retry:true,accountReset:true,...dimensions};
  } catch (error) { await cdp.screenshot(path.join(output,`failure-${locale}-${width}.png`)); throw error; }
  finally { await runtime.cleanup(); }
}
(async()=>{
  await fs.mkdir(output,{recursive:true}); const results=[];
  for(const width of [360,1440]) for(const locale of ['en','id']) {const result=await check(width,locale);results.push(result);console.log(JSON.stringify(result));}
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({fixture:'Synthetic accounts and API; actual production frontend. Backend authorization verified separately.',results},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
