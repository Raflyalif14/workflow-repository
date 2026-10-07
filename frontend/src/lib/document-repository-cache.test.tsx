import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as auth from '../components/auth/auth-provider';
import { useAssignPic, useReviewProjectPlan } from '../hooks/use-projects';
import { useProcessApproval } from '../hooks/use-approvals';
import { useReviewOutputDocuments, outputDocumentKeys } from '../hooks/use-output-documents';
import { ApiError } from './api-client';

async function run() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  const originals = { auth: auth.useAuth, fetch: globalThis.fetch };
  (auth as any).useAuth = () => ({ user: { id: 'manager', role: 'HEAD_SA', isActive: true } });
  let assign!: ReturnType<typeof useAssignPic>, plan!: ReturnType<typeof useReviewProjectPlan>,
    queue!: ReturnType<typeof useProcessApproval>, review!: ReturnType<typeof useReviewOutputDocuments>;
  function Harness() {
    assign = useAssignPic('p'); plan = useReviewProjectPlan('p'); queue = useProcessApproval();
    review = useReviewOutputDocuments('p'); return null;
  }
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Harness)));
  const keys = [['documents', 'account-a'], ['document', 'd', 'account-a'],
    [...outputDocumentKeys.repository(), 'account-a'], ['global-search', 'account-a']];
  const seed = () => keys.forEach(key => client.setQueryData(key, { fixture: true }));
  const assertInvalidated = (expected: boolean, selected = keys) => selected.forEach(key =>
    assert.equal(client.getQueryState(key)?.isInvalidated, expected, JSON.stringify(key)));
  const pic = { pic_id: 'new-pic', expected_pic_revision: '1', request_id: 'fixture' };
  try {
    seed();
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'Safe fixture failure' }), { status: 503 });
    await assert.rejects(() => assign.mutateAsync(pic), ApiError);
    assertInvalidated(false, keys);
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    await assign.mutateAsync(pic); assertInvalidated(true);
    seed();
    await plan.mutateAsync({ decision: 'APPROVE', picId: 'new-pic', expectedPicRevision: '1', requestId: 'fixture' });
    assertInvalidated(true);
    seed();
    await queue.mutateAsync({ item: { id: 'plan', category: 'PROJECT_PLAN', projectId: 'p' } as any,
      action: 'APPROVE', picId: 'new-pic', expectedPicRevision: '1', requestId: 'fixture' });
    assertInvalidated(true);
    seed();
    await review.mutateAsync({ decision: 'APPROVE', items: [] });
    assertInvalidated(true, [keys[2], keys[3]]);
    console.log('Repository cache: PIC assignment and both plan review surfaces refresh membership; output approval refreshes repository/search; failed writes preserve cache. Passed.');
  } finally { (auth as any).useAuth = originals.auth; globalThis.fetch = originals.fetch; client.clear(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
