import assert from 'node:assert/strict';
import React, { isValidElement, type ReactNode } from 'react';
import * as language from '../components/i18n/language-provider';
import * as milestoneHooks from '../hooks/use-milestone-workflow';
import * as projectHooks from '../hooks/use-projects';
import { DeadlineDialog, DeadlineReviewDialog } from '../components/projects/milestone-deadline-dialogs';
import { PlanReviewDialog } from '../components/projects/project-plan-review-dialog';
import { Button } from '../components/ui/button';
import { ApiError } from './api-client';
import { setActiveLanguage, translate } from '../i18n';
import type { ProjectMilestonePhase4 } from '../types/project';

type Element = React.ReactElement<any>;
const elements = (node: ReactNode): Element[] => Array.isArray(node) ? node.flatMap(elements)
  : isValidElement(node) ? [node as Element, ...elements((node as Element).props.children)] : [];

export async function testProjectReviewDialogs() {
  const originals = { state: React.useState, ref: React.useRef, effect: React.useEffect,
    language: language.useLanguage, save: milestoneHooks.useSaveMilestoneDeadline,
    review: milestoneHooks.useReviewDeadlineApproval, pics: projectHooks.useSolutionArchitects };
  let slots: any[] = [], cursor = 0, dirty = false, effects: Array<() => void> = [];
  const reset = () => { slots = []; };
  (React as any).useState = (initial: any) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (next: any) => {
      const value = typeof next === 'function' ? next(slots[index]) : next;
      if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; }
    }];
  };
  (React as any).useRef = (initial: any) => slots[cursor++] ??= { current: initial };
  (React as any).useEffect = (effect: () => void, deps: unknown[]) => {
    const index = cursor++;
    if (!slots[index] || deps.some((value, at) => !Object.is(value, slots[index][at]))) {
      slots[index] = deps; effects.push(effect);
    }
  };
  const render = (component: () => Element): Element[] => {
    for (let attempt = 0; attempt < 10; attempt++) {
      cursor = 0; dirty = false; effects = [];
      const tree = component(); effects.forEach(effect => effect());
      if (!dirty) return elements(tree);
    }
    throw Error('Component did not settle');
  };
  (language as any).useLanguage = () => ({ t: translate });
  (projectHooks as any).useSolutionArchitects = () => ({ data: [{ id: 'sa-1', full_name: 'Synthetic SA', role: 'SA', email: 'sa@fixture.invalid' }] });
  const change = (tree: Element[], id: string, value: string) => tree.find(node => node.props.id === id)!.props.onChange({ target: { value } });
  const submit = (tree: Element[]) => tree.find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} });
  const submitButton = (tree: Element[]) => tree.find(node => node.type === Button && node.props.type === 'submit')!;
  const hasError = (tree: Element[], key: Parameters<typeof translate>[0]) => tree.some(node => node.props.role === 'alert' && node.props.children === translate(key));
  const milestone = { id: 'm-1', name: 'Synthetic milestone', project_id: 'p-1', start_date: '2026-10-01',
    duration_working_days: 3, due_date: '2026-10-05', status: 'IN_PROGRESS' } as ProjectMilestonePhase4;

  try {
    for (const locale of ['en', 'id'] as const) {
      setActiveLanguage(locale);
      reset();
      const writes: unknown[] = [];
      let open = true;
      (milestoneHooks as any).useSaveMilestoneDeadline = () => ({ isPending: false, prepare() {},
        mutateAsync: async (input: unknown) => { writes.push(input); } });
      const deadline = () => render(() => DeadlineDialog({ open, onOpenChange: value => { open = value; }, projectId: 'p-1', milestone }));
      await submit(deadline());
      assert(hasError(deadline(), 'projectDetail.deadlineReasonRequired'));
      change(deadline(), 'deadline-change-reason', '  Customer requested more time  ');
      change(deadline(), 'deadline-working-days', '0');
      await submit(deadline());
      assert(hasError(deadline(), 'projectDetail.deadlineScheduleRequired'));
      change(deadline(), 'deadline-working-days', '5');
      await submit(deadline()); assert.equal(writes.length, 0, 'First submit only opens confirmation');
      await submit(deadline());
      assert.deepEqual([...writes], [{ start_date: '2026-10-01', duration_working_days: 5, reason: 'Customer requested more time' }]);
      assert.equal(open, false);

      reset(); writes.length = 0; open = true;
      let failure: Error | undefined;
      (milestoneHooks as any).useReviewDeadlineApproval = () => ({ isPending: false, prepare() {},
        mutateAsync: async (input: unknown) => { writes.push(input); if (failure) throw failure; } });
      const reviewProps = { open, onOpenChange: (value: boolean) => { open = value; }, projectId: 'p-1', milestoneId: 'm-1',
        approvalId: 'approval-1', type: 'DEADLINE' as const, decision: 'REJECT' as const };
      const review = () => render(() => DeadlineReviewDialog(reviewProps));
      await submit(review()); assert(hasError(review(), 'projectDetail.reviewReasonRequired'));
      change(review(), 'workflow-review-note', '  Needs a valid schedule  ');
      await submit(review()); assert.equal(writes.length, 0);
      await submit(review());
      assert.deepEqual([...writes], [{ approvalId: 'approval-1', decision: 'REJECT', note: 'Needs a valid schedule' }]);
      assert.equal(open, false);

      reset(); writes.length = 0;
      failure = new ApiError('Synthetic conflict', 409);
      const approve = () => render(() => DeadlineReviewDialog({ ...reviewProps, decision: 'APPROVE' }));
      await submit(approve()); await submit(approve());
      assert(hasError(approve(), 'businessAudit.stale'));
      assert(submitButton(approve()).props.disabled);
      change(approve(), 'workflow-review-note', 'Try again');
      await submit(approve()); assert.equal(writes.length, 1, 'Stale approval stays blocked after editing the note');
      reset(); assert(submitButton(render(() => DeadlineReviewDialog({ ...reviewProps, approvalId: undefined }))).props.disabled);

      reset(); writes.length = 0;
      let release!: () => void;
      failure = undefined;
      (milestoneHooks as any).useReviewDeadlineApproval = () => ({ isPending: false, prepare() {},
        mutateAsync: async (input: unknown) => { writes.push(input); await new Promise<void>(resolve => { release = resolve; }); } });
      await submit(approve());
      const confirmed = approve();
      const first = submit(confirmed), duplicate = submit(confirmed);
      assert.equal(writes.length, 1, 'Repeated clicks while pending submit only once');
      release(); await Promise.all([first, duplicate]);

      reset(); writes.length = 0;
      let planFailure: Error | undefined, reloads = 0;
      const planProps: Parameters<typeof PlanReviewDialog>[0] = { open: true, onOpenChange() {}, decision: 'APPROVE',
        projectName: 'Synthetic project', phaseName: 'Pra-Tender', approvalId: 'plan-1', targetApprovalId: 'plan-1',
        approvalStatus: 'PENDING', picRevision: '7', currentPicName: 'Previous SA', workflowModel: 'OPERATIONAL_V2', workflowVersion: 2,
        isPending: false, onConflictReload: async () => { reloads++; },
        onSubmit: async (...args) => { writes.push(args); if (planFailure) throw planFailure; } };
      const plan = () => render(() => PlanReviewDialog(planProps));
      assert(submitButton(plan()).props.disabled, 'Operational V2 approval requires a PIC');
      await submit(plan()); assert.equal(writes.length, 0);
      change(plan(), 'project-plan-pic', 'sa-1');
      change(plan(), 'project-plan-review-note', '  Reviewed  ');
      await submit(plan()); assert.equal(writes.length, 0);
      planProps.picRevision = '8'; // Background refresh must not replace the reviewed revision.
      await submit(plan());
      const approved = writes[0] as any[];
      assert.deepEqual(approved.slice(0, 4), ['Reviewed', 'sa-1', 'plan-1', '7']);
      assert.match(approved[4], /^[a-f0-9-]{36}$/i);

      reset(); writes.length = 0;
      change(plan(), 'project-plan-pic', 'sa-1'); await submit(plan());
      planProps.approvalId = 'plan-replaced';
      await submit(plan()); assert.equal(writes.length, 0);
      assert(hasError(plan(), 'reviewConfirm.stale'), 'Changed approval is rejected before sending');

      reset(); writes.length = 0; planProps.approvalId = 'plan-1';
      planFailure = new ApiError('Synthetic PIC conflict', 409, 'PIC_CONFLICT');
      change(plan(), 'project-plan-pic', 'sa-1'); await submit(plan()); await submit(plan());
      assert.equal(reloads, 1); assert(hasError(plan(), 'picOperation.conflict'));
      assert.equal(plan().find(node => node.props.id === 'project-plan-pic')!.props.disabled, false);

      reset(); writes.length = 0; planFailure = undefined;
      planProps.decision = 'REJECT';
      assert(!plan().some(node => node.props.id === 'project-plan-pic'), 'Rejecting a plan does not require selecting a PIC');
      await submit(plan()); assert(hasError(plan(), 'projectDetail.planReasonRequired'));
      change(plan(), 'project-plan-review-note', 'Needs revision');
      await submit(plan()); await submit(plan());
      assert.deepEqual((writes[0] as any[]).slice(0, 4), ['Needs revision', undefined, 'plan-1', '8']);
      planProps.isPending = true; assert(submitButton(plan()).props.disabled);
    }
    console.log('Project review dialogs: deadline validation, confirmation, duplicate/stale guards, PIC selection and conflict, reviewed revision, reject reason, and EN/ID passed.');
  } finally {
    (React as any).useState = originals.state; (React as any).useRef = originals.ref; (React as any).useEffect = originals.effect;
    (language as any).useLanguage = originals.language;
    (milestoneHooks as any).useSaveMilestoneDeadline = originals.save;
    (milestoneHooks as any).useReviewDeadlineApproval = originals.review;
    (projectHooks as any).useSolutionArchitects = originals.pics;
    setActiveLanguage('en');
  }
}
