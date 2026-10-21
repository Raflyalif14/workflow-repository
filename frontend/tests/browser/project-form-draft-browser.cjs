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
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback fixtures only');
const output = path.resolve(__dirname, '../../../.cache/project-form-draft/browser');

async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = createFixture(), checks = [], posts = [];
  const baseRespond = fixture.respond;
  let creationFailure = true, postCount = 0;
  fixture.respond = (url, method, body) => {
    const p = new URL(url).pathname.replace(/^\/api/, '');
    if (p === '/projects' && method === 'POST') {
      postCount++;
      return creationFailure ? { status: 503, body: { success: false, message: 'Synthetic lost response', errors: { code: 'CREATE_RETRYABLE' } } }
        : { status: 200, body: { success: true, data: { id: fixture.pid } } };
    }
    const response = baseRespond(url, method, body);
    if (p === '/scenarios' && method === 'GET') response.body.data = response.body.data.map(item => ({ ...item, is_active: true }));
    return response;
  };
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  cdp.on('Network.requestWillBeSent', event => {
    if (event.request.method === 'POST' && new URL(event.request.url).pathname.replace(/^\/api/, '') === '/projects') {
      posts.push({ requestId: Object.entries(event.request.headers).find(([key]) => key.toLowerCase() === 'x-project-create-request-id')?.[1] });
    }
  });
  const button = label => `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)})`;
  const dialogButton = label => `[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()===${JSON.stringify(label)})`;
  const banner = text => `document.querySelector('[data-project-draft]')?.textContent.includes(${JSON.stringify(text)})`;
  const accountId = () => fixture.user('SALES').id;
  const read = async () => cdp.evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('workflow-form-drafts',1);r.onsuccess=()=>{const db=r.result;const q=db.transaction('project-create').objectStore('project-create').get(${JSON.stringify(accountId())});q.onsuccess=async()=>{const d=q.result;db.close();if(!d){resolve(null);return;}resolve({revision:d.revision,name:d.values.name,customer:d.values.customer,scenarioId:d.values.scenarioId,revenue:d.values.estimatedRevenue,optional:d.values.selectedOptionalKeys,submission:d.submission||null,mom:d.values.mom?{name:d.values.mom.name,type:d.values.mom.type,text:await d.values.mom.text(),lastModified:d.values.mom.lastModified}:null,photos:await Promise.all(d.values.photos.map(async f=>({name:f.name,text:await f.text()}))),documents:await Promise.all(d.values.documents.map(async f=>({name:f.name,text:await f.text()})))});};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);})`);
  const fill = async (selector, value) => cdp.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const language = async locale => {
    const selector = "[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='en')&&[...e.options].some(o=>o.value==='id'))";
    await cdp.wait(`(${selector})&&!(${selector}).disabled`, 'language selector');
    await cdp.evaluate(`(()=>{const e=(${selector});e.value=${JSON.stringify(locale)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await cdp.wait(`document.documentElement.lang===${JSON.stringify(locale)}`, 'language applied');
  };
  const login = async (role = 'SALES', account = 1) => {
    fixture.state.account = account; fixture.state.locale = 'en';
    await cdp.navigate(origin + '/login'); await cdp.wait("document.querySelector('#email')", 'login');
    await fill('#email', role.toLowerCase() + '@fixture.invalid'); await fill('#password', 'SyntheticOnly!123');
    await cdp.click("document.querySelector('form button[type=submit]')");
    await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'login complete');
  };
  const logout = async () => {
    const d = fixture.state.locale === 'id' ? id : en;
    await cdp.click(`document.querySelector('button[aria-label="${d.nav.logout}"]')`);
    await cdp.wait("document.querySelector('#email')", 'logout');
  };
  const openForm = async () => {
    await cdp.navigate(origin + '/projects/new');
    await cdp.wait("document.querySelector('main fieldset')&&!document.querySelector('main fieldset').disabled", 'draft ready');
  };
  const saved = async d => cdp.wait(`document.querySelector('[data-project-draft] [role=status]')?.textContent===${JSON.stringify(d.formDraft.saved)}`, 'durable draft saved');
  const selectFiles = async () => cdp.evaluate(`(()=>{
    for(const [selector,name,type,body] of [['#project-mom','draft-mom.pdf','application/pdf','%PDF-Synthetic MoM'],['#project-photos','draft-photo.png','image/png','Synthetic photo bytes'],['#project-documents','draft-notes.txt','text/plain','Synthetic notes']]){
      const files=new DataTransfer();files.items.add(new File([body],name,{type,lastModified:1234}));const input=document.querySelector(selector);input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    }
  })()`);
  const setup = async () => {
    await fill('#project-name', 'Draf Integrasi Pelabuhan'); await fill('#project-customer', 'Pelanggan Démo'); await fill('#project-estimated-revenue', '125000000');
    await cdp.evaluate("(()=>{const e=document.querySelector('#project-scenario');e.value=e.options[1].value;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await cdp.wait("document.querySelector('#doc-poc_demo')", 'optional checklist');
    await cdp.click("document.querySelector('#doc-poc_demo')"); await selectFiles();
    await saved(fixture.state.locale === 'id' ? id : en);
    await cdp.wait("document.querySelector('main')?.textContent.includes('draft-notes.txt')", 'selected attachments');
  };
  try {
    await cdp.viewport(1440); await login(); await openForm();
    assert.equal(await read(), null);
    await setup();
    const original = await read();
    assert.equal(original.name, 'Draf Integrasi Pelabuhan'); assert.equal(original.revenue, '125000000');
    assert.deepEqual(original.optional, ['poc_demo']); assert.equal(original.mom.text, '%PDF-Synthetic MoM');
    assert.equal(original.photos[0].text, 'Synthetic photo bytes'); assert.equal(original.documents[0].text, 'Synthetic notes');
    checks.push('Text, revenue, scenario, checklist and attachment bytes saved');
    await cdp.navigate('about:blank'); await openForm();
    await cdp.wait("document.querySelector('#project-name').value==='Draf Integrasi Pelabuhan'", 'hard navigation restore');
    assert(await cdp.evaluate("document.querySelector('main').textContent.includes('draft-photo.png')&&document.querySelector('main').textContent.includes('draft-mom.pdf')"));
    assert.deepEqual((await read()).mom, original.mom); checks.push('Closed document/reopened form restores File names, bytes and metadata');
    for (const locale of ['en', 'id']) {
      await language(locale); const d = locale === 'en' ? en : id;
      for (const width of [1440, 360]) {
        await cdp.viewport(width); assert(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
        assert(await cdp.evaluate(banner(d.formDraft.restored)));
        await cdp.evaluate("new Promise(resolve=>{scrollTo({top:0,behavior:'instant'});requestAnimationFrame(()=>requestAnimationFrame(resolve));})");
        await cdp.screenshot(path.join(output, `restored-${locale}-${width}.png`));
        checks.push(`${locale} ${width}px restored status and layout`);
      }
    }
    await logout(); await login('SALES', 2); await openForm();
    assert.equal(await cdp.evaluate("document.querySelector('#project-name').value"), ''); assert.equal(await read(), null);
    await fill('#project-name', 'Account two draft'); await saved(en); checks.push('Account two never receives account one inputs or files');
    await logout(); await login('SALES', 1); await openForm();
    assert.equal(await cdp.evaluate("document.querySelector('#project-name').value"), original.name); checks.push('Own draft survives logout/login');
    await language('id'); await cdp.click(button(id.formDraft.discard)); await cdp.click(button(id.common.cancel));
    assert.equal((await read()).name, original.name); checks.push('Cancel clear retains the draft');
    await cdp.click(button(id.formDraft.discard)); await cdp.click(button(id.formDraft.confirmDiscard));
    await cdp.wait("document.querySelector('#project-name').value===''", 'draft cleared');
    await pause(250); assert.equal(await read(), null); checks.push('Confirmed clear removes fields and attachments without autosave resurrection');
    await cdp.evaluate("window.__draftOriginalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Synthetic full storage','QuotaExceededError');}");
    await fill('#project-name', 'Storage retry'); await cdp.wait(banner(id.formDraft.error), 'quota feedback');
    assert.equal(await cdp.evaluate("document.querySelector('#project-name').value"), 'Storage retry'); assert.equal(await read(), null);
    await cdp.evaluate('IDBObjectStore.prototype.put=window.__draftOriginalPut'); await cdp.click(button(id.common.retry)); await saved(id);
    assert.equal((await read()).name, 'Storage retry'); checks.push('Quota failure stays visible and retry saves current inputs');
    await cdp.evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('workflow-form-drafts',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('project-create','readwrite'),s=t.objectStore('project-create'),q=s.get(${JSON.stringify(accountId())});q.onsuccess=()=>{const d=q.result;d.revision=crypto.randomUUID();d.values.name='Edited in another tab';s.put(d,${JSON.stringify(accountId())});};t.oncomplete=()=>{db.close();resolve(true);};t.onabort=()=>reject(t.error);};})`);
    await fill('#project-name', 'Keep my unsaved text'); await cdp.wait(banner(id.formDraft.conflict), 'conflict feedback');
    assert.equal((await read()).name, 'Edited in another tab'); assert.equal(await cdp.evaluate("document.querySelector('#project-name').value"), 'Keep my unsaved text');
    assert(await cdp.evaluate("document.querySelector('main form button[type=submit]').disabled"));
    await cdp.click(button(id.formDraft.reload)); await cdp.wait("document.querySelector('#project-name').value==='Edited in another tab'", 'latest draft loaded');
    checks.push('Concurrent revision rejects overwrite and explicitly reloads latest draft');
    await setup();
    await cdp.click("document.querySelector('main form button[type=submit]')"); await cdp.wait("document.querySelector('[role=dialog]')", 'create confirmation');
    await cdp.click(dialogButton(id.businessAudit.create)); await cdp.wait("document.querySelector('main fieldset').disabled", 'form frozen');
    await cdp.wait(`document.querySelector('[role=dialog]')?.textContent.includes(${JSON.stringify(id.createReceipt.retryable)})`, 'failed creation retains recovery');
    const pending = await read(); assert(pending.submission.requestId); assert.equal(postCount, 1);
    await cdp.navigate('about:blank'); await cdp.navigate(origin + '/projects/new');
    await cdp.wait(banner(id.formDraft.restoredPending), 'pending draft restored');
    assert(await cdp.evaluate("document.querySelector('main fieldset').disabled")); assert.equal(postCount, 1, 'Restore never auto-submits');
    assert.equal((await read()).submission.requestId, pending.submission.requestId);
    checks.push('Reload restores frozen payload and receipt without an automatic POST');
    await cdp.click("document.querySelector('main form button[type=submit]')"); await cdp.wait("document.querySelector('[role=dialog]')", 'retry confirmation');
    await cdp.evaluate("window.__draftVerifiedSession=localStorage.getItem('workflow.session');const changed=JSON.parse(window.__draftVerifiedSession);changed.id=crypto.randomUUID();localStorage.setItem('workflow.session',JSON.stringify(changed));");
    await cdp.click(dialogButton(id.createReceipt.retry));
    await cdp.wait(`document.querySelector('[role=dialog]')?.textContent.includes(${JSON.stringify(id.createReceipt.retryable)})`, 'changed session rejected');
    assert.equal(postCount, 1, 'A different session must not submit the old account draft');
    await cdp.evaluate("localStorage.setItem('workflow.session',window.__draftVerifiedSession)");
    checks.push('Changed auth session blocks submission of the old account draft');
    creationFailure = false;
    await cdp.click(dialogButton(id.createReceipt.retry)); await cdp.wait(`location.pathname==='/projects/${fixture.pid}'`, 'same project result');
    assert.equal(postCount, 2); assert.equal(posts.length, 2); assert.equal(posts[0].requestId, pending.submission.requestId); assert.equal(posts[1].requestId, pending.submission.requestId);
    assert.equal(await read(), null); checks.push('Retry reuses durable request ID and successful creation deletes draft');
    await openForm(); assert.equal(await cdp.evaluate("document.querySelector('#project-name').value"), '');
    await logout();
    for (const role of ['SA', 'HEAD_SA', 'SUPER_ADMIN']) {
      await login(role); await cdp.navigate(origin + '/projects/new'); await cdp.wait(`document.querySelector('main')?.textContent.includes(${JSON.stringify(en.copy.createForbidden)})`, 'Sales-only form');
      assert.equal(await cdp.evaluate("document.querySelectorAll('[data-project-draft]').length"), 0); await logout();
    }
    checks.push('Other roles cannot load the Sales draft form');
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
    assert.equal(traffic.api.filter(row => row.method === 'POST' && row.path === '/api/projects').length, 2);
    console.log(`${checks.length} draft browser scenarios passed: durable fields/files, reopen, EN/ID, mobile, account separation, clear, quota, conflict, frozen retry and success cleanup.`);
  } catch (error) { await cdp.screenshot(path.join(output, 'failure.png')).catch(() => {}); throw error;
  } finally { await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, posts, postCount, errors: traffic.errors, unknown: fixture.state.unknown }, null, 2)); await runtime.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
