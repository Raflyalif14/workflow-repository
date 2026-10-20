'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launch } = require('./cdp.cjs');
const { createFixture } = require('./fixtures.cjs');
require('../register.cjs');
const { en } = require('../../src/i18n/en');
const { id } = require('../../src/i18n/id');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3036';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback frontend only');
const output = path.resolve(__dirname, '../../../.cache/clean-code-approvals/browser');

async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = createFixture(), checks = [];
  let mode = 'ready';
  let outputTarget;
  const respond = fixture.respond;
  fixture.respond = (url, method, body) => {
    const route = new URL(url).pathname.replace(/^\/api/, '');
    if (method === 'GET' && route === '/face-login/capabilities')
      return { status: 200, body: { success: true, data: { enabled: false } } };
    const response = respond(url, method, body);
    if (route !== '/approvals/overview' || method !== 'GET' || response.status !== 200) return response;
    if (mode === 'error') return { status: 503, body: { success: false, message: 'Synthetic overview failure' } };
    const base = response.body.data.items[0];
    outputTarget = `/projects/${base.projectId}#project-milestone-${base.milestoneId}?output=${base.outputId}&snapshot=${base.snapshotId}`;
    const plan = { ...base, id: 'synthetic-plan', category: 'PROJECT_PLAN', title: 'Synthetic plan', requestedAt: '2026-10-01T00:00:00Z', requestNote: 'Synthetic planning note' };
    const deadline = { ...base, id: 'synthetic-deadline', category: 'DEADLINE', title: 'Synthetic deadline', requestedAt: '2026-10-02T00:00:00Z',
      currentDeadline: { start_date: '2026-10-01', duration_working_days: 3, due_date: '2026-10-05' },
      proposedDeadline: { start_date: '2026-10-01', duration_working_days: 5, due_date: '2026-10-07', change_reason: 'Synthetic schedule revision' } };
    const outputs = Array.from({ length: 21 }, (_, index) => ({ ...base, id: `output:synthetic-${index}`, title: `Synthetic output ${String(index).padStart(2, '0')}`,
      documentKey: `synthetic-output-${index}`, requestedAt: new Date(Date.UTC(2026, 9, 3, 0, 0, index)).toISOString() }));
    const history = ['APPROVED', 'REJECTED', 'SUPERSEDED'].map((status, index) => ({ ...plan, id: `history-${index}`, status,
      title: `Synthetic history ${status}`, isCurrentApproval: false, requestedAt: new Date(Date.UTC(2026, 9, 4 + index)).toISOString() }));
    const items = mode === 'empty' ? [] : [plan, deadline, ...outputs, ...history,
      { ...plan, id: 'retired-pending', title: 'Synthetic retired pending', isCurrentApproval: false }];
    response.body.data = { stats: { totalPending: mode === 'empty' ? 0 : 23, pendingProjectPlans: mode === 'empty' ? 0 : 1,
      pendingDeadlines: mode === 'empty' ? 0 : 1, pendingDocs: mode === 'empty' ? 0 : 21 }, items };
    return response;
  };
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  const button = (label, scope = 'main') => `[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(e => e.textContent.trim() === ${JSON.stringify(label)})`;
  const mainIncludes = text => `document.querySelector('main')?.textContent.includes(${JSON.stringify(text)})`;
  const rowCount = () => cdp.evaluate("document.querySelectorAll('main [role=link]').length");
  const dialog = 'div.relative.z-50.overflow-y-auto';
  const input = async (selector, value, tag = 'input') => {
    await cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(${tag === 'textarea' ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype, 'value').set.call(e, ${JSON.stringify(value)});
      e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  };
  const setLanguage = async locale => {
    const select = "[...document.querySelectorAll('select')].find(e => [...e.options].some(o => o.value === 'en') && [...e.options].some(o => o.value === 'id'))";
    await cdp.wait(`(${select}) && !(${select}).disabled`, 'language selector');
    await cdp.evaluate(`(() => { const e = (${select}); e.value = ${JSON.stringify(locale)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await cdp.wait(`document.documentElement.lang === ${JSON.stringify(locale)}`, 'locale applied');
  };
  const closeDialog = async label => {
    await cdp.click(button(label, dialog));
    await cdp.wait(`!document.querySelector(${JSON.stringify(dialog)})`, 'dialog closed');
  };
  try {
    for (const role of ['HEAD_SA', 'SUPER_ADMIN', 'SA', 'SALES']) {
      mode = 'ready'; fixture.state.locale = 'en';
      await cdp.navigate(origin + '/login'); await cdp.wait("document.querySelector('#email')", 'login form');
      await input('#email', role.toLowerCase() + '@fixture.invalid'); await input('#password', 'SyntheticOnly!123');
      await cdp.click("document.querySelector('form button[type=submit]')");
      await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'synthetic login');
      const authorized = ['HEAD_SA', 'SUPER_ADMIN'].includes(role);
      for (const locale of ['en', 'id']) {
        const d = locale === 'en' ? en : id;
        mode = 'ready';
        const start = traffic.api.length;
        await cdp.navigate(origin + '/approvals'); await setLanguage(locale);
        for (const width of [1440, 390]) {
          await cdp.viewport(width);
          if (authorized) {
            await cdp.navigate(origin + '/approvals');
            await cdp.wait(mainIncludes('Synthetic plan'), 'pending rows');
            assert.equal(await rowCount(), 20);
            assert.equal(await cdp.evaluate(mainIncludes('Synthetic retired pending')), false);
            assert.deepEqual(await cdp.evaluate("[...document.querySelector('main section[aria-label]').children].map(e => Number(e.querySelector('p').textContent))"), [23, 1, 1, 21]);
            await cdp.click(button(d.outputQueue.next)); assert.equal(await rowCount(), 3);
            await cdp.click(button(d.outputQueue.previous)); assert.equal(await rowCount(), 20);

            for (const [category, title] of [[d.approvalUi.projectPlans, 'Synthetic plan'], [d.approvalUi.deadlineChanges, 'Synthetic deadline']]) {
              await cdp.click(button(category)); assert.equal(await rowCount(), 1);
              assert(await cdp.evaluate(mainIncludes(title)));
              if (role === 'HEAD_SA') {
                await cdp.click(button(d.common.reject));
                await cdp.wait("document.querySelector('#approval-feedback')", 'rejection dialog');
                assert.equal(await cdp.evaluate('location.pathname'), '/approvals', 'Action click does not navigate the row');
                assert(await cdp.evaluate("document.querySelector('#approval-feedback').required"));
                await input('#approval-feedback', 'no', 'textarea');
                await cdp.click(`document.querySelector('${dialog} button[type=submit]')`);
                await cdp.wait(`document.querySelector('#approval-action-error')?.textContent.includes(${JSON.stringify(d.approvalDialog.reasonMin)})`, 'short reason rejected');
                await input('#approval-feedback', 'Synthetic revision needed', 'textarea');
                await cdp.click(`document.querySelector('${dialog} button[type=submit]')`);
                await cdp.wait(button(title === 'Synthetic plan' ? d.reviewConfirm.reject : d.approvalDialog.confirmReject, dialog), 'second confirmation step');
                await closeDialog(d.common.cancel);
                if (title === 'Synthetic plan') {
                  await cdp.click(button(d.common.approve));
                  await cdp.wait("document.querySelector('#approval-project-plan-pic option[value]') && document.querySelector('#approval-project-plan-pic').options.length > 1", 'eligible PIC loaded');
                  assert(await cdp.evaluate(`document.querySelector('${dialog} button[type=submit]').disabled`));
                  await cdp.evaluate("(() => { const e = document.querySelector('#approval-project-plan-pic'); e.value = e.options[1].value; e.dispatchEvent(new Event('change', { bubbles: true })); })()");
                  await cdp.click(`document.querySelector('${dialog} button[type=submit]')`);
                  await cdp.wait(button(d.reviewConfirm.approve, dialog), 'PIC approval confirmation');
                  await closeDialog(d.common.cancel);
                }
              } else {
                assert.equal(await cdp.evaluate(`!!(${button(d.common.approve)}) || !!(${button(d.common.reject)})`), false);
                await cdp.click(button(d.approvalUi.viewDetails));
                await cdp.wait(`document.querySelector(${JSON.stringify(dialog)})`, 'read-only details');
                assert.equal(await cdp.evaluate(`!!document.querySelector('${dialog} form') || !!document.querySelector('#approval-project-plan-pic')`), false);
                await closeDialog(d.common.close);
              }
            }
            await cdp.click(button(d.outputQueue.category)); assert.equal(await rowCount(), 20);
            await cdp.click(button(d.outputQueue.next)); assert.equal(await rowCount(), 1);
            await input('main input', 'Synthetic output 00');
            await cdp.wait(mainIncludes('Synthetic output 00'), 'search resets pagination'); assert.equal(await rowCount(), 1);
            if (role === 'HEAD_SA' && locale === 'en' && width === 1440) await cdp.screenshot(path.join(output, 'head-sa-en-1440.png'));
            await input('main input', ''); await cdp.click(button(d.approvalUi.allRequests));
            await cdp.click(button(d.approvalUi.history)); assert.equal(await rowCount(), 3);
            for (const status of ['APPROVED', 'REJECTED', 'SUPERSEDED']) {
              await cdp.evaluate(`(() => { const e = document.querySelector('main select'); e.value = ${JSON.stringify(status)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
              assert.equal(await rowCount(), 1); assert(await cdp.evaluate(mainIncludes('Synthetic history ' + status)));
            }
            if (role === 'SUPER_ADMIN' && locale === 'id' && width === 390) await cdp.screenshot(path.join(output, 'admin-id-390.png'));
          } else {
            await cdp.wait(mainIncludes(d.ui.accessRestricted), 'role guard'); assert.equal(await rowCount(), 0);
          }
          assert(await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'No page overflow');
          checks.push({ role, locale, width, state: 'ready', filtersAndPaging: authorized, roleScoped: true });
        }
        if (!authorized) assert(!traffic.api.slice(start).some(request => request.path === '/api/approvals/overview'));
        if (authorized) {
          await cdp.navigate(origin + '/approvals'); await cdp.wait(mainIncludes('Synthetic plan'), 'restored queue');
          await cdp.evaluate("document.querySelector('main [role=link]').focus()");
          await cdp.key('Enter', 'Enter', 13);
          await cdp.wait(`location.pathname === ${JSON.stringify('/projects/' + fixture.pid)}`, 'keyboard row navigation');
          await cdp.navigate(origin + '/approvals'); await cdp.wait(mainIncludes('Synthetic plan'), 'queue after project');
          await cdp.click(button(d.outputQueue.category));
          await cdp.click(button(d.outputQueue.openReview));
          await cdp.wait(`location.pathname + location.hash === ${JSON.stringify(outputTarget)}`, 'exact output snapshot link');
          await cdp.navigate(origin + '/approvals'); await cdp.wait(mainIncludes('Synthetic plan'), 'queue after output');
          mode = 'error'; await cdp.click(button(d.outputQueue.refresh));
          await cdp.wait(mainIncludes(d.outputQueue.stale), 'stale cache warning'); assert.equal(await rowCount(), 20);
          mode = 'ready'; await cdp.click(button(d.outputQueue.retry));
          await cdp.wait(`!document.querySelector('main [role=alert]')`, 'retry recovered');
          mode = 'empty'; await cdp.click(button(d.outputQueue.refresh));
          await cdp.wait(mainIncludes(d.approvalUi.queueClear), 'empty queue'); assert.equal(await rowCount(), 0);
          checks.push({ role, locale, width: 390, state: 'stale-retry-empty', recovered: true });
        }
      }
      await cdp.click(`document.querySelector('button[aria-label=${JSON.stringify(fixture.state.locale === 'id' ? id.nav.logout : en.nav.logout)}]')`);
      await cdp.wait("document.querySelector('#email')", 'logout');
    }
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
    assert.deepEqual(traffic.api.filter(request => !['GET', 'OPTIONS'].includes(request.method)
      && !['/api/auth/login', '/api/auth/logout', '/api/auth/preferences/language'].includes(request.path)), []);
    console.log(`${checks.length} Approvals browser scenarios passed: role access, categories/history/search/paging, confirmations, read-only details and retry.`);
  } catch (error) {
    await cdp.screenshot(path.join(output, 'failure.png')).catch(() => {}); throw error;
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors: traffic.errors, unknown: fixture.state.unknown, browser: runtime.browser }, null, 2));
    await runtime.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
