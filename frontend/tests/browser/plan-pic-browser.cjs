'use strict';
// Actual app/AuthProvider/dialogs; all API traffic is synthetic and intercepted.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createFixture } = require('./fixtures.cjs');
const { launch } = require('./cdp.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Loopback app only');
const output = path.resolve('docs/plan-pic-browser-verification');

async function actualDetail(fixture) {
  // Use the real response mapper, not a fixture that silently invents PIC revision.
  Object.assign(process.env, { SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only', SUPABASE_ANON_KEY: 'synthetic-only', DEFAULT_REGISTER_ROLE: 'SA', TRUST_PROXY: 'false', TS_NODE_COMPILER_OPTIONS: '{"module":"CommonJS","moduleResolution":"Node"}' });
  require('../../../backend/node_modules/ts-node/register/transpile-only');
  const { supabaseAdmin } = require('../../../backend/src/config/supabase');
  const { ProjectManagementService } = require('../../../backend/src/services/project-management.service');
  const raw = fixture.respond(origin + '/api/projects/' + fixture.pid, 'GET').body.data;
  Object.assign(raw, { status: 'DRAFT', pic_id: null, pic: null, pic_revision: 1, pic_revision_exact: '1' });
  raw.phases[0].status = 'DRAFT';
  const original = supabaseAdmin.from, originalFetch = global.fetch;
  global.fetch = async () => { throw Error('Unexpected backend fixture network'); };
  supabaseAdmin.from = table => {
    assert.equal(table, 'projects');
    const query = { select: () => query, eq: () => query, single: async () => ({ data: raw, error: null }) };
    return query;
  };
  try { return await ProjectManagementService.get(fixture.pid, { userId: fixture.user('HEAD_SA').id, role: 'HEAD_SA' }, { includeActivity: false }); }
  finally { supabaseAdmin.from = original; global.fetch = originalFetch; }
}

async function main() {
  const fixture = createFixture(), baseRespond = fixture.respond;
  fixture.state.role = 'HEAD_SA';
  const detail = await actualDetail(fixture), approvalId = '90000000-0000-4000-8000-000000000040';
  const mutations = [], results = [];
  let missing = false, committed = false, fail = true;
  fixture.respond = (url, method, body) => {
    const route = new URL(url).pathname.replace(/^\/api/, '');
    if (method === 'POST' && route === `/projects/${fixture.pid}/plan/approve`) {
      const data = JSON.parse(body); mutations.push(data);
      if (fail) return { status: 503, delay: 350, body: { success: false, message: 'Synthetic uncertainty', errors: { code: 'PIC_UNAVAILABLE' } } };
      committed = true;
      return { status: 200, body: { success: true, data: { id: approvalId, status: 'APPROVED', project_status: 'ACTIVE', pic_revision: '2', current_pic_id: data.pic_id, replayed: mutations.length > 1 } } };
    }
    const response = baseRespond(url, method, body);
    if (method !== 'GET') return response;
    if (route === `/projects/${fixture.pid}`) {
      response.body.data = structuredClone(detail);
      if (missing) delete response.body.data.pic_revision;
      if (committed) Object.assign(response.body.data, { status: 'ACTIVE', pic_revision: '2', pic: fixture.user('SA') });
    }
    if (route === `/projects/${fixture.pid}/plan-approval`) Object.assign(response.body.data, { status: committed ? 'APPROVED' : 'PENDING', reviewed_at: committed ? '2026-10-09T00:00:00Z' : null, reviewed_by: committed ? fixture.user('HEAD_SA') : null });
    if (route === `/projects/${fixture.pid}/milestones`) response.body.data.forEach(m => Object.assign(m, { status: committed ? 'IN_PROGRESS' : 'CREATED', pic_id: committed ? fixture.user('SA').id : null }));
    if (route === `/projects/${fixture.pid}/output-documents`) response.body.data = { documents: [], summary: { total: 0, selected: 0, approved: 0 }, canUpload: false, canReview: false, canSelect: false };
    if (route === '/approvals/overview') response.body.data = { stats: { totalPending: 1, pendingDocs: 0, pendingProjectPlans: 1, pendingDeadlines: 0 }, items: [{ id: approvalId, category: 'PROJECT_PLAN', title: 'Synthetic phase plan', status: committed ? 'APPROVED' : 'PENDING', isCurrentApproval: true, projectId: fixture.pid, projectName: detail.name, clientName: detail.customer, phaseName: 'Pra-Tender', submittedAt: '2026-10-09T00:00:00Z', requestedAt: '2026-10-09T00:00:00Z' }] };
    return response;
  };
  await fs.mkdir(output, { recursive: true });
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  const headers = [];
  cdp.on('Fetch.requestPaused', event => {
    if (event.request.method === 'POST' && new URL(event.request.url).pathname.endsWith('/plan/approve')) {
      const h = Object.fromEntries(Object.entries(event.request.headers).map(([k,v]) => [k.toLowerCase(), v]));
      headers.push({ json: h['content-type'] === 'application/json', syntheticAuthorization: String(h.authorization).startsWith('Bearer fixture-only-') });
    }
  });
  const button = text => `[...document.querySelectorAll('form button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
  async function review() {
    await cdp.navigate(origin + `/projects/${fixture.pid}`);
    await cdp.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Approve & activate')", 'pending plan action');
    await cdp.click("[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Approve & activate')");
    await cdp.wait("document.querySelector('#project-plan-pic option[value]:not([value=\"\"])')", 'PIC options');
    await cdp.evaluate(`(() => {const e=document.querySelector('#project-plan-pic');e.value=${JSON.stringify(fixture.user('SA').id)};e.dispatchEvent(new Event('change',{bubbles:true}));const n=document.querySelector('#project-plan-review-note');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(n,'Synthetic retained note');n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await cdp.click(button('Review decision'));
  }
  try {
    await cdp.viewport(1440, 1000);
    await cdp.navigate(origin + '/login'); await cdp.wait("document.querySelector('#email')", 'login');
    await cdp.evaluate(`(() => {for(const [s,v] of [['#email','head_sa@fixture.invalid'],['#password','SyntheticOnly!123']]){const e=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await cdp.click("document.querySelector('form button[type=submit]')");
    await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'actual AuthProvider synthetic session');
    await review();
      assert.equal(detail.pic_revision, '1');
      await cdp.wait(`Boolean(${button('Yes, approve')})`, 'confirmation opens');
      assert.equal(mutations.length, 0);
      await cdp.screenshot(path.join(output, 'after-confirmation.png'));
      await cdp.click(button('Cancel')); assert.equal(mutations.length, 0);
      results.push({ check: 'Review decision opens confirmation; Cancel sends no mutation', passed: true });
      await review();
      await cdp.evaluate("document.querySelector('#project-plan-review-note').closest('form').requestSubmit();document.querySelector('#project-plan-review-note').closest('form').requestSubmit()");
      await cdp.wait("document.querySelector('#project-plan-review-error')?.textContent.includes('could not be confirmed')", 'uncertain mutation result');
      assert.equal(mutations.length, 1); assert.equal(mutations[0].expected_pic_revision, '1'); assert.equal(mutations[0].expected_approval_id, approvalId);
      assert.equal(mutations[0].pic_id, fixture.user('SA').id); assert.equal(mutations[0].note, 'Synthetic retained note');
      assert.match(mutations[0].request_id, /^[0-9a-f-]{36}$/i); assert(headers.every(h=>h.json && h.syntheticAuthorization));
      assert.equal(await cdp.evaluate("document.querySelector('#project-plan-review-note').value"), 'Synthetic retained note');
      await cdp.evaluate("(()=>{const e=document.querySelector('select');e.value='id';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
      await cdp.wait("document.documentElement.lang==='id'", 'retained dialog Indonesian');
      assert.equal(await cdp.evaluate("document.querySelector('#project-plan-review-note').value"), 'Synthetic retained note');
      await cdp.screenshot(path.join(output, 'retry-indonesian.png'));
      await cdp.evaluate("(()=>{const e=document.querySelector('select');e.value='en';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
      await cdp.wait("document.documentElement.lang==='en'", 'retained dialog English');
      fail = false; await cdp.click(button('Yes, approve'));
      await cdp.wait("!document.querySelector('#project-plan-review-note')", 'same-request retry succeeds');
      assert.equal(mutations.length, 2); assert.deepEqual(mutations[0], mutations[1]);
      results.push({ check: 'Double confirmation sends one valid request; uncertain retry preserves body/CAS/request ID and input', passed: true });
      committed = false; missing = true; await review();
      await cdp.wait("document.querySelector('#project-plan-review-error')?.textContent.includes('No decision was sent')", 'pre-fetch incomplete data distinguished');
      assert.equal(mutations.length, 2);
      await cdp.screenshot(path.join(output, 'after-local-error.png'));
      missing = false; await cdp.click(button('Reload and review'));
      await cdp.wait("!document.querySelector('#project-plan-review-error')", 'reload preserves inputs');
      assert.equal(await cdp.evaluate("document.querySelector('#project-plan-review-note').value"), 'Synthetic retained note');
      await cdp.click(button('Review decision')); await cdp.wait(`Boolean(${button('Yes, approve')})`, 'review after reload');
      assert.equal(mutations.length, 2); await cdp.click(button('Cancel'));
      results.push({ check: 'Missing revision blocks before fetch with local error; reload keeps selection/note and restores confirmation', passed: true });
      committed = false; missing = false; fail = true;
      await cdp.navigate(origin + '/approvals');
      await cdp.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Approve')", 'Approvals plan row');
      await cdp.click("[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Approve')");
      await cdp.wait("document.querySelector('form select option[value]:not([value=\"\"])')", 'queue PIC options');
      await cdp.evaluate(`(() => {const e=document.querySelector('form select');e.value=${JSON.stringify(fixture.user('SA').id)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await cdp.click(button('Review decision')); await cdp.wait(`Boolean(${button('Yes, approve')})`, 'queue confirmation');
      assert.equal(mutations.length, 2); await cdp.screenshot(path.join(output, 'approvals-confirmation.png'));
      await cdp.click(button('Cancel')); assert.equal(mutations.length, 2);
      results.push({ check: 'Approvals actual dialog opens plan/PIC confirmation and Cancel sends no request', passed: true });
      missing = true; await cdp.navigate(origin + '/approvals');
      await cdp.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Approve')", 'queue missing revision');
      await cdp.click("[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Approve')");
      await cdp.wait("document.querySelector('form select option[value]:not([value=\"\"])')", 'queue missing PIC');
      await cdp.evaluate(`(()=>{const e=document.querySelector('form select');e.value=${JSON.stringify(fixture.user('SA').id)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await cdp.click(button('Review decision'));
      await cdp.wait("document.querySelector('#approval-action-error')?.textContent.includes('No decision was sent')", 'queue local error');
      assert.equal(mutations.length, 2); missing = false;
      await cdp.click(button('Reload and review'));
      await cdp.wait("!document.querySelector('#approval-action-error')", 'queue recovery');
      await cdp.click(button('Review decision')); await cdp.wait(`Boolean(${button('Yes, approve')})`, 'queue review after reload');
      assert.equal(mutations.length, 2);
      results.push({ check: 'Approvals missing-revision error and reload preserve PIC, distinguish pre-fetch failure and send no mutation', passed: true });
      fail = true; await cdp.click(button('Yes, approve'));
      await cdp.wait("document.querySelector('#approval-action-error')?.textContent.includes('could not be confirmed')", 'queue uncertain response');
      assert.equal(mutations.length, 3); assert.equal(mutations[2].expected_pic_revision, '1');
      assert.equal(mutations[2].expected_approval_id, approvalId); assert.equal(mutations[2].pic_id, fixture.user('SA').id);
      fail = false; await cdp.click(button('Yes, approve'));
      await cdp.wait("!document.querySelector('form select')", 'queue retry succeeds');
      assert.equal(mutations.length, 4); assert.deepEqual(mutations[2], mutations[3]);
      assert(headers.every(h=>h.json && h.syntheticAuthorization));
      results.push({ check: 'Approvals confirmation uses actual API client with valid headers/payload and identical request ID on uncertain retry', passed: true });
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
    console.log('PASS Chrome plan/PIC confirmation, cancel, one request, retained retry and pre-fetch recovery');
  } finally {
    await fs.writeFile(path.join(output, 'after-results.json'), JSON.stringify({ browser: runtime.browser, results, errors: traffic.errors.map(()=> 'Unexpected browser exception'), unknown: fixture.state.unknown, mutationCount: mutations.length }, null, 2)+'\n');
    await runtime.cleanup();
  }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
