import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCameraPreview, cameraErrorFrom } from "../hooks/use-camera-preview";
import * as auth from "../components/auth/auth-provider";
import * as language from "../components/i18n/language-provider";
import FaceVerificationPage from "../app/settings/face-verification/page";
import { CameraPreparation } from "../components/settings/camera-preparation";
import { clearStoredAuth } from "./auth";
import { setActiveLanguage, translate } from "../i18n";

const originalWindow = globalThis.window, navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const events = new EventTarget();
const fakeWindow: any = { isSecureContext: true, addEventListener: events.addEventListener.bind(events),
  removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
  localStorage: { getItem: () => null, removeItem() {} } };
(globalThis as any).window = fakeWindow;
let calls: MediaStreamConstraints[] = [], next: () => Promise<MediaStream>;
const media: any = { getUserMedia: (constraints: MediaStreamConstraints) => { calls.push(constraints); return next(); } };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: media } });
const defer = () => { let resolve!: (value: MediaStream) => void;
  const promise = new Promise<MediaStream>(r => { resolve = r; }); return { resolve, promise }; };
function stream() {
  const tracks = [0, 1].map(() => {
    const events = new EventTarget();
    return { stops: 0, stop() { this.stops++; }, addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events), end() { events.dispatchEvent(new Event("ended")); } };
  });
  return { tracks, value: { getTracks: () => tracks } as unknown as MediaStream };
}
let slots: any[] = [], cursor = 0, effects: (() => void)[] = [], cleanups: ((() => void) | undefined)[] = [];
let owner: string | null = "synthetic-user", enabled = true, failPlay = false;
const video: any = { srcObject: null, pause() {}, play: async () => { if (failPlay) throw Error("Synthetic playback failure"); } };
const originals = { state: React.useState, ref: React.useRef, effect: React.useEffect, callback: React.useCallback };
const equal = (a: any[] | undefined, b: any[]) => a && a.length === b.length && b.every((v, i) => v === a[i]);
function render() {
  cursor = 0; effects = [];
  (React as any).useState = (initial: any) => {
    const slot = slots[cursor++] ??= { value: typeof initial === "function" ? initial() : initial };
    return [slot.value, (value: any) => { slot.value = typeof value === "function" ? value(slot.value) : value; }];
  };
  (React as any).useRef = (initial: any) => slots[cursor++] ??= { current: initial };
  (React as any).useCallback = (fn: any, deps: any[]) => {
    const index = cursor++; if (!equal(slots[index]?.deps, deps)) slots[index] = { deps, value: fn };
    return slots[index].value;
  };
  (React as any).useEffect = (fn: () => any, deps: any[]) => {
    const index = cursor++;
    if (!equal(slots[index]?.deps, deps)) { slots[index] = { deps }; effects.push(() => { cleanups[index]?.(); cleanups[index] = fn(); }); }
  };
  let camera: ReturnType<typeof useCameraPreview>;
  try { camera = useCameraPreview(owner, enabled); (camera.videoRef as any).current = video; }
  finally { (React as any).useState = originals.state; (React as any).useRef = originals.ref;
    (React as any).useEffect = originals.effect; (React as any).useCallback = originals.callback; }
  effects.forEach(effect => effect()); return camera!;
}
function unmount() { cleanups.forEach(fn => fn?.()); cleanups = []; }
function reset() { unmount(); slots = []; owner = "synthetic-user"; enabled = true; failPlay = false;
  calls = []; video.srcObject = null; fakeWindow.isSecureContext = true; media.getUserMedia = (c: MediaStreamConstraints) => { calls.push(c); return next(); }; }

async function run() {
  const originalAuth = auth.useAuth, originalLanguage = language.useLanguage;
  try {
    reset(); const first = stream(); next = async () => first.value;
    let camera = render(); assert.equal(calls.length, 0, "Mount never requests a camera");
    await camera.start(); camera = render(); assert.equal(camera.status, "on"); assert.equal(video.srcObject, first.value);
    assert.deepEqual(calls, [{ video: { facingMode: { ideal: "user" } }, audio: false }]);
    await camera.start(); assert.equal(calls.length, 1, "Already-running camera cannot be requested twice");
    camera.stop(); assert(first.tracks.every(t => t.stops === 1)); assert.equal(video.srcObject, null); assert.equal(render().status, "off");

    reset(); const pending = defer(), late = stream(); next = () => pending.promise; camera = render();
    const request = camera.start(); await camera.start(); assert.equal(calls.length, 1, "Pending request has a synchronous latch");
    camera.stop(); await camera.start(); assert.equal(calls.length, 1, "Stop cannot create a second pending permission prompt");
    pending.resolve(late.value); await request; assert(late.tracks.every(t => t.stops === 1)); assert.equal(video.srcObject, null); assert.equal(render().pending, false);

    reset(); const leaving = defer(), lateLeaving = stream(); next = () => leaving.promise; camera = render();
    const left = camera.start(); unmount(); leaving.resolve(lateLeaving.value); await left;
    assert(lateLeaving.tracks.every(t => t.stops === 1), "Permission completing after unmount releases every track"); assert.equal(video.srcObject, null);

    reset(); const active = stream(); next = async () => active.value; camera = render(); await camera.start(); unmount();
    assert(active.tracks.every(t => t.stops === 1), "Leaving a running preview releases every track");

    reset(); const hidden = stream(); next = async () => hidden.value; camera = render(); await camera.start();
    events.dispatchEvent(new Event("pagehide")); assert(hidden.tracks.every(t => t.stops === 1), "Document navigation also stops tracks");

    reset(); const logout = stream(); next = async () => logout.value; camera = render(); await camera.start();
    clearStoredAuth(); assert(logout.tracks.every(t => t.stops === 1)); camera = render(); await camera.start();
    assert.equal(calls.length, 1, "Logout revokes eligibility before profile rerender");

    reset(); const logoutPending = defer(), logoutLate = stream(); next = () => logoutPending.promise; camera = render();
    const logoutRequest = camera.start(); clearStoredAuth(); logoutPending.resolve(logoutLate.value); await logoutRequest;
    assert(logoutLate.tracks.every(t => t.stops === 1), "Pending permission after logout is also stopped");

    reset(); const changed = stream(); next = async () => changed.value; camera = render(); await camera.start(); owner = "another-synthetic-user"; render();
    assert(changed.tracks.every(t => t.stops === 1), "Account change never carries a stream to another user");
    reset(); enabled = false; next = async () => { throw Error("Must not request"); }; camera = render(); await camera.start(); assert.equal(calls.length, 0);

    for (const [name, category] of [["NotAllowedError", "denied"], ["NotFoundError", "unavailable"], ["NotReadableError", "busy"], ["SecurityError", "denied"], ["OverconstrainedError", "unavailable"], ["AbortError", "busy"], ["Unexpected", "failed"]] as const) {
      reset(); next = async () => { throw new DOMException("Private detail must not be shown", name); };
      camera = render(); await camera.start(); assert.equal(render().error, category); assert.equal(render().pending, false); assert.equal(cameraErrorFrom({ name }), category);
    }
    reset(); fakeWindow.isSecureContext = false; camera = render(); await camera.start(); assert.equal(render().error, "insecure"); assert.equal(calls.length, 0);
    reset(); delete media.getUserMedia; camera = render(); await camera.start(); assert.equal(render().error, "unsupported"); assert.equal(calls.length, 0);
    reset(); const playback = stream(); next = async () => playback.value; failPlay = true; camera = render(); await camera.start();
    assert.equal(render().error, "previewFailed"); assert(playback.tracks.every(t => t.stops === 1)); assert.equal(video.srcObject, null);
    reset(); const ended = stream(); next = async () => ended.value; camera = render(); await camera.start(); ended.tracks[0].end();
    assert.equal(render().error, "interrupted"); assert(ended.tracks.every(t => t.stops === 1));

    unmount();
    (auth as any).useAuth = () => ({ user: { id: "synthetic-user", role: "SA", isActive: true }, isLoading: false });
    (language as any).useLanguage = () => ({ t: translate });
    for (const locale of ["en", "id"] as const) {
      setActiveLanguage(locale); const html = renderToStaticMarkup(React.createElement(CameraPreparation));
      assert(html.includes(translate("faceVerification.start")) && html.includes(translate("facePad.cameraPrivacy")));
      assert(html.includes("playsInline") || html.includes("playsinline")); assert(html.includes('muted=""'));
      assert(html.includes('href="/settings"'));
      (auth as any).useAuth = () => ({ user: null, isLoading: false });
      const denied = renderToStaticMarkup(React.createElement(FaceVerificationPage)); assert(!denied.includes("<video"), "Anonymous users never receive the camera workspace");
      (auth as any).useAuth = () => ({ user: { id: "synthetic-user", role: "SA", isActive: true }, isLoading: false });
    }
    console.log("Camera preview: explicit start, front video only, stop/unmount/logout/late permission/account change, request latch, safe errors, stream interruption and EN/ID guard passed (mock camera only)");
  } finally {
    unmount(); (auth as any).useAuth = originalAuth; (language as any).useLanguage = originalLanguage;
    (globalThis as any).window = originalWindow;
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); else delete (globalThis as any).navigator;
    setActiveLanguage("en");
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
