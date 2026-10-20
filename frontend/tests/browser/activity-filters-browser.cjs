'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launch } = require('./cdp.cjs');
const { createFixture } = require('./fixtures.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3036';
if (!['localhost','127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Loopback only');
const output = path.resolve(__dirname,'../../../.cache/activity-filters-2026-10-20');
const panel = `document.querySelector('section[aria-labelledby="recent-activity-heading"]')`;
const filter = `${panel}.querySelector('form[aria-label]')`;
const list = `document.querySelector('#dashboard-recent-activity-list')`;
async function check(width, locale) {
  const fixture = createFixture(); Object.assign(fixture.state,{locale,activityCount:33,activityMixed:true});
  const requests=[], respond=fixture.respond;
  fixture.respond=(url,method,body)=>{if(new URL(url).pathname.endsWith('/dashboard/activity')&&method==='GET')requests.push(new URL(url));return respond(url,method,body);};
  const runtime=await launch(fixture,origin), {cdp,traffic}=runtime;
  const summary=(page,total)=>locale==='en'?`Page ${page} of ${total}`:`Halaman ${page} dari ${total}`;
  const ready=async(total,page=1,pages=2)=>cdp.wait(`${panel}.querySelector('nav')?.textContent.includes(${JSON.stringify(summary(page,pages))}) && ${list} && !${filter}.querySelector('button[type=submit]').disabled && ${panel}.textContent.includes(${JSON.stringify(locale==='en'?`${total} activities found`:`${total} aktivitas ditemukan`)})`,'filtered result');
  async function select(id,value){await cdp.evaluate(`(()=>{const e=document.querySelector('#${id}');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
  async function date(id,value){await cdp.evaluate(`(()=>{const e=document.querySelector('#${id}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
  async function screenshot(name){const clip=await cdp.evaluate(`(()=>{const r=${panel}.getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:Math.min(1000,r.height),scale:1}})()`);const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});await fs.writeFile(path.join(output,`${name}-${locale}-${width}.png`),Buffer.from(shot.data,'base64'));}
  try {
    await cdp.viewport(width);await cdp.navigate(origin+'/login');await cdp.wait("document.querySelector('#email')",'login');
    await cdp.evaluate(`(()=>{for(const [s,v] of [['#email','head_sa@fixture.invalid'],['#password','SyntheticOnly!123']]){const e=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await cdp.click("document.querySelector('form button[type=submit]')");await cdp.wait(`${list}?.children.length===8`,'overview');
    assert.equal(requests.length,0,'No duplicate unfiltered page 1 fetch');
    assert.equal(await cdp.evaluate("document.querySelector('#activity-project').options.length"),5);
    await select('activity-project',fixture.pid);await select('activity-kind','DOCUMENT');await select('activity-period','custom');
    await date('activity-from','2026-10-08');await date('activity-to','2026-10-08');
    assert.equal(requests.length,0,'Draft changes wait for Apply');
    fixture.state.activityDelay=600;await cdp.click(`${filter}.querySelector('button[type=submit]')`);
    await cdp.wait(`${panel}.querySelector('[role=status]')`,'loading');assert(await cdp.evaluate(`${filter}.querySelector('button[type=submit]').disabled`));
    await ready(9);assert.equal(requests.at(-1).searchParams.get('projectId'),fixture.pid);assert.equal(requests.at(-1).searchParams.get('kind'),'DOCUMENT');
    assert(requests.at(-1).searchParams.get('from')&&requests.at(-1).searchParams.get('to'));
    await screenshot('filtered');
    await cdp.click(`${panel}.querySelectorAll('nav button[type=button]')[1]`);await ready(9,2);assert.equal(await cdp.evaluate(`${list}.children.length`),1);
    assert.equal(requests.at(-1).searchParams.get('kind'),'DOCUMENT');
    await cdp.click(`${filter}.querySelector('button[type=button]')`);await ready(33,1,5);
    assert.equal(await cdp.evaluate("document.querySelector('#activity-period').value"),'all');
    // A future date excludes every synthetic row; zero is different from a request error.
    await select('activity-period','custom');await date('activity-from','2026-10-09');await date('activity-to','2026-10-09');
    await cdp.click(`${filter}.querySelector('button[type=submit]')`);
    await cdp.wait(`${panel}.textContent.includes(${JSON.stringify(locale==='en'?'No matching activity':'Tidak ada aktivitas yang cocok')})`,'no matches');
    assert(!await cdp.evaluate(`Boolean(${panel}.querySelector('[role=alert]'))`));await screenshot('empty');
    await cdp.click(`${filter}.querySelector('button[type=button]')`);await ready(33,1,5);
    fixture.state.activityFailure=true;await select('activity-kind','ASSIGNMENT');await cdp.click(`${filter}.querySelector('button[type=submit]')`);
    await cdp.wait(`${panel}.querySelector('[role=alert]')`,'request failure');fixture.state.activityFailure=false;
    await cdp.click(`${panel}.querySelector('[role=alert] button')`);await cdp.wait(`${panel}.textContent.includes(${JSON.stringify(locale==='en'?'No matching activity':'Tidak ada aktivitas yang cocok')})`,'retry');
    fixture.state.account=2;
    await cdp.evaluate(`(()=>{const key='workflow.session',oldValue=localStorage.getItem(key),newValue=JSON.stringify({id:crypto.randomUUID(),accessToken:'fixture-only-HEAD_SA-2',refreshToken:'fixture-only-refresh'});localStorage.setItem(key,newValue);window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue,storageArea:localStorage}));})()`);
    await cdp.wait(`${list}?.textContent.includes('activity 01 - account 2')`,'account reset');
    assert.equal(await cdp.evaluate("document.querySelector('#activity-kind').value"),'');
    const dimensions=await cdp.evaluate(`({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})`);assert(dimensions.scroll<=dimensions.client);
    assert.deepEqual(traffic.errors,[]);assert.deepEqual(fixture.state.unknown,[]);
    return {width,locale,combinedFilters:true,exactCount:9,pages:2,applyReset:true,empty:true,errorRetry:true,accountReset:true,...dimensions};
  } catch(error){await cdp.screenshot(path.join(output,`failure-${locale}-${width}.png`));throw error;}
  finally{await runtime.cleanup();}
}
(async()=>{await fs.mkdir(output,{recursive:true});const results=[],preview=process.argv.includes('--mobile-preview');for(const width of preview?[360]:[360,390,1440])for(const locale of preview?['id']:['en','id']){const result=await check(width,locale);results.push(result);console.log(JSON.stringify(result));}await fs.writeFile(path.join(output,preview?'visual-results.json':'results.json'),JSON.stringify({fixture:'Synthetic accounts/API; production frontend. Actual backend filters tested separately.',results},null,2));})().catch(error=>{console.error(error.stack);process.exitCode=1;});
