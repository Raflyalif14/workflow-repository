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
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback only');
const output = path.resolve(__dirname, '../../../.cache/project-form-draft/typing');
const diagnose = process.env.WORKFLOW_DIAGNOSE_DRAFT_TYPING === '1';

async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = createFixture(), checks = [];
  const originalRespond = fixture.respond;
  fixture.respond = (url, method, body) => {
    const response = originalRespond(url, method, body);
    if (method === 'GET' && new URL(url).pathname.replace(/^\/api/, '') === '/scenarios') response.body.data.forEach(item => { item.is_active = true; });
    return response;
  };
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  const fill = (selector, value) => cdp.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  try {
    await cdp.viewport(1440); await cdp.navigate(origin + '/login'); await cdp.wait("document.querySelector('#email')", 'login');
    await fill('#email', 'sales@fixture.invalid'); await fill('#password', 'SyntheticOnly!123');
    await cdp.click("document.querySelector('form button[type=submit]')"); await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'login complete');
    await cdp.navigate(origin + '/projects/new'); await cdp.wait("document.querySelector('main fieldset')&&!document.querySelector('main fieldset').disabled", 'draft ready');
    await fill('#project-name', 'Typing test');
    await cdp.wait(`document.querySelector('[data-project-draft] [role=status]')?.textContent===${JSON.stringify(en.formDraft.saved)}`, 'initial save');
    // Make an actual completed write take longer to acknowledge so every saving frame is observable.
    await cdp.evaluate(`(()=>{const original=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');window.__draftCompleteDescriptor=original;Object.defineProperty(IDBTransaction.prototype,'oncomplete',{configurable:true,get:original.get,set(listener){original.set.call(this,listener?function(event){if(this.mode==='readwrite')setTimeout(()=>listener.call(this,event),120);else listener.call(this,event);}:listener);}});})()`);
    for (const locale of ['en', 'id']) {
      const d = locale === 'en' ? en : id;
      const selector = "[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='en')&&[...e.options].some(o=>o.value==='id'))";
      await cdp.wait(`(${selector})&&!(${selector}).disabled`, 'language selector');
      await cdp.evaluate(`(()=>{const e=(${selector});e.value=${JSON.stringify(locale)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await cdp.wait(`document.documentElement.lang===${JSON.stringify(locale)}`, 'locale');
      for (const width of [1440, 360]) {
        await cdp.viewport(width); await cdp.evaluate('document.fonts.ready.then(()=>true)');
        await cdp.evaluate(`(()=>{const input=document.querySelector('#project-name');input.scrollIntoView({block:'center',behavior:'instant'});input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);window.__draftFrames=[];window.__recordDraftFrames=true;const sample=()=>{const banner=document.querySelector('[data-project-draft]'),box=input.getBoundingClientRect();window.__draftFrames.push({height:banner.getBoundingClientRect().height,documentTop:box.top+scrollY,viewportTop:box.top,scrollY,status:banner.querySelector('[role=status]')?.textContent});if(window.__recordDraftFrames)requestAnimationFrame(sample);};sample();})()`);
        for (const character of 'abcdefghij') { await cdp.send('Input.insertText', { text: character }); await pause(30); }
        await cdp.wait(`document.querySelector('[data-project-draft] [role=status]')?.textContent===${JSON.stringify(d.formDraft.saved)}`, 'latest write acknowledged');
        await pause(100);
        const frames = await cdp.evaluate('window.__recordDraftFrames=false;window.__draftFrames');
        const range = key => Math.max(...frames.map(frame => frame[key])) - Math.min(...frames.map(frame => frame[key]));
        const result = { locale, width, frames: frames.length, bannerMovement: range('height'), inputMovement: range('documentTop'), viewportMovement: range('viewportTop'), statuses: [...new Set(frames.map(frame => frame.status))] };
        checks.push(result);
        assert(result.statuses.includes(d.formDraft.saving) && result.statuses.includes(d.formDraft.saved), 'Measure both saving and saved frames');
        assert.equal(await cdp.evaluate("document.querySelector('#project-name').value"), 'Typing testabcdefghij');
        assert(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
        const persisted = await cdp.evaluate(`new Promise(resolve=>{const request=indexedDB.open('workflow-form-drafts',1);request.onsuccess=()=>{const db=request.result,q=db.transaction('project-create').objectStore('project-create').get(${JSON.stringify(fixture.user('SALES').id)});q.onsuccess=()=>{resolve(q.result.values.name);db.close();};};})`);
        assert.equal(persisted, 'Typing testabcdefghij', 'Latest typed characters are durable');
        if (!diagnose) assert(result.bannerMovement <= 0.5 && result.inputMovement <= 0.5 && result.viewportMovement <= 0.5, `Typing must not shift layout: ${JSON.stringify(result)}`);
        await fill('#project-name', 'Typing test');
        await cdp.wait(`document.querySelector('[data-project-draft] [role=status]')?.textContent===${JSON.stringify(d.formDraft.saved)}`, 'reset saved');
      }
    }
    assert.deepEqual(traffic.errors, []); assert.deepEqual(fixture.state.unknown, []);
    console.log(JSON.stringify(checks, null, 2));
  } finally {
    await fs.writeFile(path.join(output, diagnose ? 'before.json' : 'after.json'), JSON.stringify({ checks, errors: traffic.errors }, null, 2));
    await runtime.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
