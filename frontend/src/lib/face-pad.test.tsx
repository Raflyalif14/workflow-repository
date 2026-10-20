import assert from "node:assert/strict";
import React from "react";
import * as api from "./api-client";
import { useFacePad } from "@/hooks/use-face-pad";
import { clearStoredAuth } from "./auth";
import { padCsv, padMetadataValid, readPadResult, padDiagnosticCells, padDiagnosticColumns, type PadSlot } from "./face-pad";
import { readPadDiagnostics } from "./face-pad-diagnostics";
import { en } from "@/i18n/en";
import { id } from "@/i18n/id";
import { setActiveLanguage } from "@/i18n";
import type { TemporaryPhoto } from "./face-photo";
import { renderToStaticMarkup } from "react-dom/server";
import { FacePadGeometry } from "@/components/settings/face-pad-geometry";
import * as language from "@/components/i18n/language-provider";
import { translate } from "@/i18n";
const photo = (): TemporaryPhoto => ({ url: "blob:synthetic", cropUrl: "blob:crop", blob: new Blob(["synthetic-full-frame"], { type: "image/png" }), width: 640, height: 480, crop: { x: 0, y: 0, width: 100, height: 100 } });
const provenance = { model: "anti-spoof-mn3", modelSha256: "c4c99af04603b62d7e44f6f4daeb33e0daeccc696008c0b1d62f6f5cebbb3262", detector: "yunet-2023mar", detectorSha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4", cropVersion: "yunet-max-side-square-context-1.2-clip-v1", preprocessingVersion: "mn3-original-onnx-rgb-cubic-128-v1", runtimeVersion: "4.13.0", pythonVersion: "3.10.0" };
const geometry = { version: "pad-geometry-v1", frame: { width: 640, height: 480 }, faceCount: 1,
  bbox: { x: 80, y: 60, width: 40, height: 60, confidence: .953123456789 },
  cropBeforeClip: { left: 64, top: 54, right: 136, bottom: 126 }, cropAfterClip: { left: 64, top: 54, right: 136, bottom: 126 },
  roi: { width: 72, height: 72 }, clipped: { left: false, top: false, right: false, bottom: false } };
async function run() {
  const originalApi = api.apiClient, originalFetch = api.authorizedFetch, originalWindow = (globalThis as any).window;
  let owner: string | null = "synthetic-actor", eligible = true, a: TemporaryPhoto | null = photo(), b: TemporaryPhoto | null = photo();
  (globalThis as any).window = Object.assign(new EventTarget(), { localStorage: { removeItem() {}, getItem: () => null } });
  const slots: any[] = [], cleanups: Array<(() => void) | undefined> = [], calls: RequestInit[] = [];
  let resolve!: (value: Response) => void;
  (api as any).apiClient = async (path: string) => { assert.equal(path, "/face-pad/capabilities"); return { enabled: true }; };
  (api as any).authorizedFetch = (path: string, options: RequestInit) => { assert.equal(path, "/face-pad/inspect"); calls.push(options); return new Promise(r => { resolve = r; }); };
  function render() {
    let cursor = 0; const effects: Array<() => void> = [], originals = { useState: React.useState, useRef: React.useRef, useCallback: React.useCallback, useEffect: React.useEffect };
    const equal = (x: any[], y: any[]) => x && x.length === y.length && x.every((v, i) => Object.is(v, y[i]));
    (React as any).useState = (initial: any) => { const slot = slots[cursor++] ??= { value: typeof initial === "function" ? initial() : initial }; return [slot.value, (v: any) => { slot.value = typeof v === "function" ? v(slot.value) : v; }]; };
    (React as any).useRef = (initial: any) => slots[cursor++] ??= { current: initial };
    (React as any).useCallback = (fn: any, deps: any[]) => { const i = cursor++; if (!equal(slots[i]?.deps, deps)) slots[i] = { value: fn, deps }; return slots[i].value; };
    (React as any).useEffect = (fn: any, deps: any[]) => { const i = cursor++; if (!equal(slots[i]?.deps, deps)) { slots[i] = { deps }; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } };
    let value: ReturnType<typeof useFacePad>;
    try { value = useFacePad(owner, eligible, a, b); } finally { Object.assign(React, originals); }
    effects.forEach(fn => fn()); return value!;
  }
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
  const success = () => {
    const body = calls.at(-1)!.body as FormData;
    return { requestId: String(body.get("requestId")), slot: body.get("slot"), status: "SUCCESS", reason: null, prediction: null, probabilities: { real: 0.123456789123, spoof: 1 - 0.123456789123 }, provenance, imageSha256: "a".repeat(64), processedAt: "2026-10-13T04:00:00Z", durationMs: 120, diagnostics: geometry };
  };
  const configure = (slot: PadSlot, presentation = "LIVE") => {
    let ui = render(); ui.update(slot, "participant", "P01"); ui = render(); ui.update(slot, "session", "S01"); ui = render(); ui.update(slot, "presentation", presentation);
    if (presentation !== "LIVE") render().update(slot, "mediaId", "M01");
  };
  try {
    render(); await settle(); configure("A"); configure("B", "SCREEN_PHOTO");
    await render().inspect("A"); assert.equal(calls.length, 0, "No sending before consent");
    render().setConsent(true); let ui = render(), promise = ui.inspect("A"); void ui.inspect("A"); assert.equal(calls.length, 1);
    const form = calls[0].body as FormData; assert.deepEqual([...form.keys()], ["photo", "slot", "requestId"]);
    assert.equal(await (form.get("photo") as Blob).text(), "synthetic-full-frame", "Full original capture, not crop URL");
    resolve(new Response(JSON.stringify({ data: success() }))); await promise;
    ui = render(); assert.equal(ui.attemptFor("A")!.result!.probabilities.real, 0.123456789123);
    assert.deepEqual(ui.attemptFor("A")!.diagnostics, geometry);
    ui.record("A"); ui.record("A"); assert.equal(render().rows.length, 1, "Double-click recording guarded synchronously");
    setActiveLanguage("id"); assert.equal(render().attemptFor("A")!.result!.probabilities.real, 0.123456789123);
    promise = render().inspect("B"); const failedRequest = calls.at(-1)!.body as FormData;
    const noFace = { ...geometry, faceCount: 0, bbox: null, cropBeforeClip: null, cropAfterClip: null, roi: null, clipped: null };
    resolve(new Response(JSON.stringify({ errors: { code: "FACE_NONE", requestId: failedRequest.get("requestId"), slot: "B", diagnostics: noFace } }), { status: 422 })); await promise;
    assert.equal(render().attemptFor("B")!.result, null); assert.equal(render().attemptFor("B")!.status, "ERROR");
    assert.deepEqual(render().attemptFor("B")!.diagnostics, noFace);
    render().record("B"); const csv = padCsv(render().rows); assert(csv.includes('"0.123456789123"')); assert(csv.includes('"ERROR","FACE_NONE","",""')); assert(!csv.includes("cosine") && !csv.includes("embedding"));
    assert(csv.split("\r\n")[0].endsWith(padDiagnosticColumns.join(","))); assert(csv.includes('"0.953123456789"'));
    assert.equal(padDiagnosticCells(undefined).length, 23); assert(padDiagnosticCells(undefined).every(v => v === undefined), 'No invented geometry for old rows');
    const legacy = { ...render().rows[0], diagnostics: undefined, result: { ...render().rows[0].result!, diagnostics: null } };
    const legacyCsv = padCsv([legacy]); assert(legacyCsv.includes('"0.123456789123"')); assert(legacyCsv.split("\r\n")[1].endsWith(Array(23).fill('""').join(",")));
    const edge = readPadDiagnostics({ ...geometry, bbox: { x: 0, y: 0, width: 40, height: 60, confidence: .95 },
      cropBeforeClip: { left: -16, top: -6, right: 56, bottom: 66 }, cropAfterClip: { left: 0, top: 0, right: 56, bottom: 66 },
      roi: { width: 56, height: 66 }, clipped: { left: true, top: true, right: false, bottom: false } })!;
    assert(padCsv([{ ...render().rows[0], diagnostics: edge }]).includes('"-16","-6"'), 'Finite negative coordinates remain numeric; user-text formula protection remains active');
    const modified = { ...render().rows[0], metadata: { ...render().rows[0].metadata, participant: '=SUM(1,2)"\n' } };
    assert(padCsv([modified]).includes('"\'=SUM(1,2)""\n"'), "CSV formula and quote escaping");
    render().update("A", "session", "S02"); assert.equal(render().attemptFor("A"), null); assert.equal(render().canRecord("A"), false);
    promise = render().inspect("A"); const late = success(); a = photo(); render(); assert(calls.at(-1)!.signal!.aborted);
    resolve(new Response(JSON.stringify({ data: late }))); await promise; assert.equal(render().attemptFor("A"), null);
    assert.equal(render().consent, false); render().setConsent(true);
    promise = render().inspect("A"); const old = success(); render().update("A", "session", "S03"); render();
    resolve(new Response(JSON.stringify({ data: old }))); await promise; assert.equal(render().attemptFor("A"), null, "Metadata replacement rejects late result");
    promise = render().inspect("A"); render().cancel(); resolve(new Response(JSON.stringify({ data: success() }))); await promise; assert.equal(render().attemptFor("A"), null);
    promise = render().inspect("A"); owner = "another-account"; render(); await settle(); resolve(new Response(JSON.stringify({ data: success() }))); await promise;
    assert.equal(render().rows.length, 0); assert.equal(render().metadata.A.participant, ""); assert.equal(render().attemptFor("A"), null);
    configure("A"); render().setConsent(true); promise = render().inspect("A"); clearStoredAuth(); render(); resolve(new Response(JSON.stringify({ data: success() }))); await promise;
    assert.equal(render().rows.length, 0); assert.equal(render().attemptFor("A"), null); const count = calls.length; await render().inspect("A"); assert.equal(calls.length, count);
    // A timed-out transport may still finish; its late successful body is not usable.
    owner = "timeout-actor"; render(); await settle(); configure("A"); render().setConsent(true);
    const originalTimeout = globalThis.setTimeout; let expire!: () => void;
    (globalThis as any).setTimeout = (fn: () => void, ms: number) => { if (ms === 20000) expire = fn; return originalTimeout(fn, ms); };
    try {
      promise = render().inspect("A"); expire(); resolve(new Response(JSON.stringify({ data: success() }))); await promise;
      assert.equal(render().attemptFor("A")!.reason, "PAD_TIMEOUT"); assert.equal(render().attemptFor("A")!.result, null);
    } finally { globalThis.setTimeout = originalTimeout; }
    promise = render().inspect("A");
    resolve(new Response(JSON.stringify({ errors: { code: "FACE_NONE", requestId: "wrong-request", slot: "B", diagnostics: noFace } }), { status: 422 })); await promise;
    assert.equal(render().attemptFor("A")!.reason, "PAD_PROCESS_FAILED"); assert.equal(render().attemptFor("A")!.diagnostics, null, 'Failure geometry also requires the correct request/slot');
    // PAD inspects one photo per request: changes to the other slot are independent.
    configure("B", "SCREEN_PHOTO"); render().setConsent(true);
    promise = render().inspect("A"); resolve(new Response(JSON.stringify({ data: success() }))); await promise;
    const retainedA = render().attemptFor("A")!;
    promise = render().inspect("B"); resolve(new Response(JSON.stringify({ data: success() }))); await promise;
    b = photo(); render(); ui = render();
    assert.equal(ui.attemptFor("A"), retainedA, "Retaking B keeps the result and ROI binding of unchanged A");
    assert.equal(ui.attemptFor("B"), null, "Retaking B invalidates only its own result");
    assert.equal(ui.canRecord("A"), true); assert.equal(ui.consent, false, "New photo still requires renewed consent");
    ui.record("A"); const retainedRow = render().rows.at(-1)!;
    b = null; render(); ui = render();
    assert.equal(ui.attemptFor("A"), retainedA, "Deleting B also preserves A");
    assert.equal(ui.canRecord("A"), false, "Preserved result cannot be recorded twice");
    assert.equal(ui.rows.at(-1), retainedRow);
    render().setConsent(true); promise = render().inspect("A"); const pendingA = calls.at(-1)!;
    b = photo(); render(); render().update("B", "session", "S-other");
    assert.equal(pendingA.signal!.aborted, false, "Changing B photo and metadata leaves A's request running");
    resolve(new Response(JSON.stringify({ data: success() }))); await promise;
    assert.equal(render().attemptFor("A")!.status, "SUCCESS");
    render().setConsent(true); promise = render().inspect("B"); const pendingB = calls.at(-1)!;
    const lateB = success(); a = photo(); render(); render().update("A", "session", "S-other");
    assert.equal(pendingB.signal!.aborted, false, "Slot independence also works from B to A");
    resolve(new Response(JSON.stringify({ data: lateB }))); await promise;
    assert.equal(render().attemptFor("B")!.status, "SUCCESS"); assert.equal(render().attemptFor("A"), null);
    render().setConsent(true); promise = render().inspect("B"); const replacedB = success();
    b = null; render(); assert.equal(calls.at(-1)!.signal!.aborted, true, "Deleting the active photo still cancels its request");
    resolve(new Response(JSON.stringify({ data: replacedB }))); await promise;
    assert.equal(render().attemptFor("B"), null, "Late response cannot restore the deleted photo's result");
    const value = success(); assert.equal(readPadResult(value, value.requestId, "A" as PadSlot) !== null, value.slot === "A");
    assert.equal(readPadResult({ ...value, probabilities: { real: NaN, spoof: 1 } }, value.requestId, value.slot as PadSlot), null);
    assert.equal(readPadResult({ ...value, requestId: "wrong" }, value.requestId, value.slot as PadSlot), null);
    assert.equal(readPadResult({ ...value, diagnostics: { ...geometry, bbox: { ...geometry.bbox, x: Infinity } } }, value.requestId, value.slot as PadSlot), null);
    assert.equal(readPadResult({ ...value, diagnostics: undefined }, value.requestId, value.slot as PadSlot)!.diagnostics, null, 'Old response remains compatible, without backfill');
    assert.equal(readPadDiagnostics({ ...geometry, faceCount: '1' }), undefined);
    assert.deepEqual(readPadDiagnostics({ ...geometry, path: 'unsafe', bbox: { ...geometry.bbox, landmarks: ['unsafe'] } }), geometry);
    assert.equal(padMetadataValid({ participant: "P01", session: "S01", presentation: "SCREEN_PHOTO", mediaId: "" }), false);
    assert.deepEqual(Object.keys(en.facePad).sort(), Object.keys(id.facePad).sort());
    for (const key of Object.keys(en.facePad)) { assert((en.facePad as any)[key].length); assert((id.facePad as any)[key].length); }
    const originalLanguage = language.useLanguage;
    try {
      (language as any).useLanguage = () => ({ t: translate });
      for (const locale of ["en", "id"] as const) {
        setActiveLanguage(locale);
        const markup = renderToStaticMarkup(React.createElement(FacePadGeometry, { diagnostics: edge }));
        assert(markup.includes('<details>') && markup.includes('<summary'), 'Native keyboard-accessible diagnostic details');
        assert(markup.includes(locale === "en" ? 'left, top' : 'kiri, atas'));
        assert(markup.includes('56') && markup.includes('66'));
        const missing = renderToStaticMarkup(React.createElement(FacePadGeometry, { diagnostics: null }));
        assert(missing.includes(locale === "en" ? 'not available' : 'belum tersedia'));
        const zero = renderToStaticMarkup(React.createElement(FacePadGeometry, { diagnostics: readPadDiagnostics(noFace)! }));
        assert(zero.includes(locale === "en" ? 'Faces detected: 0' : 'Wajah terdeteksi: 0'));
      }
    } finally { (language as any).useLanguage = originalLanguage; }
    console.log("PAD hook/CSV PASS: independent A/B results and requests, consent, frame/request binding, double-click, success/failure, photo/metadata/account/logout cancellation, language retention, safe export and EN/ID");
  } finally { cleanups.forEach(fn => fn?.()); (api as any).apiClient = originalApi; (api as any).authorizedFetch = originalFetch; (globalThis as any).window = originalWindow; setActiveLanguage("en"); }
}
void run().catch(e => { console.error(e); process.exitCode = 1; });
