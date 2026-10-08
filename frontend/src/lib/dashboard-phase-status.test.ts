import assert from "node:assert/strict";
import React, { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Pie } from "recharts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PhaseWorkStatusPanel } from "../components/dashboard/phase-work-status-panel";
import { DEFAULT_WORK_STATUS_FILTER, getPhaseStatusDistribution, getWorkStatusDistribution, isAllWorkStatus, isPhaseWorkStatus, type AllWorkStatus, type PhaseWorkStatus, type WorkStatusPhase } from "./dashboard-phase-status";
import { DEFAULT_LANGUAGE, formatNumber, setActiveLanguage, translate } from "../i18n";
import { useAssignPic, useCreateProject, useDeleteProject, useSubmitProjectPlan, useClosePraTender, useContinueTenderPhase, usePostponeProject, useResumeProject, useSetProjectOutcome } from "../hooks/use-projects";
import { useProcessApproval } from "../hooks/use-approvals";
import * as auth from "../components/auth/auth-provider";
import { dashboardKeys, projectKeys } from "./query-keys";

const summary: PhaseWorkStatus = { PRA_TENDER: { active: 3, postponed: 1 }, ON_SUBMISSION_TENDER: { won: 1, lost: 2 } };
const allSummary: AllWorkStatus = { total: 14, planning: 2, active: 4, postponed: 2, completed: 1, won: 1, lost: 2, waitingResult: 1, cancelled: 1 };
const zero: PhaseWorkStatus = { PRA_TENDER: { active: 0, postponed: 0 }, ON_SUBMISSION_TENDER: { won: 0, lost: 0 } };
const allZero: AllWorkStatus = { total: 0, planning: 0, active: 0, postponed: 0, completed: 0, won: 0, lost: 0, waitingResult: 0, cancelled: 0 };
assert.equal(DEFAULT_LANGUAGE, "en"); assert.equal(DEFAULT_WORK_STATUS_FILTER, "ALL");
assert.equal(getPhaseStatusDistribution(summary, "PRA_TENDER").total, 4);
assert.deepEqual(getPhaseStatusDistribution(summary, "PRA_TENDER").rows.map(row => row.percentage), [75, 25]);
assert.equal(getPhaseStatusDistribution(summary, "ON_SUBMISSION_TENDER").total, 3);
assert(isPhaseWorkStatus(zero)); assert(isAllWorkStatus(allZero));
const invalidPhases = [undefined, null, {}, { PRA_TENDER: { active: 0, postponed: 0 } },
  { ...zero, ON_SUBMISSION_TENDER: { won: null, lost: 0 } }, { ...zero, PRA_TENDER: { active: -1, postponed: 0 } },
  { ...zero, PRA_TENDER: { active: NaN, postponed: 0 } }, { ...zero, PRA_TENDER: { active: "0", postponed: 0 } }];
for (const value of invalidPhases) {
  assert(!isPhaseWorkStatus(value)); assert.equal(getWorkStatusDistribution(allSummary, value, "PRA_TENDER"), null);
  assert.equal(getWorkStatusDistribution(allSummary, value, "ALL")!.total, 14);
}
const invalidAll = [undefined, null, {}, { ...allZero, planning: undefined }, { ...allZero, completed: null },
  ...[-1, 0.5, NaN, Infinity, "0", Number.MAX_SAFE_INTEGER + 1].map(total => ({ ...allZero, total })),
  { ...allZero, active: 1 }, { ...allZero, waitingResult: undefined }, { ...allZero, lost: -1 }];
for (const value of invalidAll) {
  assert(!isAllWorkStatus(value)); assert.equal(getWorkStatusDistribution(value, summary, "ALL"), null);
  assert.equal(getWorkStatusDistribution(value, summary, "PRA_TENDER")!.total, 4);
}
for (const phase of ["ALL", "PRA_TENDER", "ON_SUBMISSION_TENDER"] as const) {
  assert(getWorkStatusDistribution(allZero, zero, phase)!.rows.every(row => row.percentage === 0));
}
const all = getWorkStatusDistribution(allSummary, summary, "ALL")!;
assert.equal(all.rows.reduce((sum, row) => sum + row.count, 0), all.total);
assert.equal(all.rows.find(row => row.status === 'ACTIVE')!.percentage, 4 / 14 * 100);
for (const phase of ['PRA_TENDER', 'ON_SUBMISSION_TENDER'] as const) {
  for (const row of getWorkStatusDistribution(allSummary, summary, phase)!.rows) assert.equal(row.color, all.rows.find(item => item.status === row.status)!.color);
}

type Element = React.ReactElement<any>;
const elements = (node: ReactNode): Element[] => Array.isArray(node) ? node.flatMap(elements)
  : isValidElement(node) ? [node as Element, ...elements((node as Element).props.children)] : [];
let retries = 0;
const props = { summary, allSummary, loading: false, hasError: false, onRetry: () => { retries++; } };
// Actual handlers and rendered tree, preserving the original hook-slot fixture.
// No browser layout/keyboard or live database verification is claimed.
let selected: WorkStatusPhase | undefined;
const originalUseState = React.useState;
function panel(overrides: Partial<Parameters<typeof PhaseWorkStatusPanel>[0]> = {}) {
  try {
    (React as any).useState = (initial: WorkStatusPhase) => {
      selected ??= initial; return [selected, (next: WorkStatusPhase) => { selected = next; }];
    };
    return PhaseWorkStatusPanel({ ...props, ...overrides });
  } finally { React.useState = originalUseState; }
}
const buttons = (tree: ReactNode) => elements(tree).filter(node => node.type === 'button');
try {
  let tree = panel(); assert.equal(selected, 'ALL'); assert.equal(buttons(tree).length, 3);
  assert.equal(buttons(tree)[0].props['aria-pressed'], true);
  assert.deepEqual(elements(tree).find(node => node.type === Pie)!.props.data.map((row: any) => [row.status, row.value]),
    [['DRAFT', 2], ['ACTIVE', 4], ['POSTPONED', 2], ['COMPLETED', 1], ['WON', 1], ['LOST', 2], ['WAITING_RESULT', 1], ['CANCELLED', 1]]);
  buttons(tree)[2].props.onClick(); assert.equal(selected, 'ON_SUBMISSION_TENDER');
  for (const language of ['en', 'id'] as const) {
    setActiveLanguage(language);
    tree = panel({ summary: { PRA_TENDER: { active: 9, postponed: 0 }, ON_SUBMISSION_TENDER: { won: 4, lost: 1 } }, refreshing: true });
    assert.equal(selected, 'ON_SUBMISSION_TENDER'); assert.equal(buttons(tree)[2].props['aria-pressed'], true);
    assert.deepEqual(elements(tree).find(node => node.type === Pie)!.props.data.map((row: any) => [row.status, row.value]), [['WON', 4], ['LOST', 1]]);
    const html = renderToStaticMarkup(tree);
    assert(html.includes(language === 'en' ? 'Won' : 'Menang')); assert(html.includes(language === 'en' ? 'Lost' : 'Kalah'));
    assert(html.includes(formatNumber(0.8, { style: 'percent', maximumFractionDigits: 1 })));
    assert(html.includes(translate('dashboardPage.workStatusRefreshing')));
  }
  buttons(panel())[1].props.onClick();
  assert.deepEqual(elements(panel()).find(node => node.type === Pie)!.props.data.map((row: any) => row.status), ['ACTIVE', 'POSTPONED']);
  buttons(panel())[0].props.onClick();
  for (const value of invalidAll) {
    tree = panel({ allSummary: value as AllWorkStatus });
    assert(!elements(tree).some(node => node.type === Pie || node.type === 'dl'));
    assert(renderToStaticMarkup(tree).includes(translate('dashboardPage.workStatusUnavailable')));
  }
  tree = panel({ allSummary: undefined, loading: true }); assert(!elements(tree).some(node => node.type === Pie));
  tree = panel({ allSummary: undefined, hasError: true }); buttons(tree).at(-1)!.props.onClick(); assert.equal(retries, 1);
  tree = panel({ hasError: true }); assert(elements(tree).some(node => node.type === Pie), 'Refresh error retains previously loaded data with a stale notice');
  assert(renderToStaticMarkup(tree).includes(translate('dashboardPage.workStatusStale')));
  for (const [index, key] of [[0, 'allWorkStatusEmpty'], [1, 'workStatusEmpty'], [2, 'workStatusEmptyTender']] as const) {
    buttons(panel())[index].props.onClick(); tree = panel({ allSummary: allZero, summary: zero });
    assert(!elements(tree).some(node => node.type === Pie));
    assert(renderToStaticMarkup(tree).includes(translate(`dashboardPage.${key}`)));
  }
  buttons(panel())[0].props.onClick();
  for (const value of invalidPhases) assert(elements(panel({ summary: value as PhaseWorkStatus })).some(node => node.type === Pie), 'Bad phase metadata cannot hide a valid All chart');
  for (const language of ['en', 'id'] as const) {
    setActiveLanguage(language);
    for (const key of ['allScenarios', 'allProjectsTotal', 'praProjectsTotal', 'tenderResultsTotal', 'allWorkStatusScope', 'praWorkStatusScope', 'tenderWorkStatusScope', 'allWorkStatusEmpty', 'workStatusStale', 'workStatusRefreshing'] as const) {
      assert(!translate(`dashboardPage.${key}`).startsWith('dashboardPage.'));
    }
  }
} finally { setActiveLanguage(DEFAULT_LANGUAGE); }

async function checkInvalidation() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  const keys: unknown[][] = [];
  client.invalidateQueries = async filters => { keys.push([...(filters?.queryKey || [])]); };
  let mutations!: {
    create: ReturnType<typeof useCreateProject>; remove: ReturnType<typeof useDeleteProject>; submitPlan: ReturnType<typeof useSubmitProjectPlan>;
    assign: ReturnType<typeof useAssignPic>; reviewPlan: ReturnType<typeof useProcessApproval>;
    close: ReturnType<typeof useClosePraTender>; next: ReturnType<typeof useContinueTenderPhase>;
    postpone: ReturnType<typeof usePostponeProject>; resume: ReturnType<typeof useResumeProject>;
    outcome: ReturnType<typeof useSetProjectOutcome>;
  };
  function Harness() {
    mutations = { create: useCreateProject(), remove: useDeleteProject("p"), submitPlan: useSubmitProjectPlan("p"),
      assign: useAssignPic("p"), reviewPlan: useProcessApproval(), close: useClosePraTender("p"), next: useContinueTenderPhase("p"), postpone: usePostponeProject(),
      resume: useResumeProject(), outcome: useSetProjectOutcome("p") };
    return null;
  }
  const originalFetch = globalThis.fetch, originalAuth = auth.useAuth;
  const expectedUpdatedAt = "2026-10-08T12:00:00.000Z";
  let actor = { id: "fixture-sales", role: "SALES" }, failRequest = false;
  const writes: Array<{ method: string; path: string; headers: Headers }> = [];
  (auth as any).useAuth = () => ({ user: { ...actor, isActive: true, mustChangePassword: false }, isLoading: false });
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname.replace(/^\/api/, "");
    const method = options?.method || "GET";
    writes.push({ method, path, headers: new Headers(options?.headers) });
    const data = { id: path === "/projects" ? "fixture-created-project" : "p", updated_at: expectedUpdatedAt };
    return new Response(JSON.stringify({ success: !failRequest, data: failRequest ? undefined : data, message: "Fixture response" }), {
      status: failRequest ? 503 : path === "/projects" && method === "POST" ? 201 : 200,
      headers: { "content-type": "application/json" },
    });
  };
  const cases = [
    { name: "create", role: "SALES", path: "/projects", method: "POST", run: () => mutations.create.mutateAsync({ name: "Fixture", customer: "Fixture", scenario_id: "s", estimated_revenue: 1, mom: new File(["fixture"], "mom.pdf", { type: "application/pdf" }), photos: [new File(["fixture"], "photo.png", { type: "image/png" })] }) },
    { name: "delete", role: "SUPER_ADMIN", path: "/projects/p", method: "DELETE", run: () => mutations.remove.mutateAsync("Fixture") },
    { name: "submit plan", role: "SALES", path: "/projects/p/plan/submit", method: "POST", cas: true, run: () => mutations.submitPlan.mutateAsync() },
    { name: "assign PIC", role: "HEAD_SA", path: "/projects/p/assign-pic", method: "POST", run: () => mutations.assign.mutateAsync({ pic_id: "new", expected_pic_revision: "0", request_id: "10000000-0000-4000-8000-000000000001", reason: "Fixture" }) },
    { name: "approve plan", role: "HEAD_SA", path: "/projects/p/plan/approve", method: "POST", run: () => mutations.reviewPlan.mutateAsync({ item: { id: "plan", category: "PROJECT_PLAN", projectId: "p" } as any, action: "APPROVE", picId: "new", expectedPicRevision: "0", requestId: "10000000-0000-4000-8000-000000000002" }) },
    { name: "close Pra-Tender", role: "SALES", path: "/projects/p/phases/pra-tender/close", method: "POST", run: () => mutations.close.mutateAsync() },
    { name: "continue tender", role: "SALES", path: "/projects/p/phases/on-submission-tender", method: "POST", run: () => mutations.next.mutateAsync([]) },
    { name: "postpone", role: "SALES", path: "/projects/p/postpone", method: "POST", cas: true, run: () => mutations.postpone.mutateAsync({ projectId: "p", reason: "Test" }) },
    { name: "resume", role: "SALES", path: "/projects/p/resume", method: "POST", cas: true, run: () => mutations.resume.mutateAsync("p") },
    { name: "WON", role: "SALES", path: "/projects/p/outcome", method: "POST", cas: true, run: () => mutations.outcome.mutateAsync({ outcome: "WON", finalContractValue: 1 }) },
    { name: "LOST", role: "SALES", path: "/projects/p/outcome", method: "POST", cas: true, run: () => mutations.outcome.mutateAsync({ outcome: "LOST", lossReason: "Test" }) },
  ];
  const mount = () => renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Harness)));
  const seedProject = () => client.setQueryData(projectKeys.detailWithoutActivity("p"), { id: "p", updated_at: expectedUpdatedAt });
  try {
    for (const action of cases) {
      actor = { id: `fixture-${action.role}`, role: action.role };
      seedProject(); mount(); keys.length = 0; writes.length = 0;
      await action.run();
      assert(keys.some(key => JSON.stringify(key) === JSON.stringify(dashboardKeys.overview())), `${action.name} must invalidate the exact overview prefix, including activity pages`);
      assert.equal(writes.length, 1, `${action.name} must issue its actual mutation once`);
      assert.equal(writes[0].path, action.path); assert.equal(writes[0].method, action.method);
      if (action.cas) {
        assert.equal(writes[0].headers.get("x-business-expected-updated-at"), expectedUpdatedAt, "Use cached server CAS state, not a bypass");
        assert.match(writes[0].headers.get("x-business-request-id") || "", /^[0-9a-f-]{36}$/i);
      }
      if (action.name === "create") assert.match(writes[0].headers.get("x-project-create-request-id") || "", /^[0-9a-f-]{36}$/i, "Creation retains its receipt contract");
    }
    seedProject(); mount(); keys.length = 0; failRequest = true;
    await assert.rejects(() => mutations.outcome.mutateAsync({ outcome: "WON", finalContractValue: 1 }), (error: any) => error.status === 503);
    assert(!keys.some(key => JSON.stringify(key) === JSON.stringify(dashboardKeys.overview())), "Failed outcome save must not perform success invalidation");
    console.log("Dashboard phase panel: selection/refresh/locale, chart and legend, percentages/empty/error/retry, EN/ID and 11 real mutation hooks with auth/CAS/receipt invalidation passed.");
  } finally { globalThis.fetch = originalFetch; (auth as any).useAuth = originalAuth; client.clear(); }

}
void checkInvalidation().catch(error => { console.error(error); process.exitCode = 1; });
