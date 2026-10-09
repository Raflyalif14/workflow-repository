import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMyAssignedMilestones } from "../hooks/use-projects";
import { useSubmitOutputDocuments, useReviewOutputDocuments } from "../hooks/use-output-documents";
import { assignmentKeys } from "./query-keys";
import {
  countAssignedMilestonesNeedingAction,
  countAssignedOutputsWaitingReview,
  getAssignedMilestoneState,
  getAssignedMilestonesNeedingAction,
  isAssignedProjectActive,
  isAssignedProjectPaused,
} from "./assigned-milestone-ux";

const milestones = [
  { id: "active-work", status: "IN_PROGRESS", project: { status: "ACTIVE", is_postponed: false } },
  { id: "active-revision", status: "REJECTED", project: { status: "ACTIVE", is_postponed: false } },
  { id: "paused-status", status: "IN_PROGRESS", project: { status: "POSTPONED", is_postponed: false } },
  { id: "paused-flag", status: "REJECTED", project: { status: "ACTIVE", is_postponed: true } },
  { id: "completed-project", status: "IN_PROGRESS", project: { status: "COMPLETED", is_postponed: false } },
  { id: "active-review", status: "SUBMITTED", project: { status: "ACTIVE", is_postponed: false } },
];

const original = JSON.stringify(milestones);
const needsAction = getAssignedMilestonesNeedingAction(milestones);
assert.deepEqual(needsAction.map((item) => item.id), ["active-work", "active-revision"]);
assert.equal(needsAction.length, 2);
assert.equal(milestones.length, 6, "All assigned must retain postponed milestones");
assert.equal(JSON.stringify(milestones), original, "Filtering must not mutate assigned data");
assert.equal(isAssignedProjectActive(milestones[0]), true);
assert.equal(isAssignedProjectActive(milestones[2]), false);
assert.equal(isAssignedProjectActive(milestones[3]), false);
assert.equal(isAssignedProjectPaused(milestones[2]), true);
assert.equal(isAssignedProjectPaused(milestones[3]), true);
assert.equal(isAssignedProjectPaused(milestones[4]), false);
assert.equal(isAssignedProjectActive({ status: "IN_PROGRESS", project: null }), false);

const sidebarCount = countAssignedMilestonesNeedingAction;
const pageCount = (items: typeof milestones) => getAssignedMilestonesNeedingAction(items).length;
assert.equal(sidebarCount(milestones), pageCount(milestones));
assert.equal(sidebarCount([milestones[2], milestones[3]]), 0, "Postponed projects have no sidebar badge or page actions");
const resumed = milestones.map((item) => item.id === "paused-status"
  ? { ...item, project: { status: "ACTIVE", is_postponed: false } }
  : item);
assert.equal(sidebarCount(resumed), pageCount(resumed));
assert.equal(sidebarCount(resumed), 3, "Resumed work is actionable again");

console.log("Assigned milestone action eligibility: active versus postponed passed");

const output = (status: string, selected = true, required = false) => ({ status, is_selected: selected, is_required: required });
const work = (outputs: ReturnType<typeof output>[]) => ({ ...milestones[0], outputs });
assert.equal(sidebarCount([work([output('DRAFT')])]), 1, 'Draft still needs SA submission');
for (const status of ['SUBMITTED', 'IN_REVIEW', 'APPROVED']) {
  assert.equal(sidebarCount([work([output(status)])]), 0, `${status} alone has no SA action`);
}
assert.equal(sidebarCount([work([output('REVISION_REQUIRED')])]), 1, 'Returned revision is actionable without changing milestone status');
for (const status of ['TO_DO', 'DRAFT', 'REVISION_REQUIRED']) {
  assert.equal(sidebarCount([work([output('IN_REVIEW'), output(status), output(status)])]), 1,
    'Mixed outputs count one milestone, not one task per output');
}
assert.equal(sidebarCount([work([output('IN_REVIEW'), output('APPROVED'), output('TO_DO', false)])]), 0,
  'Unselected optional outputs must not count');
assert.equal(sidebarCount([work([output('TO_DO', false, true)])]), 1, 'Required output always counts');
assert.equal(sidebarCount([{ ...work([output('REVISION_REQUIRED')]), status: 'COMPLETED' }]), 0);
assert.equal(sidebarCount([{ ...work([output('DRAFT')]), project: { status: 'ACTIVE', is_postponed: true } }]), 0);
assert.equal(sidebarCount([work([]), milestones[1]]), 2, 'Legacy empty/missing output collections retain milestone behavior');
console.log('Assigned milestone output eligibility: submit/wait/revision/mixed selection passed');

for (const status of ['SUBMITTED', 'IN_REVIEW']) {
  assert.equal(getAssignedMilestoneState(work([output(status)])), 'WAITING_REVIEW');
  assert.equal(getAssignedMilestoneState(work([output(status), output('TO_DO')])), 'ACTION', 'Partial submit prioritizes SA work');
  assert.equal(getAssignedMilestoneState(work([output(status), output('REVISION_REQUIRED')])), 'ACTION', 'Returned revision takes priority');
}
assert.equal(countAssignedOutputsWaitingReview(work([output('SUBMITTED'), output('IN_REVIEW'), output('IN_REVIEW', false)])), 2);
assert.equal(getAssignedMilestoneState(work([output('APPROVED')])), 'OTHER', 'Approval alone cannot infer milestone completion');
for (const status of ['COMPLETED', 'APPROVED']) assert.equal(getAssignedMilestoneState({ ...work([output('APPROVED')]), status }), 'COMPLETED');
for (const project of [{ status: 'POSTPONED', is_postponed: false }, { status: 'ACTIVE', is_postponed: true }, { status: 'WON' }, { status: 'COMPLETED' }]) {
  assert.equal(getAssignedMilestoneState({ ...work([output('IN_REVIEW')]), project }), 'OTHER', 'Inactive/paused projects cannot be forced into waiting review');
}
assert.equal(getAssignedMilestoneState(work([output('IN_REVIEW', false), output('APPROVED')])), 'OTHER');
console.log('Assigned classification: exclusive action/waiting/completed/other and selected waiting counts passed');

async function verifyMutationRefresh() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  const key = assignmentKeys.myAssignedMilestones();
  let submit!: ReturnType<typeof useSubmitOutputDocuments>;
  let review!: ReturnType<typeof useReviewOutputDocuments>;
  function Harness() {
    useMyAssignedMilestones();
    submit = useSubmitOutputDocuments('fixture-project');
    review = useReviewOutputDocuments('fixture-project');
    return null;
  }
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Harness)));
  const originalFetch = globalThis.fetch;
  let status = 'DRAFT';
  const requests: string[] = [];
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url), 'http://127.0.0.1').pathname;
    requests.push(path);
    let data: unknown;
    if (path.endsWith('/me/assigned-milestones')) data = [work([output(status)])];
    else if (path.endsWith('/output-documents/submit')) {
      assert.equal(options?.method, 'POST'); status = 'IN_REVIEW'; data = { success: true, results: [] };
    } else if (path.endsWith('/output-documents/review')) {
      assert.equal(options?.method, 'POST'); status = 'REVISION_REQUIRED'; data = { success: true, results: [] };
    } else throw new Error('Unexpected fixture route');
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  };
  try {
    const read = async () => {
      const options = client.getQueryCache().find({ queryKey: key })!.options;
      return client.fetchQuery({ ...options, queryKey: key });
    };
    await read();
    assert.equal(sidebarCount(client.getQueryData(key)!), 1);
    await submit.mutateAsync({ items: [{ document_key: 'proposal', expected_draft_revision: 1, request_id: 'synthetic-submit' }] });
    assert.equal(client.getQueryState(key)?.isInvalidated, true, 'Submit must invalidate the badge source');
    await read();
    assert.equal(sidebarCount(client.getQueryData(key)!), 0, 'Refetched submitted output is waiting, not actionable');
    assert.equal(getAssignedMilestoneState((client.getQueryData(key) as ReturnType<typeof work>[])[0]), 'WAITING_REVIEW');
    await review.mutateAsync({ decision: 'REVISE', feedback: 'Synthetic revision', items: [
      { document_key: 'proposal', expected_version_id: 'synthetic-version', request_id: 'synthetic-review' },
    ] });
    assert.equal(client.getQueryState(key)?.isInvalidated, true, 'Review must invalidate the badge source');
    await read();
    assert.equal(sidebarCount(client.getQueryData(key)!), 1, 'Refetched returned revision restores the badge');
    assert.equal(getAssignedMilestoneState((client.getQueryData(key) as ReturnType<typeof work>[])[0]), 'ACTION');
    assert.equal(requests.filter(path => path.endsWith('/me/assigned-milestones')).length, 3);
    console.log('Real output hooks: submit/review invalidation and assigned query refresh passed (HTTP fixture).');
  } finally { globalThis.fetch = originalFetch; client.clear(); }
}
verifyMutationRefresh().catch(error => { console.error(error); process.exitCode = 1; });
