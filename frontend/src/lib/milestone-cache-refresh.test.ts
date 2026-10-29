import assert from 'node:assert/strict';
const query: typeof import('@tanstack/react-query') = require('@tanstack/react-query');
import { useCompleteMilestone, useStartMilestone } from '../hooks/use-milestone-workflow';
import { dashboardKeys, projectKeys } from './query-keys';
import { outputDocumentKeys } from '../hooks/use-output-documents';

// Exercise real cache matching, including scoped/filtered queries used by mounted pages.
const client = new query.QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
const originalClient = query.useQueryClient;
const originalMutation = query.useMutation;
let options: any;
(query as any).useQueryClient = () => client;
(query as any).useMutation = (value: any) => { options = value; return {}; };
const dashboard = [...dashboardKeys.overview(), 'user-a'];
const activity = dashboardKeys.activityPage('user-a', 'session-a', 'SALES', 1);
const project = projectKeys.detail('project-a');
const documents = ['documents', { projectId: 'project-a', search: 'evidence' }, 'session-a'];
const repository = [...outputDocumentKeys.repository(), { search: 'evidence' }, 'session-a'];
const search = ['global-search', 'evidence', 'session-a'];
const keys = [dashboard, activity, project, documents, repository, search];
const seed = () => keys.forEach(key => client.setQueryData(key, { value: 'cached' }));
const invalidated = (key: readonly unknown[]) => assert.equal(client.getQueryState(key)?.isInvalidated, true, JSON.stringify(key));
try {
  seed();
  useStartMilestone('project-a', 'milestone-a');
  options.onSuccess();
  [dashboard, activity, project].forEach(invalidated);
  seed();
  useCompleteMilestone('project-a', 'milestone-a');
  options.onSuccess(undefined, undefined);
  [dashboard, activity, project].forEach(invalidated);
  for (const callback of ['onSuccess', 'onError']) {
    seed();
    options[callback](undefined, { outcome: 'WON', evidence_document_ids: ['document-a'] });
    keys.forEach(invalidated);
  }
  console.log('Start/completion refresh dashboard and activity; evidence remains discoverable after outcome success or retryable failure.');
} finally {
  client.clear();
  (query as any).useQueryClient = originalClient;
  (query as any).useMutation = originalMutation;
}
