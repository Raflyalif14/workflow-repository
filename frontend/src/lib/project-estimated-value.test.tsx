import assert from 'node:assert/strict';
import React, { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as projectHooks from '../hooks/use-projects';
import * as language from '../components/i18n/language-provider';
import { EstimatedProjectValue } from '../components/projects/estimated-project-value';
import { Dialog } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { ApiError } from './api-client';
import { canEditEstimatedValue, formatEstimatedValue, normalizeEstimatedValue } from './project-estimated-value';
import { formatActivityAction, formatActivityDescription } from './activity-timeline';
import { DEFAULT_LANGUAGE, setActiveLanguage, translate } from '../i18n';
import { en } from '../i18n/en';
import { id } from '../i18n/id';
import { projectKeys, dashboardKeys } from './query-keys';
import type { Project } from '../types/project';

type Element = React.ReactElement<any>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  return [node as Element, ...elements((node as Element).props.children)];
}
const p = { id: 'p', name: 'Example', sales_id: 'owner', status: 'ACTIVE', estimated_revenue_exact: '100.00', updated_at: '2026-10-06T01:00:00.000Z' } as Project;
assert.equal(DEFAULT_LANGUAGE, 'en');
for (const status of ['DRAFT', 'ACTIVE'] as const) assert(canEditEstimatedValue({ ...p, status }, 'SALES', 'owner'));
for (const role of ['SA', 'HEAD_SA', 'SUPER_ADMIN', undefined]) assert(!canEditEstimatedValue(p, role, 'owner'));
assert(!canEditEstimatedValue(p, 'SALES', 'other')); assert(!canEditEstimatedValue(p, 'SALES', undefined));
for (const status of ['COMPLETED', 'WON', 'LOST', 'POSTPONED', 'WAITING_RESULT', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED']) assert(!canEditEstimatedValue({ ...p, status }, 'SALES', 'owner'));
assert(!canEditEstimatedValue({ ...p, is_postponed: true }, 'SALES', 'owner'));
for (const value of ['', ' ', '-1', 'Infinity', 'NaN', '1e3', '1,000', '1.001', '10000000000000000', '.5']) assert.equal(normalizeEstimatedValue(value), null);
assert.equal(normalizeEstimatedValue('0001.2'), '1.20'); assert.equal(normalizeEstimatedValue('0'), '0.00');
assert.equal(normalizeEstimatedValue('9999999999999999.99'), '9999999999999999.99');
assert.deepEqual(Object.keys(en.estimatedValue).sort(), Object.keys(id.estimatedValue).sort());
for (const key of Object.keys(en.estimatedValue) as Array<keyof typeof en.estimatedValue>) {
  assert.deepEqual(en.estimatedValue[key].match(/\{\w+\}/g) || [], id.estimatedValue[key].match(/\{\w+\}/g) || []);
}
for (const locale of ['en', 'id'] as const) {
  setActiveLanguage(locale);
  const large = formatEstimatedValue('9999999999999999.99');
  assert.equal(large.replace(/\D/g, ''), '999999999999999999', 'Every cent is preserved above JS safe integers');
  assert.equal(formatEstimatedValue(null), translate('common.notAvailable'));
  assert.equal(formatActivityAction('PROJECT_ESTIMATED_VALUE_CHANGED'), translate('estimatedValue.changed'));
  const description = formatActivityDescription('PROJECT_ESTIMATED_VALUE_CHANGED', 'PROJECT_ESTIMATED_VALUE_CHANGED', { before: '100.00', after: '250.50' });
  assert(description?.includes(formatEstimatedValue('100.00'))); assert(description?.includes(formatEstimatedValue('250.50')));
  assert(description?.includes('→'), 'History separator is preserved in both UTF-8 dictionaries');
  assert(!translate('estimatedValue.confirm', { before: '100', after: '250' }).includes('{'));
}
setActiveLanguage('en');

async function checkDialog() {
  const originals = { state: React.useState, ref: React.useRef, context: React.useContext,
    language: language.useLanguage, mutation: projectHooks.useUpdateEstimatedValue };
  const states: any[] = [], refs: any[] = [];
  let stateIndex = 0, refIndex = 0;
  const client = new QueryClient();
  const requests: any[] = [];
  let result: (() => Promise<any>) = async () => ({});
  const mutation: any = { isPending: false, mutateAsync: async (data: any) => {
    requests.push(data); mutation.isPending = true;
    try { return await result(); } finally { mutation.isPending = false; }
  } };
  (React as any).useState = (initial: any) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (next: any) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
  };
  (React as any).useRef = (initial: any) => { const index = refIndex++; return refs[index] ??= { current: initial }; };
  (React as any).useContext = () => client;
  (language as any).useLanguage = () => ({});
  (projectHooks as any).useUpdateEstimatedValue = () => mutation;
  const props = { project: p, role: 'SALES', userId: 'owner' };
  const render = (project = p) => { stateIndex = 0; refIndex = 0; return EstimatedProjectValue({ ...props, project }); };
  const find = (label: string, tree = render()) => elements(tree).find(node => node.props.children === label)!;
  const dialog = () => elements(render()).find(node => node.type === Dialog)!;
  const input = () => elements(render()).find(node => node.type === Input)!;
  const flush = () => new Promise<void>(resolve => setImmediate(resolve));
  try {
    assert.equal(dialog().props.open, false);
    find(translate('estimatedValue.edit')).props.onClick();
    assert.equal(dialog().props.open, true);
    input().props.onChange({ target: { value: '200.50' } });
    find(translate('common.cancel')).props.onClick();
    assert.equal(requests.length, 0); assert.equal(dialog().props.open, false);
    find(translate('estimatedValue.edit')).props.onClick();
    input().props.onChange({ target: { value: '   ' } });
    find(translate('estimatedValue.review')).props.onClick();
    assert(elements(render()).some(node => node.props.role === 'alert')); assert.equal(requests.length, 0);
    input().props.onChange({ target: { value: '200.50' } });
    find(translate('estimatedValue.review')).props.onClick();
    assert.equal(requests.length, 0, 'Review step does not mutate');
    render({ ...p, estimated_revenue_exact: '150.00', updated_at: '2026-10-06T01:00:03.000Z' });
    assert.equal(states[2].value, '100.00', 'Query refresh cannot silently change the value being confirmed');
    setActiveLanguage('id');
    assert.equal(states[1], '200.50'); assert.equal(states[0], 'confirm');
    assert(find(translate('estimatedValue.save')));
    setActiveLanguage('en');
    let release!: () => void;
    result = () => new Promise<void>(resolve => { release = resolve; });
    const save = find(translate('estimatedValue.save')).props.onClick;
    save(); save();
    assert.equal(requests.length, 1, 'Synchronous latch protects the first render before pending propagates');
    assert.equal(find(translate('estimatedValue.saving')).props.disabled, true);
    dialog().props.onOpenChange(false); assert.equal(dialog().props.open, true, 'Cannot dismiss pending save');
    release(); await flush(); assert.equal(dialog().props.open, false);
    find(translate('estimatedValue.edit')).props.onClick();
    input().props.onChange({ target: { value: '300.25' } }); find(translate('estimatedValue.review')).props.onClick();
    result = async () => { throw new ApiError('private detail', 503, 'ESTIMATE_UNAVAILABLE'); };
    find(translate('estimatedValue.save')).props.onClick(); await flush();
    assert.equal(dialog().props.open, true); assert.equal(states[1], '300.25');
    assert(find(translate('estimatedValue.failed'))); const firstIntent = requests.at(-1);
    result = async () => ({}); find(translate('estimatedValue.save')).props.onClick(); await flush();
    assert.deepEqual(requests.at(-1), firstIntent, 'Retry retains value, CAS and receipt identity');
    find(translate('estimatedValue.edit')).props.onClick(); input().props.onChange({ target: { value: '400' } });
    find(translate('estimatedValue.review')).props.onClick();
    result = async () => { throw new ApiError('stale', 409, 'ESTIMATE_STALE'); };
    find(translate('estimatedValue.save')).props.onClick(); await flush();
    assert(find(translate('estimatedValue.stale'))); assert(!elements(render()).some(node => node.props.children === translate('estimatedValue.save')));
    const latest = { ...p, estimated_revenue_exact: '350.00', updated_at: '2026-10-06T01:00:05.000Z' };
    client.refetchQueries = async () => { client.setQueryData(projectKeys.detailWithoutActivity('p'), latest); };
    find(translate('estimatedValue.reload')).props.onClick(); await flush();
    assert.equal(states[0], 'edit'); assert.equal(states[1], '400', 'Explicit reload preserves input while updating old-value baseline');
    assert.equal(states[2].value, '350.00');
    find(translate('estimatedValue.review')).props.onClick(); result = async () => ({});
    find(translate('estimatedValue.save')).props.onClick(); await flush();
    assert.equal(requests.at(-1).expected_updated_at, latest.updated_at); assert.notEqual(requests.at(-1).request_id, firstIntent.request_id);
    const missing = render({ ...p, estimated_revenue_exact: undefined });
    assert.equal(find(translate('estimatedValue.edit'), missing).props.disabled, true, 'Missing exact server value is not editable as zero');
  } finally {
    (React as any).useState = originals.state; (React as any).useRef = originals.ref; (React as any).useContext = originals.context;
    (language as any).useLanguage = originals.language; (projectHooks as any).useUpdateEstimatedValue = originals.mutation;
    client.clear(); setActiveLanguage('en');
  }
}

async function checkInvalidation() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  const keys: unknown[][] = [];
  client.invalidateQueries = async filters => { keys.push([...(filters?.queryKey || [])]); };
  let mutation!: ReturnType<typeof projectHooks.useUpdateEstimatedValue>;
  function Harness() { mutation = projectHooks.useUpdateEstimatedValue('p'); return null; }
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Harness)));
  const original = globalThis.fetch;
  let fail = true;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.method, 'PATCH'); assert((init?.body as string).includes('request_id'));
    return new Response(JSON.stringify({ success: !fail, data: {}, errors: fail ? { code: 'ESTIMATE_UNAVAILABLE' } : undefined }), { status: fail ? 503 : 200 });
  };
  const input = { estimated_revenue: '1.00', expected_updated_at: p.updated_at!, request_id: crypto.randomUUID() };
  try {
    await assert.rejects(mutation.mutateAsync(input)); assert.equal(keys.length, 0, 'Failed save never invalidates as success');
    fail = false; await mutation.mutateAsync(input);
    for (const key of [projectKeys.all(), projectKeys.detail('p'), projectKeys.activities('p'), dashboardKeys.overview()]) assert(keys.some(actual => JSON.stringify(actual) === JSON.stringify(key)));
  } finally { globalThis.fetch = original; client.clear(); }
}
void (async () => { await checkDialog(); await checkInvalidation(); console.log('Estimated value: eligibility, exact decimal validation, EN/ID, actual dialog cancel/confirm/pending/failure/retry/stale/locale handlers and mutation invalidation passed.'); })()
  .catch(error => { console.error(error); process.exitCode = 1; });
