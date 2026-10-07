import assert from 'node:assert/strict';
import { QueryClient, QueryObserver, focusManager } from '@tanstack/react-query';
import Module from 'node:module';
import * as queries from '@tanstack/react-query';
import { approvalQueuePage, planAndDeadlineApprovals, focusOutputReviewLink, outputReviewHref, outputReviewIsStale, outputReviewTarget } from './approval-queue';
import { canReadApprovalOverview } from './approval-overview-access';
import { milestoneIdFromHash, initialExpandedMilestoneIds, reconcileExpandedMilestoneIds } from './milestone-presentation';
import { approvalKeys, dashboardKeys, projectKeys } from './query-keys';
import { en } from '../i18n/en';
import { id } from '../i18n/id';
import { DEFAULT_LANGUAGE, setActiveLanguage, translate } from '../i18n';
import type { ApprovalItem } from '../types/approval';

const items = Array.from({ length: 65 }, (_, i): ApprovalItem => ({ id: String(i).padStart(3, '0'),
  category: i % 3 === 0 ? 'OUTPUT_DOCUMENT' : i % 3 === 1 ? 'DEADLINE' : 'PROJECT_PLAN', title: 'Request',
  status: 'PENDING', isCurrentApproval: true, projectId: 'p', projectName: 'User project', clientName: 'Customer',
  projectCode: 'p', targetEntityId: 'target', submittedBy: 'Actor', submittedAt: '2026-10-06', requestedAt: '2026-10-06',
  milestoneId: 'closed', outputId: 'output', snapshotId: 'snapshot' }));
const ordered = approvalQueuePage([...items].reverse(), { type: 'ALL' }, false, 1);
assert.equal(ordered.total, 65); assert.equal(ordered.pages, 4); assert.equal(ordered.items.length, 20);
assert.deepEqual(ordered.items, approvalQueuePage(items, { type: 'ALL' }, false, 1).items, 'Tie-breaker survives source order');
const seen = [1, 2, 3, 4].flatMap(page => approvalQueuePage(items, {}, false, page).items.map(item => `${item.category}:${item.id}`));
assert.equal(new Set(seen).size, 65);
const outputs = approvalQueuePage(items, { type: 'OUTPUT_DOCUMENT' }, false, 9);
assert.equal(outputs.total, 22); assert.equal(outputs.page, 2); assert.equal(outputs.items.length, 2);
assert.equal(approvalQueuePage(items, { search: 'absent' }, false, 9).page, 1);
assert.equal(approvalQueuePage([{ ...items[0], isCurrentApproval: false }], {}, false, 1).total, 0);
assert.equal(approvalQueuePage([{ ...items[0], status: 'APPROVED' }], {}, true, 1).total, 1);
const sameId = [{ ...items[0], category: 'PROJECT_PLAN' as const }, { ...items[0], category: 'OUTPUT_DOCUMENT' as const }];
assert.equal(new Set(approvalQueuePage(sameId, {}, false, 1).items.map(item => `${item.category}:${item.id}`)).size, 2);

assert.equal(planAndDeadlineApprovals(items).length, 43, 'Dashboard plan/deadline tasks do not misclassify or duplicate output tasks');
assert.equal(approvalQueuePage([{ ...items[0], documentKey: 'timeline_proyek', title: 'Timeline Proyek' }], { search: en.outputName.timeline_proyek }, false, 1, 20, 'en').total, 1);
const href = outputReviewHref(items[0]), hash = href.slice(href.indexOf('#'));
assert.equal(milestoneIdFromHash(hash, ['closed']), 'closed'); assert.equal(milestoneIdFromHash(hash, ['other']), null);
const target = outputReviewTarget(hash); assert.deepEqual(target, { outputId: 'output', snapshotId: 'snapshot' });
const expanded = initialExpandedMilestoneIds([{ id: 'closed', status: 'COMPLETED' }], undefined, 'HEAD_SA');
expanded.add(milestoneIdFromHash(hash, ['closed'])!);
assert(reconcileExpandedMilestoneIds(expanded, [{ id: 'closed', status: 'COMPLETED' }], undefined, 'HEAD_SA', new Set()).has('closed'));
assert.equal(outputReviewIsStale(target, { id: 'output', status: 'IN_REVIEW', currentVersionId: 'snapshot' }), false);
assert.equal(outputReviewIsStale(target, { id: 'output', status: 'APPROVED', currentVersionId: 'snapshot' }), true);
assert.equal(outputReviewIsStale(target, { id: 'output', status: 'IN_REVIEW', currentVersionId: 'new-snapshot' }), true);
const focusEvents: string[] = [];
const ancestor = { open: false };
const element = (name: string) => ({ closest: () => ancestor, scrollIntoView: () => { assert(ancestor.open); focusEvents.push(`scroll:${name}`); }, focus: () => focusEvents.push(`focus:${name}`) });
let loaded = false;
const root = { getElementById: (name: string) => name === 'project-output-output' ? (loaded ? element('output') : null) : element('milestone') } as unknown as Pick<Document, 'getElementById'>;
focusOutputReviewLink(hash, 'closed', root); assert.deepEqual(focusEvents, ['scroll:milestone', 'focus:milestone']);
loaded = true; focusEvents.length = 0; focusOutputReviewLink(hash, 'closed', root);
assert.deepEqual(focusEvents, ['scroll:output', 'focus:output'], 'After output data mounts, focus moves to output, including a previous-phase details section');
assert.equal(DEFAULT_LANGUAGE, 'en');
assert.deepEqual(Object.keys(en.outputQueue).sort(), Object.keys(id.outputQueue).sort());
for (const key of Object.keys(en.outputQueue) as Array<keyof typeof en.outputQueue>) {
  assert.deepEqual(en.outputQueue[key].match(/\{\w+\}/g) || [], id.outputQueue[key].match(/\{\w+\}/g) || []);
  for (const locale of ['en', 'id'] as const) {
    setActiveLanguage(locale); assert.notEqual(translate(`outputQueue.${key}`, { page: 1, pages: 2, count: 3, version: 4 }), `outputQueue.${key}`);
  }
}

async function main() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const captured: any[] = [], invalidations: unknown[] = [];
  let apiCalls = 0;
  let payload: any = { stats: { totalPending: 0, pendingDocs: 0, pendingProjectPlans: 0, pendingDeadlines: 0 }, items: [] };
  const originalLoad = (Module as any)._load;
  (Module as any)._load = function(name: string, ...args: any[]) {
    if (name.endsWith('/api-client')) return { apiClient: async () => { apiCalls++; return payload; } };
    if (name === '@tanstack/react-query') return { ...queries,
      useQuery: (options: any) => { captured.push(options); return {}; },
      useMutation: (options: any) => { captured.push(options); return {}; },
      useQueryClient: () => ({ invalidateQueries: (options: any) => invalidations.push(options.queryKey) }) };
    return originalLoad.call(this, name, ...args);
  };
  const approvalHooks = require('../hooks/use-approvals') as typeof import('../hooks/use-approvals');
  const outputHooks = require('../hooks/use-output-documents') as typeof import('../hooks/use-output-documents');
  (Module as any)._load = originalLoad;
  try {
    for (const role of ['HEAD_SA', 'SUPER_ADMIN', 'SA', 'SALES', undefined]) {
      const enabled = canReadApprovalOverview(role); captured.length = 0;
      approvalHooks.useApprovalOverview(enabled); approvalHooks.useApprovals({}, enabled);
      approvalHooks.useApprovalStats(enabled); approvalHooks.useApprovalStats(enabled, true);
      for (const options of captured) { assert.equal(options.enabled, enabled); assert.deepEqual(options.queryKey, approvalKeys.overview()); assert.equal(options.refetchOnWindowFocus, true); }
      assert(captured.slice(0, 3).every(options => options.refetchInterval === false));
      assert.equal(captured[3].refetchInterval, enabled ? 60_000 : false, 'Only shell observer polls; unauthorized users never poll');
    }
    captured.length = 0; approvalHooks.useApprovalOverview(true);
    assert.equal((await captured[0].queryFn()).stats.pendingDocs, 0, 'Valid zero is preserved');
    payload = { stats: { totalPending: 0, pendingProjectPlans: 0, pendingDeadlines: 0 }, items: [] };
    await assert.rejects(captured[0].queryFn(), /Failed to load approval overview/, 'Missing aggregate is not zero');
    captured.length = 0; approvalHooks.useProcessApproval(); const callsBefore = apiCalls;
    assert.throws(() => captured[0].mutationFn({ item: items[0], action: 'APPROVE' }), /Unsupported approval type/);
    assert.equal(apiCalls, callsBefore, 'Overview output category cannot call another approval mutation');
    for (const hook of [outputHooks.useSubmitOutputDocuments, outputHooks.useReviewOutputDocuments]) {
      captured.length = 0; invalidations.length = 0; hook('p'); captured[0].onSuccess();
      assert(invalidations.some(key => JSON.stringify(key) === JSON.stringify(approvalKeys.all())));
      assert(invalidations.some(key => JSON.stringify(key) === JSON.stringify(dashboardKeys.overview())));
      assert(invalidations.some(key => JSON.stringify(key) === JSON.stringify(projectKeys.milestones('p'))));
      invalidations.length = 0; captured[0].onError();
      assert(invalidations.some(key => JSON.stringify(key) === JSON.stringify(approvalKeys.all())), 'An uncertain failed response still refreshes the queue');
    }
    captured.length = 0; approvalHooks.useApprovalOverview(true); const options = captured[0];
    let requests = 0;
    const queryFn = async () => { requests++; return { stats: { totalPending: requests, pendingDocs: requests }, items }; };
    const observers = [new QueryObserver<any>(client, { ...options, queryFn }), new QueryObserver<any>(client, { ...options, queryFn })];
    const unsubscribe = observers.map(observer => observer.subscribe(() => {}));
    await observers[0].refetch(); assert.equal(requests, 1, 'Overview and counter share one in-flight query');
    await client.invalidateQueries({ queryKey: approvalKeys.all() }); assert.equal(requests, 2);
    assert.equal(observers[1].getCurrentResult().data?.stats.totalPending, 2);
    client.mount(); focusManager.setFocused(false); focusManager.setFocused(true);
    // Force staleness to demonstrate independent browser freshness upon focus.
    client.setQueryData(approvalKeys.overview(), { stats: { totalPending: 2 }, items }, { updatedAt: 1 });
    focusManager.setFocused(false); focusManager.setFocused(true);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(requests, 3);
    unsubscribe.forEach(stop => stop()); client.unmount();
    const disabled = new QueryObserver<any>(client, { ...options, enabled: false, queryFn }); const stop = disabled.subscribe(() => {});
    await client.invalidateQueries({ queryKey: approvalKeys.all() }); assert.equal(requests, 3, 'Disabled observer does not refetch after invalidation'); stop();
    console.log('Approval queue: global filter/paging/ties, IDs, deep-link expansion/staleness, EN/ID, hook eligibility, mutation invalidation and shared-cache/focus freshness passed.');
  } finally { (Module as any)._load = originalLoad; client.clear(); focusManager.setFocused(undefined); setActiveLanguage('en'); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
