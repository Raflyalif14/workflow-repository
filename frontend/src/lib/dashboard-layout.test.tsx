import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as auth from "../components/auth/auth-provider";
import * as language from "../components/i18n/language-provider";
import * as dashboard from "../hooks/use-dashboard";
import * as approvals from "../hooks/use-approvals";
import * as projects from "../hooks/use-projects";
import DashboardPage from "../app/page";
import { AppShell } from "../components/app-shell";
import { setActiveLanguage, translate } from "../i18n";

const originals = { auth: auth.useAuth, language: language.useLanguage, dashboard: dashboard.useDashboard,
  stats: approvals.useApprovalStats, approvals: approvals.useApprovals, activity: dashboard.useDashboardActivity,
  projects: projects.useProjects, assigned: projects.useMyAssignedMilestones };
let role = "HEAD_SA", mode: "ready" | "empty" | "loading" | "error" = "ready";
const query = (data: unknown) => ({ data: mode === "ready" || mode === "empty" ? data : undefined,
  isLoading: mode === "loading", isFetching: false, isError: mode === "error", refetch() {} });
(auth as any).useAuth = () => ({ user: { id: "owner", fullName: "Fixture", role, isActive: true } });
(language as any).useLanguage = () => ({ t: translate });
(projects as any).useProjects = () => query({ projects: mode === "empty" ? [] : [{ id: "p", name: "Fixture project",
  sales_id: "owner", status: role === "SALES" ? "WAITING_RESULT" : "ACTIVE", is_postponed: false,
  customer: "Fixture customer", estimated_revenue: 100, currentRole: "SA", currentStage: "Fixture current stage", pic: { id: "sa", fullName: "Fixture SA" } },
  ...(role === "HEAD_SA" ? [{ id: "draft", name: "Fixture waiting", status: "DRAFT", currentRole: "SALES" }] : [])] });
(projects as any).useMyAssignedMilestones = () => query([]);
(approvals as any).useApprovals = () => query([]);
(approvals as any).useApprovalStats = (enabled: boolean) => {
  assert.equal(enabled, role === "HEAD_SA" || role === "SUPER_ADMIN");
  return query({ totalPending: 1, pendingDocs: 1 });
};
(dashboard as any).useDashboard = () => query({
  summary: { totalProjects: 1, activeProjects: 1, completedProjects: 0, onHoldProjects: 0, overdueMilestones: 1, waitingApproval: 1 },
  projectProgress: mode === "empty" ? [] : [{ id: "p", name: "Fixture project", status: "ACTIVE", percentage: 30,
    totalMilestones: 3, completedMilestones: 1, overdueMilestones: role === "SUPER_ADMIN" ? 1 : 0 }],
  recentActivity: [], saWorkload: [], salesResults: null,
  headSaProjectValues: { active: { count: 1, estimatedRevenue: 100 }, won: { count: 0, finalContractValue: 0 } },
  allWorkStatus: { total: 1, planning: 0, active: 1, postponed: 0, completed: 0, won: 0, lost: 0, waitingResult: 0, cancelled: 0 },
  outputDocuments: { salesProgress: [],
    reviewQueue: mode === "ready" && role === "HEAD_SA" ? [{ projectId: "p", milestoneId: "m", projectName: "Fixture review", count: 1 }] : [],
    revisionQueue: mode === "ready" && role === "SA" ? [{ projectId: "p", milestoneId: "m", projectName: "Fixture revision", count: 1 }] : [] },
});
(dashboard as any).useDashboardActivity = () => ({ canRead: true, isAccessLoading: false,
  isPending: false, isFetching: false, isError: false, refetch() {} });
const render = () => renderToStaticMarkup(createElement(DashboardPage));
try {
  for (const locale of ["en", "id"] as const) {
    setActiveLanguage(locale);
    for (const current of ["SALES", "SA", "HEAD_SA", "SUPER_ADMIN"]) {
      role = current; mode = "ready";
      const html = render();
      const order = ["next-task-heading", "project-delivery-heading", "dashboard-summary-heading", "delivery-health-heading", "recent-activity-heading"]
        .map(id => html.indexOf(`id="${id}"`));
      assert(order.every(index => index >= 0));
      assert(order.every((index, n) => n === 0 || index > order[n - 1]), "Work precedes project context, summaries and activity");
      assert(html.includes(translate("dashboardPage.summary")));
      assert.equal(html.includes('id="sa-workload-heading"'), role === "HEAD_SA");
      assert.equal(html.includes('id="head-sa-project-values-heading"'), role === "HEAD_SA");
      if (role === "HEAD_SA" || role === "SA") assert(html.includes('href="/projects/p#milestone-outputs-m"'), "Review/revision opens the existing workspace");
      if (role === "HEAD_SA") assert(html.includes(translate("dashboardPage.waitingOnOthers")), "Waiting information is distinguished from actions");
      assert(!html.includes('action="'), "Dashboard never adds direct approval mutations");
      const deliverySection = html.split('aria-labelledby="project-delivery-heading"')[1].split('id="dashboard-summary-heading"')[0];
      assert(deliverySection.includes('href="/projects/p"') && deliverySection.includes("Fixture SA"));
      assert(deliverySection.includes("Fixture current stage"), "Current work remains visible");
      if (role !== "SALES") {
        assert(deliverySection.includes('class="delivery-row"') && deliverySection.includes('class="delivery-columns'));
        assert(deliverySection.includes("30%") && deliverySection.includes(translate("dashboardPage.stages", { done: 1, total: 3 })), "Progress and stage counts are preserved");
        assert(deliverySection.includes('style="width:30%"'), "Compact bar uses existing progress");
        assert(!deliverySection.includes("2xl:"), "Delivery layout uses panel width rather than viewport 2xl");
        assert(deliverySection.includes(translate("common.open")) && deliverySection.includes("w-fit"));
        if (role === "SA" || role === "SUPER_ADMIN") assert(deliverySection.includes("Fixture customer") && deliverySection.includes(translate("copy.deadline")), "Supplementary customer and deadline remain visible");
      }

    }
    role = "HEAD_SA"; mode = "loading";
    assert(render().includes(translate("dashboardPage.loadingNext")));
    mode = "error";
    const failed = render();
    assert(failed.includes('role="alert"') && failed.includes(translate("common.retry")));
    const summary = failed.slice(failed.indexOf('id="dashboard-summary-heading"'), failed.indexOf('id="delivery-health-heading"'));
    assert(!summary.includes("<dl"), "Failed metric inputs are not displayed as valid zeros");
    mode = "empty"; assert(render().includes(translate("copy.queueClear")));

    role = "SALES"; mode = "empty";
    const clear = render();
    assert.equal(clear.split(translate("copy.queueClear")).length - 1, 1, "Sales has one empty-state message");
    assert(!clear.includes('id="quick-insights-heading"'), "Equivalent empty insights are merged");
    assert(clear.includes('id="next-task-heading"') && clear.includes('href="/projects"'), "Workspace and full queue remain reachable");
    mode = "loading"; assert(render().includes('id="quick-insights-heading"'), "Do not treat unresolved work as empty");
    mode = "error"; assert(render().includes('id="quick-insights-heading"'), "Do not merge failed sources into empty success");
    const originalFixtureProjects = projects.useProjects;
    const waiting = { id: "wait", name: "Fixture waiting", sales_id: "owner", status: "DRAFT", currentRole: "HEAD_SA", is_postponed: false };
    try {
      mode = "ready";
      (projects as any).useProjects = () => query({ projects: [waiting] });
      const waitingOnly = render();
      assert(waitingOnly.includes('id="quick-insights-heading"') && waitingOnly.includes('href="/projects/wait"'), "Waiting-only work remains visible and linked");
      assert(waitingOnly.includes(translate("dashboardPage.waitingOnOthers")));
      assert(waitingOnly.includes(translate("dashboardPage.noDirectSalesAction")) && !waitingOnly.includes(translate("copy.queueClear")), "Waiting is not described as a clear queue");
      (projects as any).useProjects = () => query({ projects: [waiting, {
        id: "result", name: "Fixture result", sales_id: "owner", status: "WAITING_RESULT", is_postponed: false,
      }] });
      const distinct = render();
      assert(distinct.includes('href="/projects/result"') && distinct.includes('href="/projects/wait"'), "Distinct action and waiting destinations are both retained");
      assert(distinct.includes('id="next-task-heading"') && distinct.includes('id="quick-insights-heading"'));
      const longName = "Fixture project with a long customer and solution name";
      (projects as any).useProjects = () => query({ projects: [{ id: "p", name: longName, sales_id: "owner", status: "ACTIVE", is_postponed: false,
        estimated_revenue: 123456789, currentStage: "Fixture technical stage", pic: { id: "sa", fullName: "Fixture SA" },
      }] });
      const delivery = render().split('id="project-delivery-heading"')[1].split('id="dashboard-summary-heading"')[0];
      assert(delivery.includes(translate("copy.estimatedRevenue")), "Sales identifies estimate, not final contract value");
      assert(delivery.includes('href="/projects/p"') && delivery.includes("Fixture technical stage") && delivery.includes("Fixture SA"));
      assert(delivery.includes("123.456.789") || delivery.includes("123,456,789"));
      assert(delivery.includes("30%"), "Available project progress is shown when output scope is unavailable");
    } finally { (projects as any).useProjects = originalFixtureProjects; }
  }
  console.log("Dashboard layout: four roles, EN/ID, workspace links, section priority and loading/error/empty passed");
} finally {
  (auth as any).useAuth = originals.auth; (language as any).useLanguage = originals.language;
  (dashboard as any).useDashboardActivity = originals.activity;
  (dashboard as any).useDashboard = originals.dashboard; (approvals as any).useApprovalStats = originals.stats;
  (approvals as any).useApprovals = originals.approvals; (projects as any).useProjects = originals.projects;
  (projects as any).useMyAssignedMilestones = originals.assigned; setActiveLanguage("en");
}

// Exercise the actual drawer effect with an isolated DOM boundary, without a browser dependency.
const oldState = React.useState, oldEffect = React.useEffect;
const originalDocument = globalThis.document, originalWindow = globalThis.window;
const keyListeners = new Map<string, (event: any) => void>(), windowListeners = new Map<string, () => void>();
let effect: (() => void | (() => void)) | undefined, index = 0, drawerOpen = true;
const changes: boolean[] = [];
const documentFixture: any = { body: { style: { overflow: "auto" } } };
const node = () => ({ focus() { documentFixture.activeElement = this; }, getClientRects: () => [{}] });
const opener = node(), first = node(), last = node();
documentFixture.activeElement = opener;
documentFixture.getElementById = () => ({ querySelectorAll: () => [first, last] });
documentFixture.addEventListener = (name: string, handler: any) => keyListeners.set(name, handler);
documentFixture.removeEventListener = (name: string) => keyListeners.delete(name);
(globalThis as any).document = documentFixture;
(globalThis as any).window = { matchMedia: () => ({ matches: true }),
  addEventListener: (name: string, handler: any) => windowListeners.set(name, handler),
  removeEventListener: (name: string) => windowListeners.delete(name) };
(React as any).useState = () => [index++ === 0 ? false : drawerOpen, (value: boolean) => changes.push(value)];
(React as any).useEffect = (handler: any) => { effect = handler; };
let cleanup: void | (() => void) = undefined;
try {
  AppShell({ children: null }); cleanup = effect!();
  assert.equal(documentFixture.activeElement, first); assert.equal(documentFixture.body.style.overflow, "hidden");
  let prevented = 0;
  const key = (value: string, shiftKey = false) => keyListeners.get("keydown")!({ key: value, shiftKey, preventDefault() { prevented++; } });
  last.focus(); key("Tab"); assert.equal(documentFixture.activeElement, first);
  key("Tab", true); assert.equal(documentFixture.activeElement, last);
  key("Escape"); assert.deepEqual(changes, [false]); assert.equal(prevented, 3);
  windowListeners.get("resize")!(); assert.deepEqual(changes, [false, false], "Desktop resize closes the drawer");
  cleanup!(); cleanup = undefined;
  assert.equal(documentFixture.activeElement, opener); assert.equal(documentFixture.body.style.overflow, "auto");
  assert.equal(keyListeners.size + windowListeners.size, 0);
  index = 0; drawerOpen = false; AppShell({ children: null }); assert.equal(effect!(), undefined);
  assert.equal(documentFixture.body.style.overflow, "auto", "Closed navigation does not lock scrolling or keyboard");
  console.log("Mobile drawer: focus loop, Escape, scroll restoration, desktop resize and closed state passed");
} finally {
  cleanup?.(); (React as any).useState = oldState; (React as any).useEffect = oldEffect;
  (globalThis as any).document = originalDocument; (globalThis as any).window = originalWindow;
}
