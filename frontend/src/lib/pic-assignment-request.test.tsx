import assert from 'node:assert/strict';
import React, { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { retainPicRequest } from './pic-assignment-request';
import { ApiError } from './api-client';
import { PicAssignmentCard } from '../components/projects/pic-assignment-card';
import { ApprovalActionDialog } from '../components/approvals/approval-action-dialog';
import { Dialog } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import * as hooks from '../hooks/use-projects';
import * as auth from '../components/auth/auth-provider';
import * as approvalHooks from '../hooks/use-approvals';
import * as language from '../components/i18n/language-provider';
import { en } from '../i18n/en';
import { id } from '../i18n/id';
import { DEFAULT_LANGUAGE, setActiveLanguage, translate } from '../i18n';
import { projectKeys, dashboardKeys, approvalKeys, assignmentKeys } from './query-keys';
import type { Project } from '../types/project';
import type { ApprovalItem } from '../types/approval';

const captured = retainPicRequest(null, '3', { pic_id: 'a', reason: 'Retained' });
assert.equal(retainPicRequest(captured, '3', { pic_id: 'a', reason: 'Retained' }), captured);
assert.notEqual(retainPicRequest(captured, '4', { pic_id: 'a', reason: 'Retained' }).id, captured.id);
assert.notEqual(retainPicRequest(captured, '3', { pic_id: 'b', reason: 'Retained' }).id, captured.id);
assert.equal(DEFAULT_LANGUAGE, 'en');
assert.deepEqual(Object.keys(en.picOperation).sort(), Object.keys(id.picOperation).sort());
for (const key of Object.keys(en.picOperation) as Array<keyof typeof en.picOperation>) {
  assert.deepEqual(en.picOperation[key].match(/\{\w+\}/g) || [], id.picOperation[key].match(/\{\w+\}/g) || []);
}
type Element = React.ReactElement<any>;
const elements = (node: ReactNode): Element[] => Array.isArray(node) ? node.flatMap(elements)
  : isValidElement(node) ? [node as Element, ...elements((node as Element).props.children)] : [];
const p = { id: 'p', name: 'Project', pic_revision: '3', status: 'ACTIVE', pic: { id: 'old', full_name: 'Old PIC', email: 'mock@example.invalid' },
  scenario: { workflow_model: 'OPERATIONAL_V2', workflow_version: 2 } } as Project;

async function checkHandlers() {
  const original = { state: React.useState, ref: React.useRef, context: React.useContext, effect: React.useEffect, memo: React.useMemo,
    language: language.useLanguage, assign: hooks.useAssignPic, pics: hooks.useSolutionArchitects, project: hooks.useProject, process: approvalHooks.useProcessApproval };
  let slots: any[] = [], refs: any[] = [], effects: any[] = [];
  let si = 0, ri = 0, ei = 0;
  const client = new QueryClient();
  const requests: any[] = [];
  let outcome: () => Promise<any> = async () => ({});
  const mutation: any = { isPending: false, mutateAsync: async (data: any) => {
    requests.push(data); mutation.isPending = true;
    try { return await outcome(); } finally { mutation.isPending = false; }
  } };
  let current = p;
  const options = [{ id: 'new', full_name: 'New PIC', email: 'mock@example.invalid', role: 'SA' }];
  (React as any).useState = (initial: any) => { const i = si++; if (!(i in slots)) slots[i] = initial; return [slots[i], (next: any) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; };
  (React as any).useRef = (initial: any) => { const i = ri++; return refs[i] ??= { current: initial }; };
  (React as any).useEffect = (effect: () => void, deps: any[]) => { const i = ei++, serialized = JSON.stringify(deps); if (effects[i] !== serialized) { effects[i] = serialized; effect(); } };
  (React as any).useMemo = (callback: () => any) => callback();
  (React as any).useContext = () => client;
  (language as any).useLanguage = () => ({});
  (hooks as any).useAssignPic = () => mutation;
  (hooks as any).useSolutionArchitects = () => ({ data: options, isLoading: false });
  (approvalHooks as any).useProcessApproval = () => mutation;
  (hooks as any).useProject = () => ({ data: current, isFetching: false, refetch: async () => { current = { ...current, pic_revision: '4' }; } });
  const reset = () => { slots = []; refs = []; effects = []; si = ri = ei = 0; requests.length = 0; current = p; };
  const run = (fn: () => Element | null) => { si = ri = ei = 0; return fn(); };
  const card = () => run(() => PicAssignmentCard({ project: current, canAssign: true }));
  const text = (node: ReactNode): string => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : isValidElement(node) ? text((node as Element).props.children) : '';
  const button = (label: string, tree = card()) => elements(tree).find(e => (e.type === Button || e.type === 'button') && text(e.props.children) === label)!;
  const dialog = (tree = card()) => elements(tree).find(e => e.type === Dialog)!;
  const flush = () => new Promise<void>(resolve => setImmediate(resolve));
  const select = () => elements(card()).find(e => e.props['aria-pressed'] === false)!.props.onClick();
  const reason = (text = 'Capacity changed') => elements(card()).find(e => e.type === 'textarea')!.props.onChange({ target: { value: text } });
  try {
    card(); button(translate('projectAction.changePic')).props.onClick(); card(); card(); select(); reason();
    button(translate('common.cancel')).props.onClick(); assert.equal(requests.length, 0); assert.equal(dialog().props.open, false);
    button(translate('projectAction.changePic')).props.onClick(); card(); card(); select(); reason();
    button(translate('projectAction.reassignPic')).props.onClick(); assert.equal(requests.length, 0);
    assert(elements(card()).some(e => e.props.children === translate('picOperation.confirm', { before: 'Old PIC', after: 'New PIC' })));
    current = { ...current, pic_revision: '9', pic: { ...current.pic!, full_name: 'Refreshed PIC' } };
    setActiveLanguage('id'); assert.equal(elements(card()).find(e => e.type === 'textarea')!.props.value, 'Capacity changed');
    assert(button(translate('picOperation.save'))); setActiveLanguage('en');
    let release!: () => void; outcome = () => new Promise<void>(resolve => { release = resolve; });
    const save = button(translate('picOperation.save')).props.onClick; save(); save(); assert.equal(requests.length, 1);
    assert.equal(requests[0].expected_pic_revision, '3', 'Refetch cannot substitute a newer revision in a confirmed request');
    dialog().props.onOpenChange(false); assert.equal(dialog().props.open, true);
    release(); await flush(); assert.equal(dialog().props.open, false);
    current = p; button(translate('projectAction.changePic')).props.onClick(); card(); card(); select(); reason(); button(translate('projectAction.reassignPic')).props.onClick();
    outcome = async () => { throw new ApiError('hidden', 503, 'PIC_UNAVAILABLE'); };
    button(translate('picOperation.save')).props.onClick(); await flush(); const receipt = requests.at(-1);
    assert.equal(dialog().props.open, true); assert.equal(elements(card()).find(e => e.type === 'textarea')!.props.value, 'Capacity changed');
    current = { ...p, pic_revision: '4', pic: { id: 'new', full_name: 'New PIC', email: 'mock@example.invalid' } as Project['pic'] };
    assert.equal(button(translate('picOperation.save')).props.disabled, false, 'Lost-response replay remains available after a refresh shows the committed target');
    outcome = async () => ({}); button(translate('picOperation.save')).props.onClick(); await flush(); assert.deepEqual(requests.at(-1), receipt);
    current = p;
    button(translate('projectAction.changePic')).props.onClick(); card(); card(); select(); reason(); button(translate('projectAction.reassignPic')).props.onClick();
    outcome = async () => { throw new ApiError('hidden', 409, 'PIC_CONFLICT'); }; button(translate('picOperation.save')).props.onClick(); await flush();
    assert(button(translate('picOperation.reload'))); const beforeReload = requests.length;
    client.refetchQueries = async () => { client.setQueryData(projectKeys.detailWithoutActivity('p'), { ...p, pic_revision: '4' }); };
    button(translate('picOperation.reload')).props.onClick(); await flush(); assert.equal(requests.length, beforeReload, 'Reload never resubmits');
    assert.equal(elements(card()).find(e => e.type === 'textarea')!.props.value, 'Capacity changed');
    button(translate('projectAction.reassignPic')).props.onClick(); outcome = async () => ({}); button(translate('picOperation.save')).props.onClick(); await flush();
    assert.equal(requests.at(-1).expected_pic_revision, '4'); assert.notEqual(requests.at(-1).request_id, receipt.request_id);

    reset(); current = { ...p, status: 'DRAFT', pic: null };
    const item = { id: 'approval', category: 'PROJECT_PLAN', projectId: 'p', projectName: 'Project', title: 'Plan', status: 'PENDING', isCurrentApproval: true, submittedAt: '2026-10-06T00:00:00Z' } as ApprovalItem;
    let open = true;
    const review = () => run(() => ApprovalActionDialog({ open, onOpenChange: value => { open = value; }, item }));
    review(); review();
    elements(review()).find(e => e.type === 'select' && e.props.value === '')!.props.onChange({ target: { value: 'new' } });
    const submit = () => elements(review()).find(e => e.type === 'form')!.props.onSubmit({ preventDefault() {} });
    await submit(); assert.equal(requests.length, 0);
    current = { ...current, pic_revision: '99' }; setActiveLanguage('id'); review(); setActiveLanguage('en');
    outcome = async () => { throw new ApiError('hidden', 503, 'PIC_UNAVAILABLE'); };
    await submit(); const planIntent = requests[0]; assert.equal(planIntent.expectedPicRevision, '3'); assert(open);
    item.status = 'APPROVED'; current = { ...current, status: 'ACTIVE', pic_revision: '4' };
    outcome = async () => ({}); await submit(); assert.equal(requests[1].requestId, planIntent.requestId); assert(!open);
  } finally {
    (React as any).useState = original.state; (React as any).useRef = original.ref; (React as any).useContext = original.context; (React as any).useEffect = original.effect; (React as any).useMemo = original.memo;
    (language as any).useLanguage = original.language; (hooks as any).useAssignPic = original.assign; (hooks as any).useSolutionArchitects = original.pics; (hooks as any).useProject = original.project; (approvalHooks as any).useProcessApproval = original.process;
    client.clear(); setActiveLanguage('en');
  }
}
async function checkHooks() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  const keys: unknown[][] = []; client.invalidateQueries = async f => { keys.push([...(f?.queryKey || [])]); };
  let mutations!: { assign: ReturnType<typeof hooks.useAssignPic>; review: ReturnType<typeof hooks.useReviewProjectPlan>; queue: ReturnType<typeof approvalHooks.useProcessApproval> };
  function Harness() { mutations = { assign: hooks.useAssignPic('p'), review: hooks.useReviewProjectPlan('p'), queue: approvalHooks.useProcessApproval() }; return null; }
  const originalAuth = auth.useAuth;
  (auth as any).useAuth = () => ({ user: { id: 'head', role: 'HEAD_SA' } });
  try { renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Harness))); }
  finally { (auth as any).useAuth = originalAuth; }
  const fetch = globalThis.fetch; const bodies: any[] = [];
  let fail = false;
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init?.body as string));
    return new Response(JSON.stringify({ success: !fail, data: { current_pic_id: 'current', replayed: true }, errors: fail ? { code: 'PIC_CONFLICT' } : undefined }), { status: fail ? 409 : 200 });
  };
  const id = crypto.randomUUID();
  try {
    for (const save of [
      () => mutations.assign.mutateAsync({ pic_id: 'new', expected_pic_revision: '5', request_id: id }),
      () => mutations.review.mutateAsync({ decision: 'APPROVE', picId: 'new', expectedApprovalId: 'a', expectedPicRevision: '5', requestId: id }),
      () => mutations.queue.mutateAsync({ item: { id: 'a', category: 'PROJECT_PLAN', projectId: 'p' } as ApprovalItem, action: 'APPROVE', picId: 'new', expectedPicRevision: '5', requestId: id }),
    ]) {
      keys.length = 0; await save();
      assert.equal(bodies.at(-1).expected_pic_revision, '5'); assert.equal(bodies.at(-1).request_id, id);
      for (const key of [projectKeys.all(), projectKeys.detail('p'), projectKeys.milestones('p'), projectKeys.assignmentHistory('p'), projectKeys.activities('p'), dashboardKeys.overview(), approvalKeys.all(), assignmentKeys.myAssignedProjects()]) {
        assert(keys.some(actual => JSON.stringify(actual) === JSON.stringify(key)), 'Every writer must invalidate '+JSON.stringify(key));
      }
      fail = true; keys.length = 0; await assert.rejects(save()); assert(keys.some(k => k[0] === 'project'), 'Conflict refreshes server state'); fail = false;
    }
    assert.equal(client.getQueryData(projectKeys.detail('p')), undefined, 'Replay never writes historical PIC into detail cache');
  } finally { globalThis.fetch = fetch; client.clear(); }
}
void (async () => { await checkHandlers(); await checkHooks(); console.log('PIC frontend: captured revision, cancel/confirm, click latch, retained selection/locale/receipt, conflict reload without automatic retry, both plan writers and invalidation passed.'); })()
  .catch(e => { console.error(e); process.exitCode = 1; });
