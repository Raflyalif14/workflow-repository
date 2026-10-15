import assert from 'node:assert/strict';
import React from 'react';
import * as api from './api-client';
import * as device from './face-login-device';
import * as passive from './face-passive-test';
import * as camera from '@/hooks/use-camera-preview';
import * as auth from '@/components/auth/auth-provider';
import * as language from '@/components/i18n/language-provider';
import { FaceLogin } from '@/components/auth/face-login';
import { FaceDeviceManager } from '@/components/settings/face-device-manager';
import { clearStoredAuth } from './auth';
import { en } from '@/i18n/en';
import { id } from '@/i18n/id';

const find = (node: any, predicate: (v: any) => boolean): any => {
  if (!node || typeof node !== 'object') return null; if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) { const value = find(child, predicate); if (value) return value; } return null;
};
async function run() {
  const originals = { window: globalThis.window, api: api.apiClient, get: device.getFaceDevice, save: device.saveFaceDevice, capture: device.captureFaceFrame, burst: passive.captureFaceBurst,
    document: globalThis.document, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    useCamera: camera.useCameraPreview, useAuth: auth.useAuth, useLanguage: language.useLanguage };
  const slots: any[] = [], cleanups: any[] = [];
  const actor = crypto.randomUUID(), pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign','verify']);
  let stored: device.FaceDevice = { id: crypto.randomUUID(), privateKey: pair.privateKey, publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey), registered: false };
  let user: any = { id: actor, isActive: true }, starts = 0, photos = 0, submissions = 0, enrollment = true, signedIn = 0, removals = 0;
  let delayStart: ((v: any) => void) | null = null, startSignal: AbortSignal | null = null;
  let delayCapture: ((v: Blob) => void) | null = null;
  let singleGlance = false, scans = 0, scanError = '', scanSignal: AbortSignal | null = null, delayScan: ((v: Blob[]) => void) | null = null;
  let now = 0, timerId = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  (globalThis as any).setTimeout = (fn: () => void, ms = 0) => { const key = ++timerId; timers.set(key, { at: now + ms, fn }); return key; };
  (globalThis as any).clearTimeout = (key: number) => timers.delete(key);
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  (globalThis as any).document = page;
  const cameraState = { videoRef: { current: {} }, status: 'on', error: null, start: async () => { starts++; }, stop() {} };
  (globalThis as any).window = Object.assign(new EventTarget(), { localStorage: { getItem: () => null, removeItem() {} } });
  (camera as any).useCameraPreview = () => cameraState;
  (auth as any).useAuth = () => ({ user, completeFaceLogin: () => { signedIn++; } });
  (language as any).useLanguage = () => ({ t: (key: string) => key });
  (device as any).getFaceDevice = async () => stored;
  (device as any).saveFaceDevice = async (value: device.FaceDevice) => { stored = value; };
  (device as any).captureFaceFrame = async () => {
    photos++;
    if (delayCapture) return new Promise<Blob>(resolve => { delayCapture = resolve; });
    return new Blob([`fixture-frame-${photos}`], { type: 'image/png' });
  };
  (passive as any).captureFaceBurst = async (_video: unknown, signal: AbortSignal) => {
    scans++; scanSignal = signal;
    if (delayScan) return new Promise<Blob[]>(resolve => { delayScan = resolve; });
    if (scanError) throw Error(scanError);
    return [0, 1, 2].map(i => new Blob([`scan-${scans}-${i}`]));
  };
  const challenge = (action: string) => ({ id: crypto.randomUUID(), nonce: 'fixture-nonce', deviceId: stored.id, action, direction: 'left', expiresAt: new Date(Date.now()+90000).toISOString() });
  (api as any).apiClient = async (path: string, options: any = {}) => {
    if (path.endsWith('/capabilities')) return { enabled: true, singleGlance };
    if (path.endsWith('/device/remove') || path.endsWith('/devices/remove-all')) {
      assert.equal(JSON.parse(options.body).password, 'fixture-management-password'); removals++; return { removed: true };
    }
    if (path.includes('/device/')) return { registered: stored.registered };
    if (path.endsWith('/start')) {
      startSignal = options.signal; assert.equal(JSON.parse(options.body).deviceId, stored.id);
      if (delayStart) return new Promise(resolve => { delayStart = resolve; });
      return challenge(enrollment ? 'enroll' : singleGlance ? 'login-passive' : 'login');
    }
    assert(path.endsWith('/finish')); submissions++;
    const proof = JSON.parse(options.body.get('proof')), frames = options.body.getAll('frames');
    assert.equal(frames.length, 3); assert.equal(proof.hashes.length, 3); assert.equal(proof.signature.length, 86);
    assert(![...options.body.keys()].includes('password'), 'Password is never bundled with face frames');
    return enrollment ? { registered: true, deviceId: stored.id } : { accessToken: 'fixture-access', refreshToken: 'fixture-refresh', user: {} };
  };
  function render() {
    let cursor = 0; const effects: any[] = [], hooks = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect };
    (React as any).useState = (initial: any) => { const slot = slots[cursor++] ??= { value: initial }; return [slot.value, (v: any) => { slot.value = typeof v === 'function' ? v(slot.value) : v; }]; };
    (React as any).useRef = (initial: any) => slots[cursor++] ??= { current: initial };
    (React as any).useEffect = (fn: any, deps?: any[]) => { const i = cursor++; if (!deps || !slots[i]?.deps || deps.length !== slots[i].deps.length || !deps.every((v: any, j: number) => Object.is(v,slots[i].deps[j]))) { slots[i] = { deps }; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } };
    let tree: any; try { tree = FaceLogin({ enrollment }); } finally { Object.assign(React,hooks); } effects.forEach(fn => fn()); return tree;
  }
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  const until = async (test: () => boolean) => { for (let i=0;i<100&&!test();i++) { await settle(); render(); } assert(test()); };
  const button = (key: string) => find(render(), n => n.props?.children === key && typeof n.props.onClick === 'function');
  const click = (key: string) => {
    if (key === 'faceLogin.enroll') {
      const form = find(render(), n => n.type === 'form' && n.props['aria-label'] === 'faceLogin.setupTitle');
      assert(form); form.props.onSubmit({ preventDefault() {} }); return;
    }
    const item = button(key); assert(item); item.props.onClick();
  };
  const flush = async () => { for (let i=0;i<4;i++) { await settle(); render(); } };
  const advance = async (ms: number) => {
    const end = now + ms;
    while (true) {
      const next = [...timers.entries()].filter(([,t]) => t.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    now = end; await flush();
  };
  const reset = async (isEnrollment = false) => {
    cleanups.forEach(fn=>fn?.()); slots.length=0; cleanups.length=0;
    enrollment = isEnrollment; user = enrollment ? { id: actor, isActive: true } : null;
    page.visibilityState = 'visible'; cameraState.status = 'on'; delayStart = null; startSignal = null;
    render(); await flush();
  };
  const startLogin = async () => { click('faceLogin.signIn'); await until(() => !!button('faceLogin.useManual')); };
  const visibility = async (state: string) => { page.visibilityState=state; page.dispatchEvent(new Event('visibilitychange')); await flush(); };
  try {
    assert.deepEqual(Object.keys(en.faceLogin).sort(), Object.keys(id.faceLogin).sort());
    const loading = render();
    assert(find(loading, n => n.props?.children === 'faceLogin.loadingStatus'));
    assert(!find(loading, n => n.props?.children === 'faceLogin.disabled'));
    await settle(); await settle(); assert.equal(starts,0); assert.equal(photos,0);
    assert(find(render(), n => n.type === 'ol' && n.props['aria-label'] === 'faceLogin.setupSteps'));
    assert(find(render(), n => n.props?.children === 'faceLogin.setupMotion'));
    const input = find(render(), n => n.props?.id === 'face-enroll-password'); input.props.onChange({ target: { value:'fixture-password' } });
    const managerBeforeEnrollment = find(render(), n => n.type === FaceDeviceManager);
    assert(managerBeforeEnrollment && !('password' in managerBeforeEnrollment.props), 'Enrollment password is never passed into device management');
    click('faceLogin.enroll'); await until(() => !!button('faceLogin.useManual')); assert.equal(starts,1);
    assert.equal(button('faceLogin.capture'),null, 'Automatic mode does not require a photo button');
    for (let i=1;i<=3;i++) { await advance(2999); assert.equal(photos,i-1); await advance(1); await until(() => photos === i); }
    await until(() => stored.registered); assert.equal(submissions,1); assert.equal(stored.owner,actor); assert.equal(signedIn,0);
    assert(!find(render(), n => n.props?.id === 'face-enroll-password'), 'Successful setup stops asking for another enrollment password');
    assert(find(render(), n => n.props?.children === 'faceLogin.alreadySetUp'));
    assert(find(render(), n => n.props?.href === '/' && n.props.children === 'faceLogin.finishSetup'));
    const management = find(render(), n => n.type === FaceDeviceManager);
    assert.equal(management.props.currentDeviceId, stored.id);
    assert.equal(management.props.ownerId, actor);
    // One start click completes all three captures and submits exactly once.
    await reset(); await startLogin(); const beforeLogin = photos;
    await advance(9000); await until(() => signedIn === 1);
    assert.equal(photos,beforeLogin+3); assert.equal(submissions,2);
    await advance(10000); assert.equal(submissions,2);
    // Switching to manual cancels the pending timer, without changing the signed flow.
    await reset(); await startLogin(); const beforeManual = photos;
    await advance(1000); click('faceLogin.useManual'); await flush(); await advance(5000);
    assert.equal(photos,beforeManual);
    for (let i=1;i<=3;i++) { click('faceLogin.capture'); await until(() => photos === beforeManual+i); await flush(); }
    await until(() => signedIn === 2); assert.equal(submissions,3);
    // Hidden tabs never capture; returning gives a full fresh countdown.
    await reset(); await startLogin(); const beforePause=photos;
    await advance(2000); await visibility('hidden'); await advance(10000); assert.equal(photos,beforePause);
    await visibility('visible'); await advance(2999); assert.equal(photos,beforePause);
    await advance(1); assert.equal(photos,beforePause+1);
    click('common.cancel'); await flush(); await advance(10000); assert.equal(photos,beforePause+1);
    // A failed camera cancels the flow; recovery requires a new explicit start.
    await reset(); await startLogin(); const beforeCamera=photos;
    await advance(2000); cameraState.status='error'; await flush(); await advance(5000); assert.equal(photos,beforeCamera);
    cameraState.status='on'; await flush(); await startLogin(); await advance(2999); assert.equal(photos,beforeCamera);
    await advance(1); assert.equal(photos,beforeCamera+1); click('common.cancel'); await flush();
    // Expiry while hidden ends the capture instead of leaving the camera open.
    await reset(); await startLogin(); const beforeExpiry=photos;
    await visibility('hidden'); await advance(90001);
    assert(find(render(), n=>n.props?.children==='faceLogin.FACE_CHALLENGE_EXPIRED'));
    await visibility('visible'); await advance(5000); assert.equal(photos,beforeExpiry);
    // Logout cancels an armed timer, and a cancelled in-flight capture is discarded.
    await reset(); await startLogin(); const beforeLogout=photos;
    await advance(2000); clearStoredAuth(); await advance(5000); assert.equal(photos,beforeLogout, 'Logout prevents capture even before React effect cleanup');
    await reset(); await startLogin(); delayCapture=()=>{}; await advance(3000);
    const submissionsBeforeCancel=submissions; click('common.cancel'); await flush();
    (delayCapture as any)(new Blob(['cancelled-frame'])); delayCapture=null; await flush(); await advance(10000);
    assert.equal(submissions,submissionsBeforeCancel);
    // Unmounting removes the timer even when no capture has happened yet.
    await reset(); await startLogin(); const beforeUnmount=photos;
    cleanups.forEach(fn=>fn?.()); assert.equal(timers.size,0); assert.equal(photos,beforeUnmount);
    // A pending start cannot reopen camera after the user cancels/logs out.
    stored = { ...stored, registered:false, owner:undefined }; await reset(true);
    find(render(), n=>n.props?.id==='face-enroll-password').props.onChange({target:{value:'fixture-password'}});
    delayStart = () => {}; click('faceLogin.enroll'); await until(() => !!startSignal); await settle();
    clearStoredAuth(); assert(startSignal!.aborted); const before=starts; (delayStart as any)(challenge('enroll')); await settle(); await settle(); assert.equal(starts,before);
    assert.equal(photos,beforeUnmount); assert.equal(submissions,submissionsBeforeCancel);
    // A server-selected passive login performs one burst, no pose/countdown controls.
    singleGlance = true; stored = { ...stored, registered: true, owner: actor }; await reset();
    const beforeSingle = signedIn, beforePhotos = photos;
    assert.equal(scans, 0); click('faceLogin.signIn'); await until(() => signedIn === beforeSingle + 1);
    assert.equal(scans, 1); assert.equal(photos, beforePhotos); assert.equal(button('faceLogin.useManual'), null);
    const beforeFailed = submissions; scanError = 'FACE_SCAN_INTERRUPTED'; await reset();
    click('faceLogin.signIn'); await until(() => !!find(render(), n => n.props?.children === 'faceLogin.FACE_SCAN_INTERRUPTED'));
    assert.equal(submissions, beforeFailed); assert.equal(signedIn, beforeSingle + 1); scanError = '';
    // Cancel/logout while a burst is in flight prevents its late result from signing in.
    for (const logout of [false, true]) {
      await reset(); delayScan = () => {}; scanSignal = null; click('faceLogin.signIn'); await until(() => !!scanSignal);
      assert(find(render(), n => n.props?.children === 'faceLogin.scanning')); assert.equal(button('faceLogin.useManual'), null);
      if (logout) clearStoredAuth(); else click('common.cancel');
      assert(scanSignal!.aborted); (delayScan as any)([0, 1, 2].map(i => new Blob(['late-' + i]))); delayScan = null;
      await flush(); assert.equal(submissions, beforeFailed); assert.equal(signedIn, beforeSingle + 1);
    }
    await reset(true);
    assert(!find(render(), n => n.props?.id === 'face-enroll-password'));
    assert(find(render(), n => n.props?.children === 'faceLogin.nextLoginSingle'));
    await find(render(), n => n.type === FaceDeviceManager).props.onRemoved(crypto.randomUUID());
    assert.equal(stored.registered, true, 'Removing another browser preserves the current browser');
    await find(render(), n => n.type === FaceDeviceManager).props.onRemoved(stored.id);
    await until(() => !stored.registered); await flush();
    assert(find(render(), n => n.props?.children === 'faceLogin.removed'));
    assert(find(render(), n => n.props?.children === 'faceLogin.setupOnly'));
    assert.equal(find(render(), n => n.props?.id === 'face-enroll-password').props.value, '');
    stored = { ...stored, registered: true, owner: actor }; await reset(true);
    (device as any).saveFaceDevice = async () => { throw Error('fixture storage unavailable'); };
    await find(render(), n => n.type === FaceDeviceManager).props.onRemoved(stored.id);
    assert(find(render(), n => n.props?.children === 'faceLogin.removed'), 'Local cache failure cannot report successful server revocation as failed');
    assert(!find(render(), n => n.props?.children === 'faceLogin.alreadySetUp'));
    (device as any).saveFaceDevice = async (value: device.FaceDevice) => { stored = value; };
    stored = { ...stored, registered: true, owner: crypto.randomUUID() }; await reset(true);
    assert(!find(render(), n => n.props?.id === 'face-enroll-password'), 'Another account cannot enter the setup flow for this device');
    assert(find(render(), n => n.props?.children === 'faceLogin.FACE_DEVICE_OTHER'));
    const otherManager = find(render(), n => n.type === FaceDeviceManager);
    assert.equal(otherManager.props.currentDeviceId, null);
    await otherManager.props.onRemoved(null);
    assert.equal(stored.registered, true, 'Removing this account devices does not alter another account browser key');
    console.log('Camera UI PASS: 3-pose enrollment/fallback, one-glance single burst and signed submission, scan failure/cancel/logout, countdown/manual controls, camera failure, expiry, password excluded and EN/ID. Camera/provider/storage and clock mocked.');
  } finally {
    cleanups.forEach(fn=>fn?.()); (globalThis as any).window=originals.window;
    (globalThis as any).document=originals.document; globalThis.setTimeout=originals.setTimeout; globalThis.clearTimeout=originals.clearTimeout;
    (api as any).apiClient=originals.api; (device as any).getFaceDevice=originals.get; (device as any).saveFaceDevice=originals.save; (device as any).captureFaceFrame=originals.capture;
    (passive as any).captureFaceBurst=originals.burst;
    (camera as any).useCameraPreview=originals.useCamera; (auth as any).useAuth=originals.useAuth; (language as any).useLanguage=originals.useLanguage;
  }
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
