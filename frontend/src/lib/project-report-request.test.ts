import assert from 'node:assert/strict';
import { setAuthTokens } from './auth';
import { SessionChangedError } from './api-client';
import { loadProjectReport } from './project-report-request';

async function run() {
  const original = { window: globalThis.window, fetch: globalThis.fetch };
  const store = new Map<string, string>();
  (globalThis as any).window = { localStorage: { getItem: (key: string) => store.get(key) || null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) } };
  const project = { id: 'a', name: 'Project', status: 'ACTIVE' };
  const controller = new AbortController();
  try {
    await assert.rejects(() => loadProjectReport('a', 'en', controller.signal), SessionChangedError);
    setAuthTokens({ accessToken: 'fixture-session-a' });
    const calls: string[] = [];
    globalThis.fetch = async (url: any, init: any) => {
      calls.push(String(url)); assert.equal(init.signal, controller.signal);
      return new Response(JSON.stringify({ success: true, data: String(url).includes('/milestones') ? [] : project }));
    };
    const result = await loadProjectReport('a', 'id', controller.signal);
    assert.equal(result.report.language, 'id'); assert.equal(result.report.projectId, 'a');
    assert.equal(calls.length, 2); assert(calls.some(url => url.endsWith('?include_activity=false')));
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'Forbidden' }), { status: 403 });
    await assert.rejects(() => loadProjectReport('a', 'en', controller.signal), /Forbidden/);
    for (const data of [{ project: { ...project, id: 'b' }, milestones: [] }, { project, milestones: [{ project_id: 'b' }] }, { project, milestones: null }]) {
      globalThis.fetch = async (url: any) => new Response(JSON.stringify({ success: true, data: String(url).includes('/milestones') ? data.milestones : data.project }));
      await assert.rejects(() => loadProjectReport('a', 'en', controller.signal), /Invalid project report data/);
    }
    const pending: Array<(response: Response) => void> = [];
    globalThis.fetch = async () => new Promise<Response>(resolve => pending.push(resolve));
    const loading = loadProjectReport('a', 'en', controller.signal);
    setAuthTokens({ accessToken: 'fixture-session-b' });
    pending[0](new Response(JSON.stringify({ success: true, data: project })));
    pending[1](new Response(JSON.stringify({ success: true, data: [] })));
    await assert.rejects(loading, SessionChangedError, 'No cross-account report after an in-flight session change');
    controller.abort();
    globalThis.fetch = async (url: any) => new Response(JSON.stringify({ success: true, data: String(url).includes('/milestones') ? [] : project }));
    await assert.rejects(() => loadProjectReport('a', 'en', controller.signal), { name: 'AbortError' });
    console.log('Report request: authenticated fresh reads, access failure, scope validation, late-session response and cancellation passed.');
  } finally { (globalThis as any).window = original.window; globalThis.fetch = original.fetch; }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
