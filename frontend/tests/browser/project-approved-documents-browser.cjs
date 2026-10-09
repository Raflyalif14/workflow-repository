'use strict';
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createFixture } = require('./fixtures.cjs');
const { launch } = require('./cdp.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Loopback app only');
const dir = path.resolve('docs/project-approved-documents-verification');

async function main() {
  const fixture = createFixture(), respond = fixture.respond;
  fixture.state.role = 'HEAD_SA';
  const current = structuredClone(respond(origin + `/api/projects/${fixture.pid}/output-documents`, 'GET').body.data.documents[0]);
  const files = [{ ...current.files[0], fileName: 'approved-proposal.pdf' },
    { ...current.files[0], id: '90000000-0000-4000-8000-000000000099', fileName: 'approved-architecture.pdf' }];
  let status = 'IN_REVIEW', reviews = 0, conflict = false;
  fixture.respond = (url, method, body) => {
    const route = new URL(url).pathname.replace(/^\/api/, '');
    if (method === 'POST' && route === `/projects/${fixture.pid}/output-documents/review`) {
      const data = JSON.parse(body); assert.equal(data.decision, 'APPROVE'); assert.equal(data.items.length, 1);
      assert.equal(data.items[0].expected_version_id, current.currentVersionId); assert.match(data.items[0].request_id, /^[0-9a-f-]{36}$/i);
      reviews++; status = 'APPROVED';
      return { status: 200, body: { success: true, data: { success: true, results: [{ documentKey: current.key, success: true, status }] } } };
    }
    const result = respond(url, method, body);
    if (method !== 'GET') return result;
    if (route === '/documents') result.body.data = [];
    if (route === `/projects/${fixture.pid}/output-documents`) result.body.data.documents = [{ ...current, status, files,
      currentVersionId: conflict ? '90000000-0000-4000-8000-000000000088' : current.currentVersionId,
      reviewFeedback: null, draftFiles: [], fileRevisions: [], draftRevision: 1 }];
    if (route === `/projects/${fixture.pid}/milestones` && status === 'APPROVED') result.body.data.forEach(m => m.status = 'COMPLETED');
    if (route === '/documents/outputs') result.body.data = status === 'APPROVED' ? [{
      outputId: current.id, projectId: fixture.pid, milestoneId: fixture.mid, projectName: 'Synthetic project', customer: '',
      documentKey: current.key, name: current.name, group: current.group, status, fileName: files[0].fileName,
      files, versionNumber: 1, approvedVersionId: current.currentVersionId, updatedAt: '2026-10-09T00:00:00Z',
    }] : [];
    return result;
  };
  await fs.mkdir(dir, { recursive: true });
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime, checks = [];
  const deepLink = origin + `/projects/${fixture.pid}#project-milestone-${fixture.mid}?output=${current.id}&snapshot=${current.currentVersionId}`;
  const official = "[...document.querySelectorAll('h3')].find(e=>e.textContent==='Official Documents')?.closest('.surface-shell')";
  try {
    await cdp.viewport(1440, 1000); await cdp.navigate(origin + '/login'); await cdp.wait("document.querySelector('#email')", 'login');
    await cdp.evaluate(`(() => {for(const [s,v] of [['#email','head_sa@fixture.invalid'],['#password','SyntheticOnly!123']]){const e=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await cdp.click("document.querySelector('form button[type=submit]')"); await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'synthetic Head SA session');
    await cdp.navigate(deepLink);
    await cdp.wait(`document.getElementById('project-output-${current.id}')`, 'actual output workspace');
    await cdp.wait(`${official}?.textContent.includes('No project documents yet.')`, 'empty official source before approval');
    await cdp.click(`([...document.getElementById('project-output-${current.id}').querySelectorAll('button')].find(e=>e.textContent.trim()==='Approve'))`);
    await cdp.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Yes, approve')", 'existing confirmation');
    await cdp.click("[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Yes, approve')");
    await cdp.wait(`${official}?.textContent.includes('approved-architecture.pdf')`, 'approved repository snapshot appears');
    assert.equal(reviews, 1); assert.equal(await cdp.evaluate("location.hash.includes('snapshot=')"), false);
    await cdp.wait("!document.body.textContent.includes('This submission is no longer awaiting review')", 'own success has no stale warning');
    assert.equal(await cdp.evaluate(`${official}.querySelectorAll('button').length`), 2);
    await cdp.evaluate(`${official}.scrollIntoView({block:'center'})`); await cdp.screenshot(path.join(dir, 'approved-panel-en-1440.png'));
    checks.push({ check: 'Actual approval confirmation sends one synthetic request; repository panel shows both approved snapshot files; own success clears only its review target', passed: true });
    await cdp.navigate(origin + `/projects/${fixture.pid}`); await cdp.send('Page.reload', { ignoreCache: true });
    await cdp.wait(`${official}?.textContent.includes('approved-architecture.pdf')`, 'approved files remain after reload');
    checks.push({ check: 'Approved files remain after refresh despite empty official/legacy source', passed: true });
    await cdp.navigate(deepLink); await cdp.wait("document.body.textContent.includes('This submission is no longer awaiting review')", 'old link still warns');
    checks.push({ check: 'Reopening an old already-decided deep link still warns', passed: true });
    status = 'IN_REVIEW'; conflict = true; await cdp.navigate(deepLink); await cdp.send('Page.reload', { ignoreCache: true });
    await cdp.wait("document.body.textContent.includes('This submission is no longer awaiting review')", 'changed snapshot warns');
    await cdp.wait(`${official}?.textContent.includes('No project documents yet.')`, 'new non-approved snapshot excluded');
    assert.equal(reviews, 1);
    checks.push({ check: 'Later submission/changed snapshot remains stale and is excluded from approved repository; no extra review is sent', passed: true });
    assert.equal(fixture.state.unknown.length, 0); assert.equal(traffic.errors.length, 0);
    const report = { browser: runtime.browser, role: 'HEAD_SA', viewport: 1440, language: 'en', checks, syntheticReviews: reviews,
      unknownRequests: fixture.state.unknown, runtimeErrors: traffic.errors, liveRequests: 0,
      limits: 'Actual app in Chrome with fixture API. No live review, database/Storage or real permission integration verified.' };
    await fs.writeFile(path.join(dir, 'results.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
  } finally { await runtime.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
