import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { projectListQueryOptions } from '../hooks/use-projects';
import { clearStoredAuth, setAuthTokens } from './auth';

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
const storage = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
  dispatchEvent: () => true,
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (id: string) => new Response(JSON.stringify({ success: true, data: { projects: [{ id }] } }));

async function run() {
  try {
    setAuthTokens({ accessToken: 'synthetic-first-account' });
    let requests = 0;
    let release!: (value: Response) => void;
    let signal: AbortSignal | undefined;
    globalThis.fetch = async (url, options) => {
      requests++;
      assert.equal(new URL(String(url)).search, '?page=1&limit=10');
      signal = options?.signal as AbortSignal;
      return new Promise<Response>(resolve => { release = resolve; });
    };
    const hover = client.prefetchQuery(projectListQueryOptions());
    const focus = client.prefetchQuery(projectListQueryOptions());
    await tick();
    assert.equal(requests, 1, 'Hover and focus share the same in-flight request');
    release(response('first-account'));
    await Promise.all([hover, focus]);
    const page = await client.fetchQuery(projectListQueryOptions({ page: 1, limit: 10, search: '', status: 'ALL' }));
    assert.equal(requests, 1, 'The Projects page reuses the prefetched result');
    assert.equal(page.projects[0].id, 'first-account');
    assert.equal(projectListQueryOptions().staleTime, 30_000);

    await client.invalidateQueries({ queryKey: ['projects'] });
    const pending = client.prefetchQuery(projectListQueryOptions());
    await tick();
    assert.equal(requests, 2, 'Invalidation requires fresh data');
    const previousSignal = signal!;
    client.clear();
    setAuthTokens({ accessToken: 'synthetic-second-account' });
    assert(previousSignal.aborted, 'Clearing account data aborts the prefetch');
    release(response('late-first-account'));
    await pending;
    assert.equal(client.getQueryData(projectListQueryOptions().queryKey), undefined, 'A late response cannot repopulate a cleared account cache');
    globalThis.fetch = async () => response('second-account');
    const next = await client.fetchQuery(projectListQueryOptions());
    assert.equal(next.projects[0].id, 'second-account');
    console.log('PASS project prefetch deduplication, page cache reuse, invalidation and account cancellation');
  } finally {
    client.clear(); clearStoredAuth(); globalThis.fetch = originalFetch;
    (globalThis as any).window = originalWindow;
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
