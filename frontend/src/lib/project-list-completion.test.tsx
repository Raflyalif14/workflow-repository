import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as auth from '../components/auth/auth-provider';
import * as language from '../components/i18n/language-provider';
import * as projects from '../hooks/use-projects';
import * as api from './api-client';
import ProjectsPage from '../app/projects/page';
import { isProjectDeliveryCompleted } from './project-list-status';
import { setActiveLanguage, translate } from '../i18n';
import type { Project, ProjectFilters, ProjectListStatusFilter, ProjectStatus } from '../types/project';
const query = require('@tanstack/react-query') as typeof import('@tanstack/react-query');
const nodes = (node: any): any[] => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
const finished: ProjectStatus[] = ['COMPLETED', 'WAITING_RESULT', 'WON', 'LOST'];
const fixture = (status: ProjectStatus): Project => ({ id: status, name: `Synthetic ${status}`, customer: 'Example', status,
  progress: 100, totalMilestones: 3, completedMilestones: 3 } as Project);

export async function testProjectCompletion() {
  for (const status of finished) assert(isProjectDeliveryCompleted(status), `${status}: completed delivery`);
  for (const status of ['DRAFT', 'ACTIVE', 'POSTPONED', 'ON_HOLD', 'CANCELLED'] as const)
    assert(!isProjectDeliveryCompleted(status), `${status}: not a completed delivery`);
  const original = { auth: auth.useAuth, language: language.useLanguage, projects: projects.useProjects, scenarios: projects.useScenarios,
    state: React.useState, memo: React.useMemo, query: query.useQuery, api: api.apiClient };
  let rows = [fixture('ACTIVE'), fixture('WON')], filters: ProjectFilters = {}, states: any[] = [], cursor = 0;
  let role = 'HEAD_SA';
  (auth as any).useAuth = () => ({ user: { role } });
  (language as any).useLanguage = () => ({ t: translate });
  (projects as any).useScenarios = () => ({ data: [] });
  (projects as any).useProjects = (value: ProjectFilters) => {
    filters = value;
    const visible = value.status === 'DELIVERY_COMPLETED' ? rows.filter(row => finished.includes(row.status)) : rows;
    return { data: { projects: visible, pagination: { total: visible.length, page: 1, totalPages: 1 } }, isLoading: false, isError: false };
  };
  const render = () => {
    cursor = 0;
    (React as any).useState = (initial: any) => { const index = cursor++; if (!(index in states)) states[index] = initial;
      return [states[index], (value: any) => { states[index] = value; }]; };
    (React as any).useMemo = (compute: () => unknown) => compute();
    try { return ProjectsPage(); }
    finally { (React as any).useState = original.state; (React as any).useMemo = original.memo; }
  };
  const snapshot = (tree: any) => nodes(nodes(tree).find(node => node.props?.['aria-label'] === translate('projectsList.snapshot')))
    .filter(node => node.type === 'p' && typeof node.props.children === 'number').map(node => node.props.children);
  try {
    for (const locale of ['en', 'id'] as const) {
      setActiveLanguage(locale);
      for (role of ['HEAD_SA', 'SALES', 'SA', 'SUPER_ADMIN']) {
        states = []; rows = [fixture('ACTIVE'), fixture('WON')];
        let tree = render();
        assert.deepEqual(snapshot(tree), [2, 1, 0, 1], 'Screenshot regression: one ACTIVE and one WON must show one completed delivery');
        assert(renderToStaticMarkup(tree).includes(translate('projectStatus.WON')), 'Business outcome badge stays WON');
        const tab = nodes(tree).find(node => node.props?.children === translate('projectsList.deliveryComplete') && node.props?.onClick);
        states[0] = 2; tab.props.onClick(); tree = render();
        assert.equal(filters.status, 'DELIVERY_COMPLETED'); assert.equal(filters.page, 1);
        assert.deepEqual(snapshot(tree), [1, 0, 0, 1]);
        rows = finished.map(fixture); states = [];
        assert.equal(snapshot(render())[3], 4, 'All delivery-completed statuses share the same summary definition');
      }
    }
    (projects as any).useProjects = original.projects;
    let options: any, requested = '';
    (query as any).useQuery = (value: any) => { options = value; return {}; };
    (api as any).apiClient = async (url: string) => { requested = url; return {}; };
    for (const status of ['DELIVERY_COMPLETED', 'COMPLETED', 'WON', 'ALL'] as ProjectListStatusFilter[]) {
      projects.useProjects({ page: 2, limit: 10, search: 'tor monitor', scenarioId: 'scenario-fixture', status });
      await options.queryFn(); const params = new URL(requested, 'http://localhost').searchParams;
      assert.equal(params.get('page'), '2'); assert.equal(params.get('search'), 'tor monitor'); assert.equal(params.get('scenario_id'), 'scenario-fixture');
      assert.equal(params.get('status_group'), status === 'DELIVERY_COMPLETED' ? 'DELIVERY_COMPLETED' : null);
      assert.equal(params.get('status'), ['DELIVERY_COMPLETED', 'ALL'].includes(status) ? null : status);
    }
    console.log('Project list: ACTIVE + WON counter, all finished states, EN/ID and roles, tab/page reset and grouped/exact query contract passed.');
  } finally {
    (auth as any).useAuth = original.auth; (language as any).useLanguage = original.language;
    (projects as any).useProjects = original.projects; (projects as any).useScenarios = original.scenarios;
    (React as any).useState = original.state; (React as any).useMemo = original.memo;
    (query as any).useQuery = original.query; (api as any).apiClient = original.api; setActiveLanguage('en');
  }
}
