import assert from "node:assert/strict";
import React, { isValidElement, type ReactNode } from "react";
const queryHooks: typeof import("@tanstack/react-query") = require("@tanstack/react-query");
import * as sessionHooks from "../hooks/use-repository-session";
import * as languageProvider from "../components/i18n/language-provider";
import { getAuthSession, setAuthTokens, clearStoredAuth } from "./auth";
import { GoogleCalendarSettings } from "../components/settings/google-calendar-settings";
import { Button } from "../components/ui/button";
import { setActiveLanguage, translate } from "../i18n";

type Element = React.ReactElement<any>;
const elements = (node: ReactNode): Element[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const el = node as Element;
  if (typeof el.type === "function") {
    try {
      return [el, ...elements((el.type as any)(el.props))];
    } catch {
      return [el, ...elements(el.props.children)];
    }
  }
  return [el, ...elements(el.props.children)];
};

async function run() {
  const originals = {
    state: React.useState,
    useQuery: queryHooks.useQuery,
    useQueryClient: queryHooks.useQueryClient,
    session: sessionHooks.useRepositorySession,
    language: languageProvider.useLanguage,
    fetch: globalThis.fetch,
    window: (globalThis as any).window,
  };

  let statusPayload: any = { configured: true, status: "DISCONNECTING", lastSyncedAt: null, lastError: null };
  let capturedQueryOptions: any = null;
  let invalidated = 0;
  let refetched = 0;
  const fetchCalls: Array<{ url: string; method: string }> = [];
  const states: any[] = [];
  let si = 0;

  const storage = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    location: { assign: () => {} },
  };
  setAuthTokens({ accessToken: "fixture" });
  (React as any).useState = (initial: any) => {
    const i = si++;
    if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
    return [states[i], (next: any) => { states[i] = typeof next === "function" ? next(states[i]) : next; }];
  };
  (sessionHooks as any).useRepositorySession = () => ({
    enabled: true,
    key: ["user-1", "sess-1"],
    session: getAuthSession(),
  });
  (languageProvider as any).useLanguage = () => ({
    t: translate,
    formatDate: (v: string) => v,
  });
  (queryHooks as any).useQueryClient = () => ({
    invalidateQueries: async () => { invalidated += 1; },
  });
  (queryHooks as any).useQuery = (options: any) => {
    capturedQueryOptions = options;
    return {
      isLoading: false,
      isError: false,
      data: statusPayload,
      refetch: async () => {
        refetched += 1;
        return { data: statusPayload };
      },
    };
  };
  globalThis.fetch = (async (url: any, init: any) => {
    fetchCalls.push({ url: String(url), method: init?.method || "GET" });
    statusPayload = { configured: true, status: "NOT_CONNECTED", lastSyncedAt: null, lastError: null };
    return new Response(JSON.stringify({ success: true, data: { disconnecting: false, disconnected: true, status: "NOT_CONNECTED" } }), { status: 200 });
  }) as typeof fetch;

  const render = () => {
    si = 0;
    return elements(GoogleCalendarSettings());
  };

  try {
    // 1. DISCONNECTING status shows ellipsis copy (no '?') and Retry disconnect button
    for (const locale of ["en", "id"] as const) {
      setActiveLanguage(locale);
      assert(translate("googleCalendar.disconnecting").endsWith("..."), "Disconnecting text must use ellipsis instead of '?'");
      assert(!translate("googleCalendar.disconnecting").includes("?"));
      assert(!translate("googleCalendar.connected").includes("?"));
      assert(!translate("googleCalendar.disconnectHelp").includes("?"));

      const tree = render();
      assert(tree.some((n) => n.props.children === translate("googleCalendar.disconnecting")));
      const retryBtn = tree.find((n) => n.type === Button && n.props.children === translate("googleCalendar.retryDisconnect"));
      assert(retryBtn, "DISCONNECTING state must still offer Retry disconnect action so user is never trapped");
    }

    setActiveLanguage("en");
    assert.equal(capturedQueryOptions.refetchInterval({ state: { data: { status: "DISCONNECTING" } } }), 3000);
    assert.equal(capturedQueryOptions.refetchInterval({ state: { data: { status: "CONNECTED" } } }), 30000);

    // 2. Clicking Retry disconnect invokes POST /google-calendar/disconnect, invalidates and refetches into NOT_CONNECTED
    const treeBefore = render();
    const retryBtn = treeBefore.find((n) => n.type === Button && n.props.children === translate("googleCalendar.retryDisconnect"))!;
    retryBtn.props.onClick();
    await new Promise((resolve) => setImmediate(resolve));

    assert(fetchCalls.some((c) => c.url.includes("/google-calendar/disconnect") && c.method === "POST"));
    assert.equal(invalidated, 1);
    assert.equal(refetched, 1);

    const treeAfter = render();
    assert(
      treeAfter.some((n) => n.type === Button && n.props.children === translate("googleCalendar.connect")),
      "Connect Google Calendar button becomes available immediately after disconnect finishes"
    );

    console.log("PASS Google Calendar settings disconnect recovery, polling, i18n copy, and reconnect visibility");
  } finally {
    React.useState = originals.state;
    (queryHooks as any).useQuery = originals.useQuery;
    (queryHooks as any).useQueryClient = originals.useQueryClient;
    (sessionHooks as any).useRepositorySession = originals.session;
    (languageProvider as any).useLanguage = originals.language;
    globalThis.fetch = originals.fetch;
    clearStoredAuth({ notify: false });
    (globalThis as any).window = originals.window;
    setActiveLanguage("en");
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
