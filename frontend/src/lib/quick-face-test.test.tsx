import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as api from "./api-client";
import * as quick from "./quick-face-test";
import { useQuickFaceTest } from "@/hooks/use-quick-face-test";
import { QuickFaceTest, QuickFaceResult } from "@/components/settings/quick-face-test";
import QuickPage from "@/app/settings/face-verification/quick/page";
import * as auth from "@/components/auth/auth-provider";
import * as language from "@/components/i18n/language-provider";
import { clearStoredAuth } from "./auth";
import { setActiveLanguage, translate } from "@/i18n";
import { en } from "@/i18n/en";
import { id } from "@/i18n/id";
import type { TemporaryPhoto } from "./face-photo";
import type { PadResult } from "./face-pad";

const photo = (): TemporaryPhoto => ({ url: "blob:fixture", cropUrl: "blob:crop", blob: new Blob(["synthetic-frame"], { type: "image/png" }), width: 640, height: 480, crop: { x: 1, y: 1, width: 10, height: 10 } });
const provenance = { model: "anti-spoof-mn3", modelSha256: "c4c99af04603b62d7e44f6f4daeb33e0daeccc696008c0b1d62f6f5cebbb3262", detector: "yunet-2023mar", detectorSha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4", cropVersion: "yunet-max-side-square-context-1.2-clip-v1", preprocessingVersion: "mn3-original-onnx-rgb-cubic-128-v1", runtimeVersion: "4.13.0", pythonVersion: "3.10.0" };
const diagnostics = { version: "pad-geometry-v1", frame: { width: 640, height: 480 }, faceCount: 1,
  bbox: { x: 80, y: 60, width: 40, height: 60, confidence: .95 }, cropBeforeClip: { left: 64, top: 54, right: 136, bottom: 126 },
  cropAfterClip: { left: 64, top: 54, right: 136, bottom: 126 }, roi: { width: 72, height: 72 }, clipped: { left: false, top: false, right: false, bottom: false } };
const resultFor = (requestId: string) => ({ requestId, slot: "A", status: "SUCCESS", reason: null, prediction: null,
  probabilities: { real: .0004, spoof: .9996 }, imageSha256: createHash("sha256").update("synthetic-frame").digest("hex"),
  processedAt: "2026-10-13T00:00:00Z", durationMs: 15, provenance, diagnostics });

async function main() {
  const originalFetch = api.authorizedFetch, originalApi = api.apiClient, originalRun = quick.runQuickFaceTest;
  const originalWindow = globalThis.window, originalAuth = auth.useAuth, originalLanguage = language.useLanguage;
  let calls = 0, mutate: (value: any) => any = value => value;
  let successful!: PadResult;
  try {
    (api as any).authorizedFetch = async (path: string, options: RequestInit) => {
      calls++; assert.equal(path, "/face-pad/inspect"); assert.equal(options.method, "POST");
      const form = options.body as FormData;
      assert.deepEqual([...form.keys()], ["photo", "slot", "requestId"], "No fabricated participant, session or LIVE labels");
      assert.equal(await (form.get("photo") as Blob).text(), "synthetic-frame", "Original full photo is sent");
      return new Response(JSON.stringify({ data: mutate(resultFor(String(form.get("requestId")))) }));
    };
    let outcome = await quick.runQuickFaceTest(photo(), new AbortController().signal);
    assert.equal(outcome.status, "SUCCESS"); if (outcome.status === "SUCCESS") successful = outcome.result;
    for (const change of [
      (v: any) => ({ ...v, requestId: "wrong" }), (v: any) => ({ ...v, slot: "B" }),
      (v: any) => ({ ...v, imageSha256: "b".repeat(64) }), (v: any) => ({ ...v, prediction: "LIVE" }),
      (v: any) => ({ ...v, probabilities: { real: -1, spoof: 2 } }),
      (v: any) => ({ ...v, diagnostics: { ...diagnostics, frame: { width: 800, height: 600 } } }),
    ]) {
      mutate = change; assert.deepEqual(await quick.runQuickFaceTest(photo(), new AbortController().signal), { status: "ERROR", reason: "PAD_PROCESS_FAILED" });
    }
    mutate = v => ({ ...v, diagnostics: null });
    outcome = await quick.runQuickFaceTest(photo(), new AbortController().signal);
    assert.equal(outcome.status, "SUCCESS", "Legacy response is not given invented detection/crop details");
    const before = calls;
    assert.deepEqual(await quick.runQuickFaceTest({ ...photo(), width: 9000 }, new AbortController().signal), { status: "ERROR", reason: "FACE_INPUT_LIMIT" });
    const aborted = new AbortController(); aborted.abort();
    assert.deepEqual(await quick.runQuickFaceTest(photo(), aborted.signal), { status: "ERROR", reason: "PAD_TIMEOUT" });
    assert.equal(calls, before, "Invalid or already-cancelled photos are not sent");
    for (const code of ["FACE_NONE", "FACE_MULTIPLE", "PAD_RATE_LIMIT", "PAD_TIMEOUT", "PAD_SERVICE_UNAVAILABLE"]) {
      (api as any).authorizedFetch = async () => new Response(JSON.stringify({ errors: { code } }), { status: 503 });
      assert.deepEqual(await quick.runQuickFaceTest(photo(), new AbortController().signal), { status: "ERROR", reason: code });
    }
    (api as any).authorizedFetch = async () => { throw Error("private server diagnostic"); };
    assert.deepEqual(await quick.runQuickFaceTest(photo(), new AbortController().signal), { status: "ERROR", reason: "PAD_SERVICE_UNAVAILABLE" });

    (globalThis as any).window = Object.assign(new EventTarget(), { localStorage: { getItem: () => null, removeItem() {} } });
    (api as any).apiClient = async (path: string) => { assert.equal(path, "/face-pad/capabilities"); return { enabled: true }; };
    let owner: string | null = "actor", eligible = true, input: TemporaryPhoto | null = photo();
    const slots: any[] = [], cleanups: Array<(() => void) | undefined> = [];
    const requests: { photo: TemporaryPhoto; signal: AbortSignal }[] = [];
    let resolve!: (value: quick.QuickFaceOutcome) => void;
    (quick as any).runQuickFaceTest = (photo: TemporaryPhoto, signal: AbortSignal) => { requests.push({ photo, signal }); return new Promise(r => { resolve = r; }); };
    function render() {
      let cursor = 0; const effects: Array<() => void> = [], originals = { useState: React.useState, useRef: React.useRef, useCallback: React.useCallback, useEffect: React.useEffect };
      const equal = (x: any[], y: any[]) => x && x.length === y.length && x.every((v, i) => Object.is(v, y[i]));
      (React as any).useState = (initial: any) => { const slot = slots[cursor++] ??= { value: typeof initial === "function" ? initial() : initial }; return [slot.value, (v: any) => { slot.value = typeof v === "function" ? v(slot.value) : v; }]; };
      (React as any).useRef = (initial: any) => slots[cursor++] ??= { current: initial };
      (React as any).useCallback = (fn: any, deps: any[]) => { const i = cursor++; if (!equal(slots[i]?.deps, deps)) slots[i] = { value: fn, deps }; return slots[i].value; };
      (React as any).useEffect = (fn: any, deps: any[]) => { const i = cursor++; if (!equal(slots[i]?.deps, deps)) { slots[i] = { deps }; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } };
      let ui: ReturnType<typeof useQuickFaceTest>;
      try { ui = useQuickFaceTest(owner, eligible, input); } finally { Object.assign(React, originals); }
      effects.forEach(fn => fn()); return ui!;
    }
    const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
    const success: quick.QuickFaceOutcome = { status: "SUCCESS", result: successful };
    try {
      render(); await settle(); assert.equal(requests.length, 0, "Mount/availability do not transmit photos");
      let ui = render(), pending = ui.run(); void ui.run(); assert.equal(requests.length, 1, "Double-click starts one request");
      assert.equal(requests[0].photo, input); resolve(success); await pending; assert.equal(render().outcome, success);
      setActiveLanguage("id"); assert.equal(render().outcome, success, "Locale change keeps result");
      pending = render().run(); input = photo(); ui = render(); assert.equal(ui.outcome, null, "Changed photo never paints old result");
      assert(requests.at(-1)!.signal.aborted); resolve(success); await pending; assert.equal(render().outcome, null);
      pending = render().run(); render().cancel(); resolve(success); await pending; assert.equal(render().outcome, null);
      pending = render().run(); owner = "other-actor"; render(); await settle(); resolve(success); await pending; assert.equal(render().outcome, null);
      pending = render().run(); clearStoredAuth(); resolve(success); await pending; assert.equal(render().outcome, null);
      const count = requests.length; await render().run(); render().retry(); render(); await settle(); await render().run(); assert.equal(requests.length, count, "Retry cannot undo logout revocation");
      owner = "timeout-actor"; render(); await settle();
      const originalTimer = globalThis.setTimeout; let expire!: () => void;
      (globalThis as any).setTimeout = (fn: () => void, ms: number) => { if (ms === 20000) expire = fn; return originalTimer(fn, ms); };
      try { pending = render().run(); expire(); assert(requests.at(-1)!.signal.aborted); resolve({ status: "ERROR", reason: "PAD_TIMEOUT" }); await pending; assert.equal(render().outcome?.status, "ERROR"); }
      finally { globalThis.setTimeout = originalTimer; }
      pending = render().run(); window.dispatchEvent(new Event("pagehide")); resolve(success); await pending; assert.equal(render().outcome, null);
      owner = "unmount-actor"; render(); await settle(); pending = render().run(); cleanups.forEach(fn => fn?.()); assert(requests.at(-1)!.signal.aborted); resolve(success); await pending; assert.equal(render().outcome, null);
    } finally { cleanups.forEach(fn => fn?.()); }
    (quick as any).runQuickFaceTest = originalRun;
    (auth as any).useAuth = () => ({ user: { id: "actor", role: "SA", isActive: true }, isLoading: false });
    (language as any).useLanguage = () => ({ t: translate });
    assert.deepEqual(Object.keys(en.faceQuick).sort(), Object.keys(id.faceQuick).sort());
    for (const locale of ["en", "id"] as const) {
      setActiveLanguage(locale);
      const markup = renderToStaticMarkup(<QuickFaceTest />);
      assert(markup.includes(translate("faceQuick.title"))); assert(markup.includes('playsInline') || markup.includes('playsinline'));
      assert(!markup.includes('<input') && !markup.includes('<select') && !markup.includes('CSV'), "No experiment fields or CSV in quick mode");
      const summary = renderToStaticMarkup(<QuickFaceResult owner="actor" eligible photo={photo()} result={successful} />);
      assert(summary.includes(translate("faceQuick.inconclusive"))); assert(summary.includes(translate("faceQuick.spoofHigher")));
      assert(summary.includes('0.9996'), "Raw scores remain available separately from rounded display");
      (auth as any).useAuth = () => ({ user: null, isLoading: false });
      assert(!renderToStaticMarkup(<QuickPage />).includes('<video'), "Anonymous users cannot access camera UI");
      (auth as any).useAuth = () => ({ user: { id: "actor", role: "SA", isActive: true }, isLoading: false });
    }
    console.log("Quick face test PASS: original-photo transport, checksum/request/geometry guards, safe errors, explicit action, lifecycle cancellation, EN/ID and no manual metadata or login verdict");
  } finally {
    (api as any).authorizedFetch = originalFetch; (api as any).apiClient = originalApi; (quick as any).runQuickFaceTest = originalRun;
    (globalThis as any).window = originalWindow; (auth as any).useAuth = originalAuth; (language as any).useLanguage = originalLanguage; setActiveLanguage("en");
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
