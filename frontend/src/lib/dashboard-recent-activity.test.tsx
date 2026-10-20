import assert from "node:assert/strict";
import React, { isValidElement } from "react";
import { RecentActivityPanel } from "../components/dashboard/recent-activity-panel";
import { ActivityFilters } from "../components/dashboard/activity-filters";
import { EMPTY_ACTIVITY_FILTERS } from "./dashboard-activity-filters";
import { Button } from "../components/ui/button";
import * as language from "../components/i18n/language-provider";
import * as dashboard from "../hooks/use-dashboard";
import { setActiveLanguage, translate } from "../i18n";
import type { RecentActivity, DashboardActivityFilters } from "../types/dashboard";

const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : !isValidElement(node) ? [] : [node, ...nodes((node.props as any).children)];
const original = { state: React.useState, effect: React.useEffect, language: language.useLanguage, activity: dashboard.useDashboardActivity };
const states: any[] = []; let index = 0, changed = false, effects: Array<() => void> = [];
let effectIndex = 0; const effectDeps: any[][] = [];
(React as any).useState = (initial: any) => {
  const slot = index++; if (slot === 0 && !states.length) effectDeps.length = 0;
  if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
  return [states[slot], (value: any) => { const next = typeof value === "function" ? value(states[slot]) : value; if (!Object.is(next, states[slot])) { states[slot] = next; changed = true; } }];
};
(React as any).useEffect = (effect: () => void, deps: any[]) => { const slot = effectIndex++; if (!effectDeps[slot] || deps.some((dep, i) => !Object.is(dep, effectDeps[slot][i]))) { effectDeps[slot] = deps; effects.push(effect); } };
(language as any).useLanguage = () => ({ t: translate });
const all: RecentActivity[] = Array.from({ length: 19 }, (_, i) => ({ id: `activity-${i + 1}`, action: "PROJECT_CREATED", entityType: "ACTIVITY_LOG", details: "Fixture activity",
  createdAt: new Date(Date.UTC(2026, 9, 8, 12) - i * 60_000).toISOString(), user: { id: "actor", fullName: "Fixture actor", role: "SALES" },
  project: { id: `project-${i + 1}`, name: `Fixture project ${i + 1}`, projectCode: "fixture" } }));
let source = all, mode: "ready" | "pending" | "error" | "empty" = "ready", canRead = true, retries = 0;
const requests: Array<number | null> = [];
const requestFilters: DashboardActivityFilters[] = [];
const props = { activities: all.slice(0, 8), pagination: { page: 1, total: 19, totalPages: 3, pageSize: 8, nextCursor: "cursor-8" as string | null }, scopeKey: "sales-1:SALES", loading: false, hasError: false,
  onRetry: () => { retries++; } };
(dashboard as any).useDashboardActivity = (requested: number | null, _enabled: boolean, filters: DashboardActivityFilters = {}) => {
  requests.push(requested);
  requestFilters.push(filters);
  const filtered = source.filter(item => (!filters.projectId || item.project?.id === filters.projectId) && (!filters.kind || filters.kind === 'PROJECT'));
  const page = Math.min(requested || 1, Math.max(1, Math.ceil(filtered.length / 8)));
  const start = (page - 1) * 8;
  return { canRead, isAccessLoading: false, isPending: mode === "pending", isFetching: mode === "pending", isError: mode === "error",
    data: requested && (mode === "ready" || mode === "empty") ? { page, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / 8)), items: mode === "empty" ? [] : filtered.slice(start, start + 8), nextCursor: mode !== "empty" && filtered.length > start + 8 ? `cursor-${start + 8}` : null, pageSize: 8 } : undefined,
    refetch: () => { retries++; } };
};
const render = () => {
  let result: any, attempts = 0;
  do { changed = false; index = 0; effectIndex = 0; effects = []; result = RecentActivityPanel(props); effects.forEach(effect => effect()); assert(++attempts < 5); } while (changed);
  return nodes(result);
};
const button = (tree: any[], key: "dashboardPage.activityPrevious" | "common.next" | "dashboardPage.activityGo") => tree.find(node => node.type === Button && node.props.children === translate(key));
const expectPage = (tree: any[], expected: RecentActivity[]) => {
  assert.deepEqual(tree.filter(node => node.key?.startsWith("activity-")).map(node => node.key), expected.map(item => item.id));
  for (const item of expected) assert.equal(tree.find(node => node.key === item.id)!.props.href, item.project ? `/projects/${item.project.id}` : undefined);
};
try {
  for (const count of [0, 8, 9, 17, 19]) {
    states.length = 0; source = all.slice(0, count); props.activities = source.slice(0, 8); props.pagination.nextCursor = count > 8 ? "cursor-8" : null;
    props.pagination.total = count; props.pagination.totalPages = Math.max(1, Math.ceil(count / 8));
    setActiveLanguage("en"); mode = "ready";
    let tree = render(); expectPage(tree, source.slice(0, 8)); assert.equal(requests.at(-1), null, "First page reuses overview without another GET");
    if (!count) { assert(tree.some(node => node.props.children === translate("copy.noRecentActivity"))); assert(!tree.some(node => node.type === "nav")); continue; }
    assert.equal(button(tree, "dashboardPage.activityPrevious").props.disabled, true);
    assert.equal(button(tree, "common.next").props.disabled, count <= 8);
    if (count > 8) {
      button(tree, "common.next").props.onClick(); mode = "pending"; tree = render();
      assert.equal(requests.at(-1), 2, "Next requests item 9 onward from API");
      assert(tree.some(node => node.props.role === "status")); assert.equal(button(tree, "common.next").props.disabled, true); assert.equal(button(tree, "dashboardPage.activityPrevious").props.disabled, true);
      mode = "ready"; tree = render(); expectPage(tree, source.slice(8, 16));
      setActiveLanguage("id"); tree = render(); expectPage(tree, source.slice(8, 16)); assert(tree.some(node => node.props.children === `Halaman 2 dari ${Math.ceil(count / 8)}`));
      if (count > 16) { button(tree, "common.next").props.onClick(); tree = render(); expectPage(tree, source.slice(16)); assert.equal(requests.at(-1), 3);
        assert.equal(button(tree, "common.next").props.disabled, true); button(tree, "dashboardPage.activityPrevious").props.onClick(); tree = render(); expectPage(tree, source.slice(8, 16)); }
      button(tree, "dashboardPage.activityPrevious").props.onClick(); tree = render(); expectPage(tree, source.slice(0, 8)); assert.equal(requests.at(-1), null);
    }
  }
  source = all; props.activities = all.slice(0, 8); props.pagination.nextCursor = "cursor-8"; props.pagination.total = 19; props.pagination.totalPages = 3; states.length = 0;
  let jumpTree = render();
  for (const invalid of ["", "0", "4", "1.5", "NaN"]) {
    jumpTree.find(node => node.type === "input").props.onChange({ target: { value: invalid } }); jumpTree = render();
    assert.equal(button(jumpTree, "dashboardPage.activityGo").props.disabled, true);
  }
  jumpTree.find(node => node.type === "input").props.onChange({ target: { value: "3" } }); jumpTree = render();
  assert.equal(button(jumpTree, "dashboardPage.activityGo").props.disabled, false);
  const beforeJump = requests.length;
  jumpTree.find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); jumpTree = render();
  expectPage(jumpTree, all.slice(16)); assert.equal(requests.at(-1), 3);
  assert(!requests.slice(beforeJump).includes(2), "Jump fetches target page directly without loading intermediate pages");
  assert.equal(button(jumpTree, "dashboardPage.activityGo").props.disabled, true, "Current page needs no duplicate request");
  source = all.slice(0, 9); jumpTree = render(); expectPage(jumpTree, source.slice(8));
  assert(jumpTree.some(node => node.props.children === "Halaman 2 dari 2"), "A shrinking history uses the canonical page returned by the server");
  source = all; states.length = 0;
  let tree = render(); button(tree, "common.next").props.onClick(); mode = "error"; tree = render();
  assert(tree.some(node => node.props.role === "alert")); assert(!tree.some(node => node.props.children === translate("copy.noRecentActivity")));
  assert.equal(button(tree, "common.next").props.disabled, true); assert.equal(button(tree, "dashboardPage.activityPrevious").props.disabled, false);
  tree.find(node => node.type === Button && node.props.children === translate("common.retry")).props.onClick(); assert.equal(retries, 1);
  mode = "ready"; tree = render(); expectPage(tree, all.slice(8, 16));
  mode = "empty"; tree = render(); assert(tree.some(node => node.props.children === translate("copy.noRecentActivity")));
  assert.equal(button(tree, "dashboardPage.activityPrevious").props.disabled, false, "An empty later page still permits Previous");
  mode = "ready"; props.scopeKey = "sales-2:SALES"; tree = render(); expectPage(tree, props.activities); assert.equal(requests.at(-1), null, "Account changes clear cursor history");
  button(tree, "common.next").props.onClick(); tree = render(); props.scopeKey = "sales-2:SALES:new-filter"; tree = render(); assert.equal(requests.at(-1), null);
  const controls = (result: any[]) => result.find(node => node.type === ActivityFilters).props;
  controls(tree).onChange({ ...EMPTY_ACTIVITY_FILTERS, kind: 'PROJECT' }); tree = render();
  assert.equal(requests.at(-1), null, 'Editing a draft does not fetch');
  controls(tree).onApply(); tree = render(); assert.equal(requests.at(-1), 1, 'Filtered page 1 comes from server');
  assert.deepEqual(requestFilters.at(-1), { kind: 'PROJECT' });
  button(tree, 'common.next').props.onClick(); tree = render(); expectPage(tree, all.slice(8, 16));
  assert.equal(requestFilters.at(-1)?.kind, 'PROJECT', 'Paging preserves applied filters');
  setActiveLanguage('en'); tree = render(); assert.equal(controls(tree).draft.kind, 'PROJECT', 'Locale preserves selection');
  controls(tree).onChange({ ...EMPTY_ACTIVITY_FILTERS, projectId: 'project-1', kind: 'PROJECT' }); tree = render();
  controls(tree).onApply(); tree = render(); assert.equal(requests.at(-1), 1, 'Applying changes resets later page'); expectPage(tree, all.slice(0, 1));
  controls(tree).onChange({ ...EMPTY_ACTIVITY_FILTERS, kind: 'DOCUMENT' }); tree = render(); controls(tree).onApply(); tree = render();
  assert(tree.some(node => node.props.children === translate('activityFilters.noMatches')));
  controls(tree).onReset(); tree = render(); assert.equal(requests.at(-1), null); expectPage(tree, props.activities);
  controls(tree).onChange({ ...EMPTY_ACTIVITY_FILTERS, kind: 'PROJECT' }); tree = render(); controls(tree).onApply(); tree = render();
  props.scopeKey = 'new-account:SA'; tree = render(); assert.equal(requests.at(-1), null); assert.equal(controls(tree).draft.kind, '');
  props.hasError = true; tree = render(); assert(tree.some(node => node.props.role === "alert")); assert.equal(button(tree, "common.next").props.disabled, true);
  canRead = false; props.activities = []; tree = render(); const before = retries; tree.find(node => node.type === Button && node.props.children === translate("common.retry")).props.onClick(); assert.equal(retries, before, "No disabled-account manual refetch");
  props.hasError = false; props.loading = true; tree = render(); assert(tree.some(node => node.props.role === "status"));
  console.log("Recent activity: totals, direct jump, server filters, draft/apply/reset, empty matches, filtered paging, account reset, locale persistence and pending/error/retry passed");
} finally { (React as any).useState = original.state; (React as any).useEffect = original.effect; (language as any).useLanguage = original.language; (dashboard as any).useDashboardActivity = original.activity; setActiveLanguage("en"); }
