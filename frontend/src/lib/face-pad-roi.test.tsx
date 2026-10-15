import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as roi from "./face-pad-roi";
import { useFacePadRoi } from "@/hooks/use-face-pad-roi";
import { FacePadRoi } from "@/components/settings/face-pad-roi";
import * as hook from "@/hooks/use-face-pad-roi";
import * as language from "@/components/i18n/language-provider";
import { clearStoredAuth } from "./auth";
import { en } from "@/i18n/en";
import { id } from "@/i18n/id";
import { setActiveLanguage, translate } from "@/i18n";
import type { PadAttempt } from "./face-pad";
import type { TemporaryPhoto } from "./face-photo";

const geometry = { version: "pad-geometry-v1" as const, frame: { width: 640, height: 480 }, faceCount: 1,
  bbox: { x: 80, y: 60, width: 40, height: 60, confidence: .95 },
  cropBeforeClip: { left: 64, top: 54, right: 136, bottom: 126 }, cropAfterClip: { left: 64, top: 54, right: 136, bottom: 126 },
  roi: { width: 72, height: 72 }, clipped: { left: false, top: false, right: false, bottom: false } };
const photo = (): TemporaryPhoto => ({ blob: new Blob(["synthetic"], { type: "image/png" }), width: 640, height: 480,
  url: "blob:full", cropUrl: "blob:blazeface-not-pad", crop: { x: 1, y: 2, width: 3, height: 4 } });
const attempt = (): PadAttempt => ({ id: "synthetic-request", slot: "A", status: "SUCCESS", reason: null,
  metadata: { participant: "P01", session: "S01", presentation: "LIVE", mediaId: "" }, completedAt: "2026-10-13T00:00:00Z",
  provenance: null, diagnostics: geometry, result: { requestId: "synthetic-request", slot: "A", status: "SUCCESS",
    probabilities: { real: .1, spoof: .9 }, provenance: {} as any, imageSha256: "a".repeat(64), processedAt: "2026-10-13T00:00:00Z", durationMs: 1, diagnostics: geometry } });
const input = (): roi.PadRoiInput => ({ owner: "synthetic-owner", slot: "A", photo: photo(), attempt: attempt() });
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
function fixture() {
  const states: roi.PadRoiState[] = [], created: string[] = [], revoked: string[] = [], draws: any[][] = [];
  let closed = 0;
  const image = { width: 640, height: 480, close: () => { ++closed; } } as ImageBitmap;
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...args: any[]) => draws.push(args) }) } as unknown as HTMLCanvasElement;
  const options = { publish: (s: roi.PadRoiState) => states.push(s), decode: async (_: Blob) => image,
    checksum: async (_: Blob) => "a".repeat(64), canvas: () => canvas, encode: async (_: HTMLCanvasElement) => new Blob(["synthetic-roi"], { type: "image/png" }),
    urls: { createObjectURL: (_: Blob) => { const url = `blob:roi-${created.length}`; created.push(url); return url; }, revokeObjectURL: (url: string) => { revoked.push(url); } } };
  return { options, states, image, canvas, draws, created, revoked, closed: () => closed };
}
async function run() {
  const checks: string[] = [];
  {
    const f = fixture(), source = input();
    const encode = f.options.encode;
    f.options.encode = async canvas => { assert.equal(canvas.width, 72); assert.equal(canvas.height, 72); return encode(canvas); };
    const controller = roi.createPadRoiPreview(f.options);
    await controller.preview(source);
    assert.deepEqual(f.draws[0], [f.image, 64, 54, 72, 72, 0, 0, 72, 72], "Server crop directly, no mirror or 128px model resize");
    assert.equal(f.states.at(-1)!.status, "ready"); assert.equal(f.closed(), 1); assert.equal(f.canvas.width, 0);
    assert.equal(source.photo.cropUrl, "blob:blazeface-not-pad"); controller.clear(); controller.dispose();
    assert.deepEqual(f.revoked, f.created); checks.push("Native crop/source coords and ready cleanup");
  }
  {
    const source = input(); source.attempt.result!.diagnostics = { ...geometry, bbox: { x: 0, y: 0, width: 40, height: 60, confidence: .95 },
      cropBeforeClip: { left: -16, top: -6, right: 56, bottom: 66 }, cropAfterClip: { left: 0, top: 0, right: 56, bottom: 66 },
      roi: { width: 56, height: 66 }, clipped: { left: true, top: true, right: false, bottom: false } };
    const f = fixture(), controller = roi.createPadRoiPreview(f.options); await controller.preview(source);
    assert.deepEqual(f.draws[0].slice(1), [0, 0, 56, 66, 0, 0, 56, 66]); controller.dispose();
    checks.push("Clipped edge uses server after-clip ROI");
  }
  for (const invalid of ["error", "missing", "partial", "bounds", "dimensions", "request", "slot", "hash", "blob"]) {
    const source = input(), f = fixture();
    if (invalid === "error") source.attempt.status = "ERROR";
    if (invalid === "missing") source.attempt.result!.diagnostics = null;
    if (invalid === "partial") source.attempt.result!.diagnostics = { ...geometry, roi: null };
    if (invalid === "bounds") source.attempt.result!.diagnostics = { ...geometry, cropAfterClip: { left: -1, top: 54, right: 136, bottom: 126 } };
    if (invalid === "dimensions") source.photo.width = 641;
    if (invalid === "request") source.attempt.result!.requestId = "another-request";
    if (invalid === "slot") source.attempt.result!.slot = "B";
    if (invalid === "hash") source.attempt.result!.imageSha256 = "b".repeat(64);
    if (invalid === "blob") source.photo.blob = new Blob([]);
    const controller = roi.createPadRoiPreview(f.options); await controller.preview(source); controller.dispose();
    assert.equal(f.states.at(-1)!.status, "unavailable", invalid); assert.equal(f.created.length, 0); assert.equal(f.draws.length, 0);
  }
  checks.push("ERROR/incomplete/invalid dimensions, bounds, request, slot, blob/checksum never draw");
  {
    const f = fixture(); (f.image as any).width = 639;
    const controller = roi.createPadRoiPreview(f.options); await controller.preview(input()); controller.dispose();
    assert.equal(f.states.at(-1)!.status, "unavailable"); assert.equal(f.closed(), 1); assert.equal(f.draws.length, 0);
    checks.push("Decoded bitmap must match server frame dimensions");
  }
  {
    const f = fixture(), decode = deferred<ImageBitmap>(); f.options.decode = () => decode.promise;
    const controller = roi.createPadRoiPreview(f.options), promise = controller.preview(input());
    await Promise.resolve(); controller.dispose(); decode.resolve(f.image); await promise;
    assert.equal(f.closed(), 1); assert.equal(f.created.length, 0); assert.equal(f.draws.length, 0);
    checks.push("Late decode after dispose closes its bitmap without preview");
  }
  {
    const f = fixture(), encode = deferred<Blob>(); f.options.encode = () => encode.promise;
    const controller = roi.createPadRoiPreview(f.options), promise = controller.preview(input());
    await Promise.resolve(); await Promise.resolve(); controller.clear(); assert.equal(f.canvas.width, 0); assert.equal(f.closed(), 1);
    encode.resolve(new Blob(["synthetic"], { type: "image/png" })); await promise;
    assert.equal(f.created.length, 0); assert.equal(f.closed(), 1);
    checks.push("Late encode after clear releases canvas/bitmap and creates no URL");
  }
  {
    const f = fixture(), first = deferred<ImageBitmap>(); let read = 0;
    f.options.decode = () => ++read === 1 ? first.promise : Promise.resolve(f.image);
    const controller = roi.createPadRoiPreview(f.options), old = controller.preview(input()); await Promise.resolve();
    await controller.preview(input()); const newer = f.states.at(-1); first.resolve({ width: 640, height: 480, close() {} } as ImageBitmap); await old;
    assert.equal(f.states.at(-1), newer); assert.equal(f.created.length, 1); controller.dispose(); assert.deepEqual(f.revoked, f.created);
    checks.push("Restart ignores stale work and preserves only newest URL");
  }
  {
    const f = fixture(); let valid = true; const encode = deferred<Blob>(); f.options.encode = () => encode.promise;
    const controller = roi.createPadRoiPreview(f.options), promise = controller.preview(input(), () => valid);
    await Promise.resolve(); await Promise.resolve(); valid = false; encode.resolve(new Blob(["synthetic"])); await promise;
    assert.equal(f.created.length, 0); controller.dispose();
    checks.push("Changed binding before encode completes cannot publish an image");
  }
  {
    const oldController = roi.createPadRoiPreview, originalWindow = (globalThis as any).window;
    (globalThis as any).window = Object.assign(new EventTarget(), { localStorage: { removeItem() {}, getItem: () => null } });
    const controllers: any[] = [], slots: any[] = [], cleanups: any[] = [];
    let owner: string | null = "account-one", eligible = true, p: TemporaryPhoto | null = photo(), a = attempt();
    (roi as any).createPadRoiPreview = (options: any) => { const c = { options, disposed: false, preview: (_: any, valid: () => boolean) => { c.valid = valid; }, dispose: () => { c.disposed = true; }, valid: () => false }; controllers.push(c); return c; };
    function render() {
      let cursor = 0; const effects: Array<() => void> = [], originals = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect };
      const equal = (x: any[], y: any[]) => x && x.length === y.length && x.every((v, i) => Object.is(v, y[i]));
      (React as any).useState = (initial: any) => { const s = slots[cursor++] ??= { value: typeof initial === "function" ? initial() : initial }; return [s.value, (v: any) => { s.value = typeof v === "function" ? v(s.value) : v; }]; };
      (React as any).useRef = (initial: any) => slots[cursor++] ??= { current: initial };
      (React as any).useEffect = (fn: any, deps: any[]) => { const n = cursor++; if (!equal(slots[n]?.deps, deps)) { slots[n] = { deps }; effects.push(() => { cleanups[n]?.(); cleanups[n] = fn(); }); } };
      let state!: roi.PadRoiState;
      try { state = useFacePadRoi(owner, eligible, "A", p, a); } finally { Object.assign(React, originals); }
      effects.forEach(fn => fn()); return state;
    }
    try {
      render(); const first = controllers.at(-1); first.options.publish({ status: "ready", url: "blob:first", width: 72, height: 72 }); assert.equal(render().url, "blob:first");
      p = photo(); assert.equal(render().url, null); assert(first.disposed); first.options.publish({ status: "ready", url: "blob:late", width: 72, height: 72 }); assert.equal(render().url, null);
      const second = controllers.at(-1); second.options.publish({ status: "ready", url: "blob:second", width: 72, height: 72 }); owner = "account-two";
      assert.equal(render().url, null); assert(second.disposed);
      const third = controllers.at(-1); third.options.publish({ status: "ready", url: "blob:third", width: 72, height: 72 }); a = { ...a, metadata: { ...a.metadata, session: "S02" } };
      assert.equal(render().url, null); assert(third.disposed); const fourth = controllers.at(-1);
      clearStoredAuth(); assert(fourth.disposed); assert.equal(render().url, null);
      eligible = false; assert.equal(render().url, null); p = null; owner = null; assert.equal(render().url, null);
      checks.push("Hook rejects photo/metadata/account changes before cleanup; logout disposes immediately");
    } finally { cleanups.forEach(fn => fn?.()); (roi as any).createPadRoiPreview = oldController; (globalThis as any).window = originalWindow; }
  }
  {
    const oldHook = hook.useFacePadRoi, oldLanguage = language.useLanguage;
    try {
      (language as any).useLanguage = () => ({ t: translate });
      for (const locale of ["en", "id"] as const) {
        setActiveLanguage(locale); (hook as any).useFacePadRoi = () => ({ status: "ready", url: "blob:synthetic-roi", width: 56, height: 66 });
        const markup = renderToStaticMarkup(React.createElement(FacePadRoi, { owner: "synthetic", eligible: true, slot: "A", photo: photo(), attempt: attempt() }));
        assert(markup.includes('width="56" height="66"')); assert(markup.includes("max-w-full")); assert(!markup.includes("scale-x"));
        assert(markup.includes(locale === "en" ? "Native ROI: 56" : "ROI asli: 56"));
        (hook as any).useFacePadRoi = () => roi.EMPTY_PAD_ROI;
        const unavailable = renderToStaticMarkup(React.createElement(FacePadRoi, { owner: null, eligible: false, slot: "A", photo: null, attempt: attempt() }));
        assert(!unavailable.includes("<img")); assert(unavailable.includes(locale === "en" ? "preview unavailable" : "tidak tersedia"));
      }
      assert.deepEqual(Object.keys(en.facePad).sort(), Object.keys(id.facePad).sort());
      checks.push("EN/ID native dimensions, unavailable state, no mirror, bounded responsive image");
    } finally { (hook as any).useFacePadRoi = oldHook; (language as any).useLanguage = oldLanguage; setActiveLanguage("en"); }
  }
  console.log(`PAD ROI targeted checks PASS: ${checks.length} groups (synthetic/mock lifecycle and static EN/ID render)`);
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
