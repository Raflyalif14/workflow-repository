import assert from "node:assert/strict";
import React, { isValidElement } from "react";
import { RecentActivityPanel } from "../components/dashboard/recent-activity-panel";
import { Button } from "../components/ui/button";
import * as language from "../components/i18n/language-provider";
import * as dashboard from "../hooks/use-dashboard";
import { setActiveLanguage, translate } from "../i18n";
import type { RecentActivity } from "../types/dashboard";

const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : !isValidElement(node) ? [] : [node, ...nodes((node.props as any).children)];
const original = { state: React.useState, effect: React.useEffect, language: language.useLanguage, activity: dashboard.useDashboardActivity };
const states: any[] = []; let index = 0, changed = false, effects: Array<() => void> = [];
(React as any).useState = (initial: any) => {
  const slot = index++; if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
  return [states[slot], (value: any) => { states[slot] = typeof value === "function" ? value(states[slot]) : value; changed = true; }];
};
(React as any).useEffect = (effect: () => void) => effects.push(effect);
(language as any).useLanguage = () => ({ t: translate });
const all: RecentActivity[] = Array.from({ length: 19 }, (_, i) => ({ id: `activity-${i + 1}`, action: "PROJECT_CREATED", entityType: "ACTIVITY_LOG", details: "Fixture activity",
  createdAt: new Date(Date.UTC(2026, 9, 8, 12) - i * 60_000).toISOString(), user: { id: "actor", fullName: "Fixture actor", role: "SALES" },
  project: { id: `project-${i + 1}`, name: `Fixture project ${i + 1}`, projectCode: "fixture" } }));
let source = all, mode: "ready" | "pending" | "error" | "empty" = "ready", canRead = true, retries = 0;
const requests: Array<string | null> = [];
const props = { activities: all.slice(0, 8), pagination: { pageSize: 8, nextCursor: "cursor-8" as string | null }, scopeKey: "sales-1:SALES", loading: false, hasError: false,
  onRetry: () => { retries++; } };
(dashboard as any).useDashboardActivity = (cursor: string | null) => {
  requests.push(cursor);
  const start = cursor ? Number(cursor.split("-")[1]) : 0;
  return { canRead, isAccessLoading: false, isPending: mode === "pending", isFetching: mode === "pending", isError: mode === "error",
    data: cursor && mode === "ready" ? { items: source.slice(start, start + 8), nextCursor: source.length > start + 8 ? `cursor-${start + 8}` : null, pageSize: 8 }
      : cursor && mode === "empty" ? { items: [], nextCursor: null, pageSize: 8 } : undefined,
    refetch: () => { retries++; } };
};
const render = () => {
  let result: any, attempts = 0;
  do { changed = false; index = 0; effects = []; result = RecentActivityPanel(props); effects.forEach(effect => effect()); assert(++attempts < 5); } while (changed);
  return nodes(result);
};
const button = (tree: any[], key: "dashboardPage.activityPrevious" | "common.next") => tree.find(node => node.type === Button && node.props.children === translate(key));
const expectPage = (tree: any[], expected: RecentActivity[]) => {
  assert.deepEqual(tree.filter(node => node.key?.startsWith("activity-")).map(node => node.key), expected.map(item => item.id));
  for (const item of expected) assert.equal(tree.find(node => node.key === item.id)!.props.href, item.project ? `/projects/${item.project.id}` : undefined);
};
try {
  for (const count of [0, 8, 9, 17, 19]) {
    states.length = 0; source = all.slice(0, count); props.activities = source.slice(0, 8); props.pagination.nextCursor = count > 8 ? "cursor-8" : null;
    setActiveLanguage("en"); mode = "ready";
    let tree = render(); expectPage(tree, source.slice(0, 8)); assert.equal(requests.at(-1), null, "First page reuses overview without another GET");
    if (!count) { assert(tree.some(node => node.props.children === translate("copy.noRecentActivity"))); assert(!tree.some(node => node.type === "nav")); continue; }
    assert.equal(button(tree, "dashboardPage.activityPrevious").props.disabled, true);
    assert.equal(button(tree, "common.next").props.disabled, count <= 8);
    if (count > 8) {
      button(tree, "common.next").props.onClick(); mode = "pending"; tree = render();
      assert.equal(requests.at(-1), "cursor-8", "Next requests item 9 onward from API");
      assert(tree.some(node => node.props.role === "status")); assert.equal(button(tree, "common.next").props.disabled, true); assert.equal(button(tree, "dashboardPage.activityPrevious").props.disabled, true);
      mode = "ready"; tree = render(); expectPage(tree, source.slice(8, 16));
      setActiveLanguage("id"); tree = render(); expectPage(tree, source.slice(8, 16)); assert(tree.some(node => node.props.children === "Halaman 2"));
      assert(!tree.some(node => typeof node.props.children === "string" && /Halaman 2 dari/.test(node.props.children)), "No invented total history");
      if (count > 16) { button(tree, "common.next").props.onClick(); tree = render(); expectPage(tree, source.slice(16)); assert.equal(requests.at(-1), "cursor-16");
        assert.equal(button(tree, "common.next").props.disabled, true); button(tree, "dashboardPage.activityPrevious").props.onClick(); tree = render(); expectPage(tree, source.slice(8, 16)); }
      button(tree, "dashboardPage.activityPrevious").props.onClick(); tree = render(); expectPage(tree, source.slice(0, 8)); assert.equal(requests.at(-1), null);
    }
  }
  source = all; props.activities = all.slice(0, 8); props.pagination.nextCursor = "cursor-8"; states.length = 0;
  let tree = render(); button(tree, "common.next").props.onClick(); mode = "error"; tree = render();
  assert(tree.some(node => node.props.role === "alert")); assert(!tree.some(node => node.props.children === translate("copy.noRecentActivity")));
  assert.equal(button(tree, "common.next").props.disabled, true); assert.equal(button(tree, "dashboardPage.activityPrevious").props.disabled, false);
  tree.find(node => node.type === Button && node.props.children === translate("common.retry")).props.onClick(); assert.equal(retries, 1);
  mode = "ready"; tree = render(); expectPage(tree, all.slice(8, 16));
  mode = "empty"; tree = render(); assert(tree.some(node => node.props.children === translate("copy.noRecentActivity")));
  assert.equal(button(tree, "dashboardPage.activityPrevious").props.disabled, false, "An empty later page still permits Previous");
  mode = "ready"; props.scopeKey = "sales-2:SALES"; tree = render(); expectPage(tree, props.activities); assert.equal(requests.at(-1), null, "Account changes clear cursor history");
  button(tree, "common.next").props.onClick(); tree = render(); props.scopeKey = "sales-2:SALES:new-filter"; tree = render(); assert.equal(requests.at(-1), null);
  props.hasError = true; tree = render(); assert(tree.some(node => node.props.role === "alert")); assert.equal(button(tree, "common.next").props.disabled, true);
  canRead = false; props.activities = []; tree = render(); const before = retries; tree.find(node => node.type === Button && node.props.children === translate("common.retry")).props.onClick(); assert.equal(retries, before, "No disabled-account manual refetch");
  props.hasError = false; props.loading = true; tree = render(); assert(tree.some(node => node.props.role === "status"));
  console.log("Recent activity: 0/8/9/17/19, server pages, cursor Next/Previous, links/order, account/filter reset, locale persistence, pending/error/retry and empty-page return passed");
} finally { (React as any).useState = original.state; (React as any).useEffect = original.effect; (language as any).useLanguage = original.language; (dashboard as any).useDashboardActivity = original.activity; setActiveLanguage("en"); }
