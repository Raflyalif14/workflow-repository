import assert from "node:assert/strict";
import { createPhotoCapture, faceCrop, photoDisabledReason, type PhotoState } from "./face-photo";
import type { FrameDetection } from "./face-detection";
import { setActiveLanguage, translate } from "@/i18n";
import React from "react";
import { useFacePhoto } from "@/hooks/use-face-photo";
import { clearStoredAuth } from "@/lib/auth";

const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const box = { x: 100, y: 50, width: 200, height: 100, confidence: 0.9 };
const result = (count: number): FrameDetection => ({ width: 1280, height: 720, boxes: Array(count).fill(box) });
function setup(detect: (canvas: HTMLCanvasElement) => Promise<FrameDetection>, encode?: (canvas: HTMLCanvasElement) => Promise<Blob>) {
  const states: PhotoState[] = [], revoked: string[] = [], frames: HTMLCanvasElement[] = [], rects: unknown[] = [];
  let freezes = 0, validated = 0, urlCount = 0;
  const controller = createPhotoCapture({ detect, publish: state => states.push(state), validated: () => { validated++; },
    freeze: video => { freezes++; assert.equal((video as any).mirror, true, "Display mirror is not passed as a pixel transform");
      const frame = { width: 1280, height: 720 } as HTMLCanvasElement; frames.push(frame); return frame; },
    crop: (frame, rect) => { assert.equal(frame.width, 1280); rects.push(rect);
      const cropped = { width: rect.width, height: rect.height } as HTMLCanvasElement; frames.push(cropped); return cropped; },
    encode: encode ?? (async () => new Blob(["synthetic fixture pixels"], { type: "image/png" })),
    urls: { createObjectURL: () => `blob:fixture/${++urlCount}`, revokeObjectURL: url => revoked.push(url) } });
  const video = { videoWidth: 1280, videoHeight: 720, mirror: true } as unknown as HTMLVideoElement;
  return { ...controller, states, revoked, frames, rects, video, counters: () => ({ freezes, validated, urlCount }) };
}
async function run() {
  assert.equal(photoDisabledReason(false, true, 1, false), "cameraRequired");
  assert.equal(photoDisabledReason(true, false, 1, false), "modelRequired");
  assert.equal(photoDisabledReason(true, true, 0, false), "oneRequired");
  assert.equal(photoDisabledReason(true, true, 2, false), "onlyOneRequired");
  assert.equal(photoDisabledReason(true, true, 1, true), "capturing");
  assert.equal(photoDisabledReason(true, true, 1, false), null);
  assert.deepEqual(faceCrop(box, 1280, 720), { x: 60, y: 30, width: 280, height: 140 });
  assert.deepEqual(faceCrop({ ...box, x: -5, y: -8, width: 100, height: 100 }, 90, 80), { x: 0, y: 0, width: 90, height: 80 });
  assert.throws(() => faceCrop({ ...box, x: 3000 }, 1280, 720));
  assert.throws(() => faceCrop({ ...box, width: 0 }, 1280, 720));
  for (const count of [0, 2]) {
    const rejected = setup(async () => result(count)); await rejected.capture(rejected.video);
    assert.equal(rejected.states.at(-1)!.error, count === 0 ? "none" : "multiple");
    assert.equal(rejected.counters().validated, 0); assert.equal(rejected.counters().urlCount, 0);
    assert(rejected.frames.every(c => c.width === 0 && c.height === 0)); rejected.dispose();
  }
  const one = setup(async frame => { assert.equal(frame.width, 1280); return result(1); }); await one.capture(one.video);
  assert.equal(one.counters().validated, 1); const saved = one.states.at(-1)!.photo!;
  assert.equal(saved.width, 1280); assert.equal(saved.height, 720); assert.deepEqual(saved.crop, { x: 60, y: 30, width: 280, height: 140 });
  assert(one.frames.every(c => c.width === 0 && c.height === 0));
  await one.capture(one.video); assert.equal(one.counters().freezes, 1, "Existing photo cannot be overwritten without explicit clear/retake");
  one.clear(); assert.deepEqual(one.revoked.sort(), [saved.url, saved.cropUrl].sort());
  await one.capture(one.video); one.dispose(); assert.equal(one.revoked.length, 4); one.dispose(); assert.equal(one.revoked.length, 4);

  const pending = deferred<FrameDetection>(), double = setup(() => pending.promise);
  const first = double.capture(double.video); await double.capture(double.video); assert.equal(double.counters().freezes, 1);
  double.clear(); pending.resolve(result(1)); await first;
  assert.equal(double.counters().validated, 0); assert.equal(double.counters().urlCount, 0, "Stopped capture never creates URLs");
  assert.equal(double.states.at(-1)!.status, "idle"); double.dispose();
  const unmountPending = deferred<FrameDetection>(), leaving = setup(() => unmountPending.promise);
  const left = leaving.capture(leaving.video), states = leaving.states.length; leaving.dispose(); unmountPending.resolve(result(1)); await left;
  assert.equal(leaving.states.length, states); assert.equal(leaving.counters().urlCount, 0);

  const encoding = deferred<Blob>(), duringEncode = setup(async () => result(1), () => encoding.promise);
  const encodingWork = duringEncode.capture(duringEncode.video); await Promise.resolve(); await Promise.resolve();
  assert.equal(duringEncode.counters().validated, 1); duringEncode.dispose(); encoding.resolve(new Blob()); await encodingWork;
  assert.equal(duringEncode.counters().urlCount, 0, "Late encoding after logout/unmount does not allocate URLs");
  assert(duringEncode.frames.every(c => c.width === 0));

  const old = deferred<FrameDetection>(); let calls = 0;
  const restart = setup(() => ++calls === 1 ? old.promise : Promise.resolve(result(1)));
  const oldWork = restart.capture(restart.video); restart.clear(); await restart.capture(restart.video);
  const newPhoto = restart.states.at(-1)!.photo!; old.reject(new Error("Old request failed")); await oldWork;
  restart.clear(); assert(restart.revoked.includes(newPhoto.url), "Old failure cannot erase ownership of the newer photo's URLs"); restart.dispose();
  const mismatch = setup(async () => ({ ...result(1), width: 640 })); await mismatch.capture(mismatch.video);
  assert.equal(mismatch.states.at(-1)!.error, "failed"); assert.equal(mismatch.counters().validated, 0); mismatch.dispose();
  const failed = setup(async () => { throw Error("Sensitive internal error"); }); await failed.capture(failed.video);
  assert.equal(failed.states.at(-1)!.error, "failed"); assert(!JSON.stringify(failed.states).includes("Sensitive")); failed.dispose();

  // Exercise actual hook owner/session cleanup, not just the isolated capture controller.
  const originalWindow = (globalThis as any).window, originalDocument = (globalThis as any).document;
  const originalCreateURL = URL.createObjectURL, originalRevokeURL = URL.revokeObjectURL;
  const hookURLs: string[] = [], hookRevoked: string[] = [], events = new EventTarget();
  const fakeWindow = Object.assign(events, { localStorage: { getItem: () => null, removeItem() {} } });
  const slots: any[] = [], cleanups: Array<(() => void) | undefined> = [];
  let owner = "fixture-owner", eligible = true, cursor = 0;
  const ref = { current: { readyState: 2, videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement };
  const detect = async () => result(1), validated = () => {};
  function render() {
    const originals = { state: React.useState, ref: React.useRef, effect: React.useEffect, callback: React.useCallback };
    const effects: Array<() => void> = []; cursor = 0;
    const equal = (a: any[], b: any[]) => a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    (React as any).useState = (initial: any) => { const slot = slots[cursor++] ??= { value: initial }; return [slot.value, (value: any) => { slot.value = value; }]; };
    (React as any).useRef = (initial: any) => slots[cursor++] ??= { current: initial };
    (React as any).useCallback = (fn: any, deps: any[]) => { const i = cursor++; if (!equal(slots[i]?.deps, deps)) slots[i] = { value: fn, deps }; return slots[i].value; };
    (React as any).useEffect = (fn: any, deps: any[]) => { const i = cursor++; if (!equal(slots[i]?.deps, deps)) { slots[i] = { deps }; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } };
    let value: ReturnType<typeof useFacePhoto>;
    try { value = useFacePhoto(ref, owner, eligible, detect, validated); }
    finally { Object.assign(React, { useState: originals.state, useRef: originals.ref, useEffect: originals.effect, useCallback: originals.callback }); }
    effects.forEach(fn => fn()); return value!;
  }
  try {
    (globalThis as any).window = fakeWindow;
    (globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob: (cb: (blob: Blob) => void) => cb(new Blob()) }) };
    URL.createObjectURL = () => { const url = `blob:hook/${hookURLs.length}`; hookURLs.push(url); return url; };
    URL.revokeObjectURL = url => { hookRevoked.push(url); };
    let hook = render(); await hook.capture(); hook = render(); assert(hook.photo);
    owner = "second-fixture-owner"; assert.equal(render().photo, null, "Account-change render already hides old image before effect cleanup");
    assert.equal(hookRevoked.length, 2); hook = render(); await hook.capture(); assert(render().photo);
    eligible = false; assert.equal(render().photo, null); assert.equal(hookRevoked.length, 4);
    eligible = true; hook = render(); await hook.capture(); assert(render().photo);
    clearStoredAuth(); assert.equal(render().photo, null); assert.equal(hookRevoked.length, 6);
    owner = "third-fixture-owner"; hook = render(); await hook.capture();
    events.dispatchEvent(new Event("pagehide")); assert.equal(render().photo, null); assert.equal(hookRevoked.length, 8);
  } finally {
    cleanups.forEach(fn => fn?.());
    (globalThis as any).window = originalWindow; (globalThis as any).document = originalDocument;
    URL.createObjectURL = originalCreateURL; URL.revokeObjectURL = originalRevokeURL;
  }

  for (const lang of ["en", "id"] as const) {
    setActiveLanguage(lang);
    for (const key of ["capture", "retake", "delete", "cameraRequired", "modelRequired", "oneRequired", "onlyOneRequired", "capturing", "none", "multiple", "failed", "privacy", "fullAlt", "cropAlt"])
      assert(!translate(`facePhoto.${key}` as any).startsWith("facePhoto."));
  }
  setActiveLanguage("en");
  console.log("Temporary photo mock: fresh 0/1/2, native crop/clamp, UI eligibility, double click, cancellation/unmount, stale generation, URL/canvas cleanup and EN/ID passed");
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
