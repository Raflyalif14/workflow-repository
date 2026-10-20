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
const output = path.resolve(__dirname, '../../../.cache/clean-code-documents/browser');

async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = createFixture(), checks = [], downloadRequests = [];
  let mode = 'ready', deniedDetail = false, downloadMode = 'error';
  const ok = data => ({ status: 200, body: { success: true, data } });
  const failure = () => ({ status: 403, body: { success: false, message: 'Synthetic denied request' } });
  const version = (index, number) => ({ id: `version-${index}-${number}`, documentId: `official-${index}`, versionNumber: number,
    fileName: `synthetic-official-${index}-v${number}.pdf`, fileSize: 2048, mimeType: 'application/pdf', status: 'APPROVED',
    isLatest: number === 2, createdAt: '2026-10-10T12:00:00Z', changelog: `Synthetic revision ${number}` });
  const official = () => Array.from({ length: 21 }, (_, index) => ({
    id: `official-${index}`, projectId: fixture.pid, title: `Synthetic official ${String(index).padStart(2, '0')}`,
    category: index === 1 ? 'PROPOSAL' : 'ASSESSMENT_REPORT', status: index === 1 ? 'DRAFT' : 'APPROVED',
    canReadProject: index < 19, canUploadVersion: index === 0 && fixture.state.role === 'SALES',
    accessMode: index < 19 ? 'RESTRICTED' : 'SHARED_INTERNAL', isSharedWithMe: index >= 19,
    ...(index < 19 ? { project: { id: fixture.pid, name: 'Synthetic document project', clientName: 'Synthetic customer' } } : {}),
    ...(index === 0 ? { milestoneId: fixture.mid } : {}),
    createdAt: '2026-10-10T12:00:00Z', updatedAt: new Date(Date.UTC(2026, 9, 20, 0, 0, 21 - index)).toISOString(),
    versions: [version(index, 2)], comments: [], _count: { comments: 0, versions: index < 19 ? 2 : 1 },
  }));
  const outputs = () => ['native', 'private'].map((name, index) => ({ outputId: `output-${name}`, projectId: fixture.pid,
    milestoneId: fixture.mid, projectName: 'Synthetic output project', customer: 'Synthetic customer',
    documentKey: `output-${name}`, name: `Synthetic output ${name}`, group: 'PRA_TENDER', status: 'APPROVED',
    canReadProject: index === 0, accessMode: index === 0 ? 'RESTRICTED' : 'SHARED_INTERNAL', isSharedWithMe: index !== 0,
    approvedVersionId: `approved-${name}`, versionNumber: 2, updatedAt: '2026-10-30T12:00:00Z',
    files: [{ id: `file-${name}-1`, fileName: `output-${name}.pdf`, fileSize: 1024 },
      { id: `file-${name}-2`, fileName: `output-${name}-notes.xlsx`, fileSize: 2048 }],
  }));
  const respond = fixture.respond;
  fixture.respond = (url, method, body) => {
    const request = new URL(url), route = request.pathname.replace(/^\/api/, '');
    if (method === 'GET' && route === '/face-login/capabilities') return ok({ enabled: false });
    if (method === 'GET' && /\/download-url$|\/download$|\/archive$/.test(route)) {
      downloadRequests.push(route + request.search);
      if (downloadMode === 'error') return failure();
      if (route.endsWith('/archive')) return { status: 200, body: { fixture: 'Synthetic archive response; not a real ZIP' } };
      return { ...ok({ url: 'data:application/octet-stream;base64,U3ludGhldGljIG9ubHk=', expires_in_seconds: 60 }), delay: 250 };
    }
    if (method === 'GET' && /^\/documents\/official-\d+$/.test(route)) {
      if (deniedDetail) return failure();
      const index = Number(route.split('-').at(-1)), item = official()[index];
      return ok({ ...item, versions: index < 19 ? [version(index, 2), version(index, 1)] : item.versions });
    }
    if (method === 'GET' && ['/documents', '/documents/outputs'].includes(route)) {
      if (mode === 'error' && route === '/documents/outputs') return { status: 503, body: { success: false, message: 'Synthetic repository failure' } };
      if (mode === 'empty') return ok([]);
      if (route === '/documents') return ok(official());
      const items = outputs();
      return ok([...items, items[0], { ...items[0], documentKey: 'draft-output', name: 'Synthetic draft output', status: 'DRAFT' }]);
    }
    return respond(url, method, body);
  };
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime;
  // Capture fixture download intentions instead of opening new tabs or writing files.
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__fixtureDownloads = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (this.href.startsWith('data:application/octet-stream;base64,') || (this.href.startsWith('blob:') && this.download === 'approved-output-files.zip')) {
        window.__fixtureDownloads.push({ href: this.href, name: this.download }); return;
      }
      return originalClick.call(this);
    };` });
  const dialog = 'div.relative.z-50.overflow-y-auto';
  const button = (label, scope = 'main') => `[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(e => e.textContent.trim() === ${JSON.stringify(label)})`;
  const row = title => `[...document.querySelectorAll('#repository-results h3')].find(e => e.textContent.trim() === ${JSON.stringify(title)})?.closest('div.grid')`;
  const rowButton = (title, label) => `[...(${row(title)}).querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(label)})`;
  const count = () => cdp.evaluate("document.querySelectorAll('#repository-results h3').length");
  const summary = () => cdp.evaluate("[...document.querySelector('main section[aria-label]').children].map(e => e.querySelector('p').textContent)");
  const includes = (text, scope = 'main') => `document.querySelector(${JSON.stringify(scope)})?.textContent.includes(${JSON.stringify(text)})`;
  const input = async (selector, value) => {
    await cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  };
  const select = async (label, value) => {
    await cdp.evaluate(`(() => { const e = [...document.querySelectorAll('main select')].find(e => e.getAttribute('aria-label') === ${JSON.stringify(label)});
      e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  };
  const closeDialog = async d => {
    await cdp.click(button(d.common.close, dialog)); await cdp.wait(`!document.querySelector(${JSON.stringify(dialog)})`, 'details closed');
  };
  try {
    for (const role of ['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN']) {
      mode = 'ready'; fixture.state.locale = 'en';
      await cdp.navigate(origin + '/login'); await cdp.wait("document.querySelector('#email')", 'login');
      await input('#email', role.toLowerCase() + '@fixture.invalid'); await input('#password', 'SyntheticOnly!123');
      await cdp.click("document.querySelector('form button[type=submit]')"); await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'synthetic login');
      for (const locale of ['en', 'id']) {
        mode = 'ready'; const d = locale === 'en' ? en : id;
        await cdp.navigate(origin + '/documents');
        const language = "[...document.querySelectorAll('select')].find(e => [...e.options].some(o => o.value === 'en'))";
        await cdp.wait(`(${language}) && !(${language}).disabled`, 'language ready');
        await cdp.evaluate(`(() => { const e = (${language}); e.value = ${JSON.stringify(locale)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        await cdp.wait(`document.documentElement.lang === ${JSON.stringify(locale)}`, 'translated page');
        for (const width of [1440, 390]) {
          await cdp.viewport(width); await cdp.navigate(origin + '/documents');
          await cdp.wait(row('Synthetic official 00'), 'repository loaded');
          assert.deepEqual(await summary(), ['23', '22', '3', '2']); assert.equal(await count(), 20);
          assert.equal(await cdp.evaluate(includes('Synthetic draft output')), false);
          await cdp.click(button(d.documentPage.next)); assert.equal(await count(), 3);
          const nativeRole = ['SALES', 'SA'].includes(role);
          assert.equal(await cdp.evaluate("document.querySelectorAll('main [role=tab]').length"), nativeRole ? 2 : 1);
          if (nativeRole) {
            await cdp.click("document.querySelector('#repository-tab-NATIVE')"); assert.equal(await count(), 20);
            assert.deepEqual(await summary(), ['20', '19', '2', '1']);
            await cdp.key('ArrowLeft', 'ArrowLeft', 37);
            await cdp.wait("document.querySelector('#repository-tab-ALL').getAttribute('aria-selected') === 'true'", 'keyboard tab switch');
          } else await cdp.click(button(d.documentPage.previous));

          await select(d.documentPage.filterCategory, 'OUTPUT'); assert.equal(await count(), 2);
          await input('main input', 'output-private-notes.xlsx'); await cdp.wait(`(${row('Synthetic output private')})`, 'secondary output file search');
          assert.equal(await count(), 1); assert.equal(await cdp.evaluate(`(${row('Synthetic output private')}).querySelectorAll('a[href^="/projects/"]').length`), 0);
          downloadMode = 'error';
          const fileButton = `(${row('Synthetic output private')}).querySelector('button[aria-label]')`;
          await cdp.click(fileButton); await cdp.wait(includes(d.documentPage.outputDownloadFailed), 'output download error');
          downloadMode = 'ready'; await cdp.click(fileButton);
          await cdp.wait('window.__fixtureDownloads.length === 1', 'dummy signed output URL handled');
          assert(downloadRequests.at(-1).endsWith('/output-private/files/file-private-1/download?version_id=approved-private'));
          await cdp.click(rowButton('Synthetic output private', d.documentAccess.downloadAll));
          await cdp.wait("window.__fixtureDownloads.some(item => item.name === 'approved-output-files.zip')", 'archive response handled');

          await cdp.click(button(d.documentPage.resetFilters));
          await select(d.documentPage.filterStatus, 'DRAFT'); assert.equal(await count(), 1);
          assert(await cdp.evaluate(includes('Synthetic official 01')));
          await cdp.click(button(d.documentPage.resetFilters));
          await cdp.click(rowButton('Synthetic official 00', d.common.download));
          await cdp.wait('window.__fixtureDownloads.length === 3', 'dummy official download URL handled');
          assert(downloadRequests.at(-1).endsWith('/documents/versions/version-0-2/download-url'));
          await cdp.click(button('Synthetic official 00'));
          await cdp.wait("document.querySelector('#document-version-history') && document.querySelector('#document-comment')", 'native detail sections');
          await cdp.wait(includes('synthetic-official-0-v1.pdf', dialog), 'older version in history');
          if (role === 'HEAD_SA' && locale === 'en' && width === 1440) await cdp.screenshot(path.join(output, 'head-sa-detail-en-1440.png'));
          await closeDialog(d);
          assert.equal(await cdp.evaluate(`!!(${rowButton('Synthetic official 00', d.documentPage.newVersion)})`), role === 'SALES');
          if (role === 'SALES') {
            await cdp.click(rowButton('Synthetic official 00', d.documentPage.newVersion));
            await cdp.wait("document.querySelector('#document-version-file')", 'upload version dialog');
            await cdp.click(button(d.common.cancel, dialog));
            await cdp.wait("!document.querySelector('#document-version-file')", 'upload cancelled without write');
          }
          await cdp.navigate(origin + '/documents?source=OFFICIAL&id=official-20');
          await cdp.wait(`document.querySelector(${JSON.stringify(dialog)})`, 'shared document deep link');
          assert.equal(await cdp.evaluate("!!document.querySelector('#document-version-history') || !!document.querySelector('#document-comment')"), false);
          await cdp.wait(includes('Synthetic official 20', dialog), 'shared document title');
          if (role === 'SA' && locale === 'id' && width === 390) await cdp.screenshot(path.join(output, 'sa-shared-id-390.png'));
          await closeDialog(d);
          assert(await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'No page overflow');
          checks.push({ role, locale, width, state: 'ready', filtersAndPaging: true, versionDetails: true, downloadIntent: true });
        }
        deniedDetail = true;
        await cdp.navigate(origin + '/documents?source=OFFICIAL&id=official-0');
        await cdp.wait(includes(d.documentAccess.denied, dialog), 'denied detail');
        assert.equal(await cdp.evaluate(includes('Synthetic official 00', dialog)), false);
        deniedDetail = false; await cdp.click(button(d.common.retry, dialog));
        await cdp.wait("document.querySelector('#document-version-history')", 'detail retry'); await closeDialog(d);
        mode = 'error'; await cdp.navigate(origin + '/documents');
        await cdp.wait(includes(d.ui.documentLoadFailed), 'partial repository failure');
        assert.deepEqual(await summary(), ['—', '—', '—', '—']); assert.equal(await count(), 0);
        mode = 'ready'; await cdp.click(button(d.common.retry)); await cdp.wait(row('Synthetic official 00'), 'repository retry');
        mode = 'empty'; await cdp.navigate(origin + '/documents');
        await cdp.wait(includes(d.ui.documentNotFound), 'empty repository'); assert.deepEqual(await summary(), ['0', '0', '0', '0']);
        checks.push({ role, locale, width: 390, state: 'denied-error-retry-empty', accessGuard: true });
      }
      await cdp.click(`document.querySelector('button[aria-label=${JSON.stringify(fixture.state.locale === 'id' ? id.nav.logout : en.nav.logout)}]')`);
      await cdp.wait("document.querySelector('#email')", 'logout');
    }
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
    assert.deepEqual(traffic.api.filter(request => !['GET', 'OPTIONS'].includes(request.method)
      && !['/api/auth/login', '/api/auth/logout', '/api/auth/preferences/language'].includes(request.path)), []);
    console.log(`${checks.length} Documents browser scenarios passed: all roles, EN/ID, filters/paging, versions, shared details, download intentions, errors/retry.`);
  } catch (error) { await cdp.screenshot(path.join(output, 'failure.png')).catch(() => {}); throw error; }
  finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, downloadRequests, errors: traffic.errors, unknown: fixture.state.unknown, browser: runtime.browser }, null, 2));
    await runtime.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
