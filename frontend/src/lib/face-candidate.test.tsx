import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import React from 'react';
import * as api from './api-client';
import * as language from '@/components/i18n/language-provider';
import { FaceCandidateTest } from '@/components/settings/face-candidate-test';
import { clearStoredAuth } from './auth';
import { en } from '@/i18n/en';
import { id } from '@/i18n/id';

const hash = createHash('sha256').update('synthetic-frame').digest('hex');
const photo = () => ({ blob: new Blob(['synthetic-frame'], { type: 'image/png' }), width: 640, height: 480 });
const baseline = () => ({ imageSha256: hash, probabilities: { real: .01, spoof: .99 } });
function response(requestId: string) {
  return { requestId, slot: 'A', status: 'SUCCESS', prediction: null, imageSha256: hash, durationMs: 120,
    frame: { width: 640, height: 480 }, baseline: { real: .01, spoof: .99 },
    candidate: { version: 'minifas-yunet-native-v1', probabilities: { real: .5, spoof: .5 }, models: [
      { model: 'MiniFASNetV2', sha256: 'a5eb02e1843f19b5386b953cc4c9f011c3f985d0ee2bb9819eea9a142099bec0',
        onnxSha256: '2e4d897d506d2265ae3bf8c092002a527b2e78d940f8c60223a4ee03b7b65e11', scale: 2.7,
        rect: { left: 0, top: 0, right: 640, bottom: 480 }, classes: [.2, .7, .1] },
      { model: 'MiniFASNetV1SE', sha256: '84ee1d37d96894d5e82de5a57df044ef80a58be2b218b5ed7cdfd875ec2f5990',
        onnxSha256: '6e4baab0c157a97f274f69bbd2bc3cf773c2ccd635a613930963963669dc3af5', scale: 4,
        rect: { left: 0, top: 0, right: 640, bottom: 480 }, classes: [.1, .3, .6] },
    ] } };
}
function find(node: any, predicate: (v: any) => boolean): any {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
async function run() {
  const original = { window: globalThis.window, fetch: api.authorizedFetch, api: api.apiClient, language: language.useLanguage };
  const slots: any[] = [], cleanups: any[] = [], requests: any[] = [];
  let props: any = { owner: 'actor', eligible: true, photo: photo(), result: baseline() };
  (globalThis as any).window = Object.assign(new EventTarget(), { localStorage: { getItem: () => null, removeItem() {} } });
  (language as any).useLanguage = () => ({ t: (key: string) => key });
  (api as any).apiClient = async () => ({ candidateEnabled: true });
  (api as any).authorizedFetch = async (url: string, options: any) => {
    assert.equal(url, '/face-pad/candidate');
    assert.deepEqual([...options.body.keys()], ['photo', 'slot', 'requestId']);
    assert.equal(await options.body.get('photo').text(), 'synthetic-frame');
    return new Promise(resolve => requests.push({ signal: options.signal, requestId: options.body.get('requestId'), resolve }));
  };
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  const until = async (condition: () => boolean) => { for (let i=0; i<100 && !condition(); i++) await settle(); assert(condition()); };
  function render() {
    let cursor = 0; const effects: any[] = [], hooks = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect };
    (React as any).useState = (initial: any) => { const slot = slots[cursor++] ??= { value: initial }; return [slot.value, (value: any) => { slot.value = value; }]; };
    (React as any).useRef = (initial: any) => slots[cursor++] ??= { current: initial };
    (React as any).useEffect = (fn: any, deps: any[]) => { const i = cursor++; if (!slots[i]?.deps?.every((v: any, j: number) => Object.is(v, deps[j]))) { slots[i] = { deps }; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } };
    let tree: any; try { tree = FaceCandidateTest(props); } finally { Object.assign(React, hooks); }
    effects.forEach(fn => fn()); return tree;
  }
  const click = () => { const button = find(render(), n => typeof n.props?.onClick === 'function'); assert(button); button.props.onClick(); };
  const displayed = () => find(render(), n => n.props?.['data-candidate-result'] === 'true');
  const reply = (mutate = (v: any) => v) => { const request = requests.at(-1); request.resolve(new Response(JSON.stringify({ data: mutate(response(request.requestId)) }))); };
  try {
    assert.deepEqual(Object.keys(en.faceCandidate).sort(), Object.keys(id.faceCandidate).sort());
    render(); await settle(); assert.equal(requests.length, 0, 'Mount does not send photo');
    click(); click(); await until(() => requests.length === 1); reply(); await until(() => !!displayed());
    assert.equal(requests.length, 1, 'Double click sends once');
    for (const mutate of [
      (v: any) => ({ ...v, requestId: 'wrong' }), (v: any) => ({ ...v, imageSha256: 'f'.repeat(64) }),
      (v: any) => ({ ...v, frame: { width: 800, height: 600 } }),
      (v: any) => ({ ...v, baseline: { real: .9, spoof: .1 } }),
    ]) {
      const count = requests.length; click(); await until(() => requests.length > count); reply(mutate);
      await until(() => !!find(render(), n => n.props?.role === 'alert')); assert.equal(displayed(), null);
    }
    for (const revoke of [
      () => { props = { ...props, photo: photo() }; render(); },
      () => { props = { ...props, owner: 'other' }; render(); },
      () => { clearStoredAuth(); },
      () => { window.dispatchEvent(new Event('pagehide')); },
      () => { cleanups.forEach(fn => fn?.()); },
    ]) {
      props = { ...props, owner: crypto.randomUUID() }; render(); await settle();
      const count = requests.length; click(); await until(() => requests.length > count); revoke();
      assert(requests.at(-1).signal.aborted); reply(); await settle(); await settle(); assert.equal(displayed(), null, 'Old response cannot reappear');
    }
    console.log('Candidate UI PASS: explicit transmission, double-click guard, photo/request/frame/baseline binding, account/photo/logout/pagehide/unmount cancellation and EN/ID keys. Transport mocked.');
  } finally {
    cleanups.forEach(fn => fn?.()); (globalThis as any).window = original.window;
    (api as any).authorizedFetch = original.fetch; (api as any).apiClient = original.api; (language as any).useLanguage = original.language;
  }
}
void run().catch(e => { console.error(e); process.exitCode = 1; });
