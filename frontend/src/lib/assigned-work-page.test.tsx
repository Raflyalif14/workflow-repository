import assert from 'node:assert/strict';
import React, { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as auth from '../components/auth/auth-provider';
import * as language from '../components/i18n/language-provider';
import * as projects from '../hooks/use-projects';
import * as outputs from '../hooks/use-output-documents';
import MilestonesPage from '../app/milestones/page';
import { countAssignedMilestonesNeedingAction } from './assigned-milestone-ux';
import { setActiveLanguage, translate } from '../i18n';

type Element = React.ReactElement<any>;
const elements = (node: ReactNode): Element[] => Array.isArray(node) ? node.flatMap(elements)
  : isValidElement(node) ? [node as Element, ...elements((node as Element).props.children)] : [];
const originals = { auth: auth.useAuth, language: language.useLanguage, assigned: projects.useMyAssignedMilestones,
  repository: outputs.useOutputRepository, state: React.useState, memo: React.useMemo };
const output = (status: string, selected = true) => ({ status, is_selected: selected, is_required: false });
const milestone = (id: string, statuses: string[], options: Partial<projects.AssignedMilestone> = {}): projects.AssignedMilestone => ({
  id, project_id: 'fixture-project', name: `Synthetic ${id}`, step_order: 1, status: 'IN_PROGRESS', pic_id: 'fixture-sa',
  project: { id: 'fixture-project', name: 'Synthetic project', customer: 'Synthetic customer', status: 'ACTIVE', is_postponed: false },
  outputs: statuses.map(status => output(status)), ...options,
});
let data: projects.AssignedMilestone[] = [], activeTab = 'ACTION', mode = 'ready';
let role = 'SA', repositoryMode = 'ready';
let repositoryData: outputs.OutputRepositoryItem[] = [];
(auth as any).useAuth = () => ({ user: { id: 'fixture-sa', role, isActive: true } });
(language as any).useLanguage = () => ({ locale: 'en', t: translate });
(projects as any).useMyAssignedMilestones = (enabled: boolean) => {
  assert.equal(enabled, role === 'SA' || role === 'HEAD_SA', 'Only SA and Head SA load assigned work');
  return { data: mode === 'ready' ? data : undefined, isLoading: mode === 'loading', isError: mode === 'error' };
};
(outputs as any).useOutputRepository = (enabled: boolean) => {
  assert.equal(enabled, role === 'HEAD_SA', 'Only Head SA loads the review repository');
  return { data: repositoryMode === 'ready' ? repositoryData : undefined,
    isLoading: repositoryMode === 'loading', isError: repositoryMode === 'error' };
};
function render() {
  let tree: ReactNode;
  try {
    (React as any).useState = () => [activeTab, (value: string) => { activeTab = value; }];
    (React as any).useMemo = (factory: () => unknown) => factory();
    tree = MilestonesPage();
  } finally { (React as any).useState = originals.state; (React as any).useMemo = originals.memo; }
  const nodes = elements(tree!);
  const markup = renderToStaticMarkup(tree! as Element);
  const milestoneIds = [...markup.matchAll(/href="[^"#]*#project-milestone-([^"#]+)"/g)].map(match => match[1]);
  return { nodes, markup, milestoneIds };
}
try {
  for (const locale of ['en', 'id'] as const) {
    setActiveLanguage(locale);
    role = 'SA'; mode = 'ready'; repositoryMode = 'ready'; repositoryData = [];
    assert.equal(translate('milestonePage.underReview'), locale === 'en' ? 'Waiting for Head SA review' : 'Menunggu review Head SA');
    for (const status of ['SUBMITTED', 'IN_REVIEW']) {
      data = [milestone('waiting', [status])]; activeTab = 'ACTION';
      let view = render();
      const tabs = () => view.nodes.filter(node => node.props.label && typeof node.props.count === 'number');
      assert.equal(tabs().find(node => node.props.label === translate('milestonePage.needsAction'))!.props.count, 0);
      const waiting = tabs().find(node => node.props.label === translate('milestonePage.underReview'))!;
      assert.equal(waiting.props.count, 1, 'Submitted output must contribute to the waiting counter');
      const snapshot = view.nodes.find(node => node.props['aria-label'] === translate('milestonePage.snapshot'))!;
      const values = elements(snapshot).filter(node => node.type === 'p' && typeof node.props.children === 'number').map(node => node.props.children);
      assert.deepEqual(values, [0, 1, 0, 1], 'KPI and tabs use the same classification');
      waiting.props.onClick(); view = render();
      assert.equal(activeTab, 'REVIEW');
      assert.deepEqual(view.milestoneIds, ['waiting']);
      assert(view.markup.includes(translate('milestonePage.underReview')));
      assert(view.markup.includes('/projects/fixture-project#project-milestone-waiting'));
      setActiveLanguage(locale === 'en' ? 'id' : 'en'); render();
      assert.equal(activeTab, 'REVIEW', 'Locale change cannot reset the selected tab');
      setActiveLanguage(locale);
    }
    data = [milestone('mixed', ['IN_REVIEW', 'DRAFT']), milestone('revision', ['REVISION_REQUIRED']),
      milestone('approved-not-complete', ['APPROVED']), milestone('completed', ['APPROVED'], { status: 'COMPLETED' }),
      milestone('paused', ['IN_REVIEW'], { project: { id: 'fixture-project', name: 'Synthetic project', customer: '', status: 'ACTIVE', is_postponed: true } })];
    activeTab = 'ACTION'; let view = render();
    assert.equal(countAssignedMilestonesNeedingAction(data), 2, 'Sidebar count matches Needs action');
    assert.deepEqual(view.milestoneIds, ['mixed', 'revision']);
    assert(view.markup.includes(translate('milestonePage.waitingOutputs', { count: 1 })), 'Partial submit shows the waiting output indicator');
    activeTab = 'REVIEW'; view = render();
    assert.equal(view.milestoneIds.length, 0, 'Mixed, approved-only and paused work must not enter waiting review');
    activeTab = 'COMPLETED'; view = render();
    assert.deepEqual(view.milestoneIds, ['completed']);
    activeTab = 'ALL'; view = render();
    assert.equal(view.milestoneIds.length, 5, 'All assigned preserves every accessible row');
    assert(view.markup.includes(translate('projectStatus.POSTPONED')));
    for (const state of ['loading', 'error']) {
      mode = state; view = render();
      assert.equal(view.milestoneIds.length, 0);
      if (state === 'error') assert(view.markup.includes(translate('milestonePage.loadFailed')));
    }
    mode = 'ready'; data = []; view = render(); assert(view.markup.includes(translate('milestonePage.noMatches')));

    role = 'HEAD_SA'; activeTab = 'PENDING_REVIEW';
    repositoryData = ['IN_REVIEW', 'APPROVED', 'DRAFT', 'REVISION_REQUIRED'].map((status, index) => ({
      projectId: 'fixture-project', milestoneId: `review-${index}`, projectName: 'Synthetic review project',
      documentKey: `synthetic-${index}`, name: `Synthetic ${status}`, status,
    } as outputs.OutputRepositoryItem));
    view = render();
    assert(view.markup.includes('/projects/fixture-project#milestone-outputs-review-0'));
    for (const index of [1, 2, 3]) assert(!view.markup.includes(`#milestone-outputs-review-${index}`),
      'Head SA review queue must contain only IN_REVIEW outputs');
    const reviewTab = view.nodes.find(node => node.props.label === translate('milestonePage.pendingReview'))!;
    assert.equal(reviewTab.props.count, 1);
    mode = 'error'; view = render();
    assert(view.markup.includes('#milestone-outputs-review-0'), 'Assignment failure must not hide the separate review queue');
    mode = 'ready';
    for (const state of ['loading', 'error']) {
      repositoryMode = state; view = render();
      assert(!view.markup.includes('#milestone-outputs-'));
      if (state === 'loading') assert(view.markup.includes('role="status"'));
      else assert(view.markup.includes(translate('milestonePage.reviewLoadFailed')));
    }
    repositoryMode = 'ready'; repositoryData = []; view = render();
    assert(view.markup.includes(translate('milestonePage.noReviewOutputs')));
    for (const otherRole of ['SALES', 'SUPER_ADMIN']) {
      role = otherRole; view = render();
      assert(view.markup.includes(translate('copy.milestoneLocation')));
      assert(view.markup.includes('href="/projects"'));
      assert(!view.nodes.some(node => node.props.label && typeof node.props.count === 'number'));
    }
  }
  console.log('Assigned work page: KPI/tabs/links, mixed and postponed work, EN/ID, all four roles, independent Head SA reviews and loading/error/empty passed.');
} finally {
  (auth as any).useAuth = originals.auth; (language as any).useLanguage = originals.language;
  (projects as any).useMyAssignedMilestones = originals.assigned; (outputs as any).useOutputRepository = originals.repository;
  setActiveLanguage('en');
}
