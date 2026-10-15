import assert from "node:assert/strict";
import React from "react";
import * as api from "./api-client";
import { useFaceComparison } from "@/hooks/use-face-comparison";
import { clearStoredAuth } from "./auth";
import { setActiveLanguage, translate } from "@/i18n";
import { emptyTrialMetadata, type TrialMetadata } from "./face-experiment-notes";
import type { TemporaryPhoto } from "./face-photo";

const photo = (): TemporaryPhoto => ({ url: "blob:synthetic", cropUrl: "blob:synthetic-crop", blob: new Blob(["fixture"], { type: "image/png" }), width: 640, height: 480, crop: { x: 0, y: 0, width: 100, height: 100 } });
async function run() {
  const originalApi = api.apiClient, originalFetch = api.authorizedFetch, originalWindow = (globalThis as any).window;
  let owner: string | null = "fixture-actor", eligible = true, a: TemporaryPhoto | null = photo(), b: TemporaryPhoto | null = photo();
  let metadata: TrialMetadata = { ...emptyTrialMetadata(), participantA: "P01", participantB: "P01", sessionA: "S01", sessionB: "S02", truth: "SAME", sourceA: "LIVE", sourceB: "LIVE", condition: "NORMAL" };
  const provenance = { modelVersion: "2021dec", modelSha256: "a".repeat(64), detectorVersion: "2023mar", detectorSha256: "b".repeat(64), preprocessingVersion: "opencv-sface-five-landmark-112-v1", runtimeVersion: "4.13.0", embeddingDimensions: 128 };
  const events = Object.assign(new EventTarget(), { localStorage: { removeItem() {}, getItem: () => null } });
  const slots: any[] = [], cleanups: Array<(() => void) | undefined> = [];
  const calls: Array<{ path: string; options: RequestInit }> = [];
  let resolve!: (value: unknown) => void;
  (globalThis as any).window = events;
  (api as any).apiClient = (path: string, options: RequestInit) => {
    calls.push({ path, options });
    if (path.endsWith("capabilities")) return Promise.resolve({ enabled: true });
    throw Error("Unexpected API path");
  };
  (api as any).authorizedFetch = (path: string, options: RequestInit) => {
    calls.push({ path, options });
    return new Promise(r => { resolve = value => r(new Response(JSON.stringify({ data: { ...(value as object), provenance } }), { status: 200 })); });
  };
  function render() {
    let cursor = 0; const effects: Array<() => void> = [], originals = { state: React.useState, ref: React.useRef, callback: React.useCallback, effect: React.useEffect };
    const equal = (x: any[], y: any[]) => x && x.length === y.length && x.every((v, i) => Object.is(v, y[i]));
    (React as any).useState = (initial: any) => { const slot = slots[cursor++] ??= { value: initial }; return [slot.value, (v: any) => { slot.value = typeof v === "function" ? v(slot.value) : v; }]; };
    (React as any).useRef = (initial: any) => slots[cursor++] ??= { current: initial };
    (React as any).useCallback = (fn: any, deps: any[]) => { const i = cursor++; if (!equal(slots[i]?.deps, deps)) slots[i] = { value: fn, deps }; return slots[i].value; };
    (React as any).useEffect = (fn: any, deps: any[]) => { const i = cursor++; if (!equal(slots[i]?.deps, deps)) { slots[i] = { deps }; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } };
    let value: ReturnType<typeof useFaceComparison>;
    try { value = useFaceComparison(owner, eligible, a, b, metadata); }
    finally { Object.assign(React, { useState: originals.state, useRef: originals.ref, useCallback: originals.callback, useEffect: originals.effect }); }
    effects.forEach(fn => fn()); return value!;
  }
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
  try {
    let ui = render(); await settle(); ui = render(); assert.equal(ui.availability, "enabled");
    await ui.compare(); assert.equal(calls.filter(c => c.path.endsWith("compare")).length, 0, "No send before consent");
    ui.setConsent(true); ui = render(); const first = ui.compare(); void ui.compare();
    assert.equal(calls.filter(c => c.path.endsWith("compare")).length, 1, "Synchronous latch blocks double submit");
    const form = calls.at(-1)!.options.body as FormData;
    assert.deepEqual([...form.keys()], ["photoA", "photoB"]); assert.equal((form.get("photoA") as Blob).size, a!.blob.size);
    resolve({ model: "opencv-sface-2021dec", metric: "cosine", score: 0.6 }); await first;
    assert.equal(render().result!.score, 0.6);
    setActiveLanguage("id"); assert.equal(render().result!.score, 0.6, "Locale keeps result/consent/photo inputs");
    assert.equal(render().completed!.metadata.sessionB, "S02");
    const id = render().completed!.id; assert.match(id, /^[0-9a-f-]{36}$/i);
    metadata = { ...metadata, condition: "LIGHT" };
    assert.equal(render().completed, null, "Metadata edit invalidates completed attempt immediately");
    ui = render(); ui.setConsent(true); ui = render();
    const metaPending = ui.compare(); metadata = { ...metadata, sessionB: "S03" }; render();
    resolve({ model: "opencv-sface-2021dec", metric: "cosine", score: 0.8 }); await metaPending;
    assert.equal(render().completed, null, "Late result for old metadata is ignored");
    ui = render(); ui.setConsent(true); ui = render();
    const previous = ui.compare(); a = photo(); render(); await settle();
    assert(calls.at(-1)!.options.signal!.aborted); resolve({ model: "opencv-sface-2021dec", metric: "cosine", score: 0.9 }); await previous;
    assert.equal(render().result, null); assert.equal(render().consent, false);
    ui = render(); ui.setConsent(true); ui = render(); const oldActor = ui.compare();
    owner = "another-actor"; a = b = null; render(); await settle(); resolve({ model: "opencv-sface-2021dec", metric: "cosine", score: 0.8 }); await oldActor;
    assert.equal(render().result, null); assert.equal(render().busy, false);
    a = photo(); b = photo(); ui = render(); ui = render(); ui.setConsent(true); ui = render();
    const logout = ui.compare(); clearStoredAuth(); render(); resolve({ model: "opencv-sface-2021dec", metric: "cosine", score: 0.7 }); await logout;
    assert.equal(render().result, null); const count = calls.length; await render().compare(); assert.equal(calls.length, count, "Auth-clear latch persists across state rerenders");
    // A failed request is recordable with null score and only a safe code.
    owner = "failure-actor"; a = photo(); b = photo(); render(); await settle(); ui = render(); ui.setConsent(true); ui = render();
    (api as any).authorizedFetch = async () => new Response(JSON.stringify({ errors: { code: "FACE_NONE", provenance } }), { status: 422 });
    await ui.compare(); assert.equal(render().completed!.outcome, "FAILED"); assert.equal(render().completed!.result, null); assert.equal(render().completed!.reason, "FACE_NONE");
    (api as any).authorizedFetch = async () => { throw Error("synthetic network failure"); };
    await render().compare(); assert.equal(render().completed!.provenance, null); assert.equal(render().completed!.reason, "FACE_SERVICE_UNAVAILABLE");
    for (const lang of ["en", "id"] as const) {
      setActiveLanguage(lang);
      for (const key of ["consent", "disclosure", "photoA", "photoB", "score", "scale", "disabled", "FACE_TIMEOUT", "FACE_INPUT_LIMIT"])
        assert(!translate(`faceCompare.${key}` as any).startsWith("faceCompare."));
    }
    console.log("Face comparison hook mock: consent/full-photo FormData, double click, locale, photo replacement, account change/logout abort and stale-result rejection passed");
  } finally { cleanups.forEach(fn => fn?.()); (api as any).apiClient = originalApi; (api as any).authorizedFetch = originalFetch; (globalThis as any).window = originalWindow; setActiveLanguage("en"); }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
