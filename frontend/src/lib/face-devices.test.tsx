import assert from 'node:assert/strict';
import React from 'react';
import * as api from './api-client';
import * as language from '@/components/i18n/language-provider';
import { FaceDeviceManager, RegisteredFaceDevice } from '@/components/settings/face-device-manager';
import { clearStoredAuth } from './auth';
import { en } from '@/i18n/en';
import { id } from '@/i18n/id';

const findAll = (node: any, predicate: (v: any) => boolean): any[] => {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(child => findAll(child, predicate))];
};
async function run() {
  const original = { api: api.apiClient, language: language.useLanguage, window: globalThis.window };
  const ownerId = crypto.randomUUID(), currentDeviceId = crypto.randomUUID(), remote = crypto.randomUUID();
  const records: RegisteredFaceDevice[] = [
    { deviceId: currentDeviceId, browser: 'edge', platform: 'windows', createdAt: '2026-10-14T03:00:00.000Z', lastUsedAt: '2026-10-15T03:00:00.000Z' },
    { deviceId: remote, browser: 'unknown', platform: 'unknown', createdAt: '2026-10-13T03:00:00.000Z', lastUsedAt: null },
  ];
  const slots: any[] = [], cleanups: any[] = [], removed: (string | null)[] = [], posts: any[] = [];
  let listCalls = 0, listError = false, removeError = '', heldList = false, heldRemove = false;
  let resolveList: ((value: any) => void) | undefined, resolveRemove: ((value: any) => void) | undefined;
  let listSignal: AbortSignal | undefined, removeSignal: AbortSignal | undefined;
  const props = { ownerId, currentDeviceId, registered: true, onRemoved: async (value: string | null) => { removed.push(value); } };
  (globalThis as any).window = Object.assign(new EventTarget(), { localStorage: { getItem: () => null, removeItem() {} } });
  (language as any).useLanguage = () => ({ t: (key: string, params?: any) => key + (params?.name ? ':' + params.name : ''), formatDate: (value: string) => 'formatted:' + value });
  (api as any).apiClient = async (path: string, options: any = {}) => {
    if (path === '/face-login/devices') {
      listCalls++; listSignal = options.signal;
      if (heldList) return new Promise(resolve => { resolveList = resolve; });
      if (listError) throw Error('unavailable'); return { devices: records };
    }
    assert.equal(options.method, 'POST'); removeSignal = options.signal;
    posts.push({ path, body: JSON.parse(options.body) });
    if (heldRemove) return new Promise(resolve => { resolveRemove = resolve; });
    if (removeError) throw new api.ApiError('fixture rejection', 422, removeError);
    return { removed: true };
  };
  function render() {
    let cursor = 0; const effects: (() => void)[] = [], hooks = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect };
    (React as any).useState = (initial: any) => { const slot = slots[cursor++] ??= { value: initial }; return [slot.value, (value: any) => { slot.value = typeof value === 'function' ? value(slot.value) : value; }]; };
    (React as any).useRef = (initial: any) => slots[cursor++] ??= { current: initial };
    (React as any).useEffect = (effect: any, deps: any[]) => {
      const i = cursor++;
      if (!slots[i]?.deps || !deps.every((value: any, j: number) => Object.is(value, slots[i].deps[j]))) {
        slots[i] = { deps }; effects.push(() => { cleanups[i]?.(); cleanups[i] = effect(); });
      }
    };
    let tree: any; try { tree = FaceDeviceManager(props); } finally { Object.assign(React, hooks); }
    effects.forEach(effect => effect()); return tree;
  }
  const settle = async () => { for (let i = 0; i < 3; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } };
  const find = (predicate: (value: any) => boolean) => findAll(render(), predicate)[0];
  const text = (key: string) => find(node => node.props?.children === key);
  const click = (key: string) => { const node = find(value => value.props?.children === key && typeof value.props.onClick === 'function'); assert(node, key); assert(!node.props.disabled); node.props.onClick(); };
  const select = (deviceId: string) => {
    const row = find(node => node.type === 'li' && String(node.key).endsWith(deviceId)); assert(row);
    const button = findAll(row, node => typeof node.props?.onClick === 'function')[0]; assert(button); button.props.onClick();
  };
  const password = (value: string) => { const input = find(node => node.props?.id === 'face-device-password'); assert(input); input.props.onChange({ target: { value } }); };
  const submit = () => { const form = find(node => node.type === 'form'); assert(form); form.props.onSubmit({ preventDefault() {} }); };
  const rows = () => findAll(render(), node => node.type === 'li');
  const reset = async () => {
    cleanups.forEach(cleanup => cleanup?.()); slots.length = 0; cleanups.length = 0;
    render(); await settle();
  };
  try {
    assert.deepEqual(Object.keys(en.faceDevices).sort(), Object.keys(id.faceDevices).sort());
    assert(text('faceDevices.loading')); await settle(); assert.equal(listCalls, 1); assert.equal(rows().length, 2);
    assert.equal(findAll(render(), node => node.props?.children === 'faceDevices.current').length, 1);
    assert(text('formatted:' + records[0].createdAt)); assert(text('formatted:' + records[0].lastUsedAt));
    assert(text('faceDevices.notRecorded')); assert(text('faceDevices.historyHelp'));
    select(remote); assert.equal(posts.length, 0); assert(find(node => node.props?.type === 'submit').props.disabled);
    password('fixture-password'); click('common.cancel'); assert(!find(node => node.type === 'form')); assert.equal(posts.length, 0);
    select(remote); assert.equal(find(node => node.props?.id === 'face-device-password').props.value, '');
    password('wrong-password'); removeError = 'FACE_PASSWORD_INVALID'; submit(); await settle();
    assert(text('faceLogin.FACE_PASSWORD_INVALID')); assert.equal(rows().length, 2); assert.equal(removed.length, 0);
    assert.equal(find(node => node.props?.id === 'face-device-password').props.value, '');
    removeError = ''; password('fixture-password'); submit(); await settle();
    assert.deepEqual(posts.at(-1), { path: '/face-login/device/remove', body: { password: 'fixture-password', deviceId: remote } });
    assert.deepEqual(removed, [remote]); assert.equal(rows().length, 1); assert(text('faceDevices.current')); assert(text('faceDevices.removedOne'));
    select(currentDeviceId); password('fixture-password'); submit(); await settle();
    assert.deepEqual(removed, [remote, currentDeviceId]); assert(text('faceDevices.empty'));
    await reset(); click('faceLogin.removeAll'); password('fixture-password'); submit(); await settle();
    assert.deepEqual(posts.at(-1), { path: '/face-login/devices/remove-all', body: { password: 'fixture-password' } });
    assert.equal(removed.at(-1), null); assert(text('faceDevices.removedAll')); assert(text('faceDevices.empty'));
    listError = true; await reset(); assert(text('faceDevices.loadFailed')); assert(!text('faceDevices.empty'));
    listError = false; click('faceDevices.refresh'); await settle(); assert.equal(rows().length, 2);
    // A response arriving after logout must not restore account device information.
    heldList = true; await reset(); clearStoredAuth(); assert(listSignal?.aborted);
    resolveList!({ devices: records }); await settle(); assert.equal(rows().length, 0); heldList = false;
    await reset(); heldRemove = true; select(remote); password('fixture-password'); submit();
    const callbacks = removed.length; clearStoredAuth(); assert(removeSignal?.aborted); resolveRemove!({ removed: true }); await settle();
    assert.equal(removed.length, callbacks); assert.equal(rows().length, 0); assert(!find(node => node.type === 'form')); heldRemove = false;
    console.log('Face device UI PASS: dates/current-browser badge/legacy values, load failure/retry, password confirmation and cancellation, chosen/all device requests, preserving current device on remote removal, and ignoring late responses after logout. API mocked.');
  } finally { cleanups.forEach(cleanup => cleanup?.()); (api as any).apiClient = original.api; (language as any).useLanguage = original.language; (globalThis as any).window = original.window; }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
