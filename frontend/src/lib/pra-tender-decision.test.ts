import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useClosePraTender, useContinueTenderPhase } from '@/hooks/use-projects';
import { canContinueTenderPhase, isPraTenderDecisionPending, isProjectClosedAtPraTender, runConfirmedDecision } from './phase-review';
import { getSalesDashboardItems } from './dashboard-ux';
import { resolveNextAction } from './workflow-ux-helpers';
import { formatActivityDescription } from './activity-timeline';
import { setActiveLanguage, translate } from '@/i18n';
import type { Project } from '@/types/project';

async function main() {
  const project = { id: 'p', name: 'Pra', sales_id: 'sales', status: 'ACTIVE', active_phase_id: 'pra',
    phases: [{ id: 'pra', project_id: 'p', scenario_id: 'scenario', phase_key: 'PRA_TENDER', status: 'COMPLETED', selected_document_keys: ['proposal_deck_solusi'] }],
  } as Project;
  assert(isPraTenderDecisionPending(project));
  assert(canContinueTenderPhase(project, 'SALES', 'sales'));
  for (const role of ['SA', 'HEAD_SA', 'SUPER_ADMIN']) assert(!canContinueTenderPhase(project, role, 'sales'));
  assert(!canContinueTenderPhase(project, 'SALES', 'other'));
  assert(!canContinueTenderPhase(project, undefined, undefined));
  for (const status of ['DRAFT', 'WON', 'LOST', 'COMPLETED', 'POSTPONED', 'WAITING_RESULT'] as const) assert(!isPraTenderDecisionPending({ ...project, status }));
  assert(!isPraTenderDecisionPending({ ...project, is_postponed: true }));
  assert(!isPraTenderDecisionPending({ ...project, phases: [{ ...project.phases![0], status: 'ACTIVE' }] }));
  assert(!isPraTenderDecisionPending({ ...project, phases: [{ ...project.phases![0], phase_key: 'ON_SUBMISSION_TENDER' }] }));
  const closed = { ...project, status: 'COMPLETED', phases: [{ ...project.phases![0], sales_decision: 'CLOSE_PRA_TENDER', sales_decided_by: 'sales', sales_decided_at: '2026-10-06T00:00:00Z' }] } as Project;
  assert(isProjectClosedAtPraTender(closed));
  assert(!isPraTenderDecisionPending(closed));
  assert.equal(getSalesDashboardItems([closed], 'sales').length, 0);
  assert.equal(resolveNextAction(closed, [], null, { role: 'SALES', id: 'sales' }).actionType, 'NONE');
  assert.equal(getSalesDashboardItems([project], 'sales')[0].href, '/projects/p#project-phase-panel');
  let writes = 0;
  await runConfirmedDecision({ confirmed: false, current: true }, async () => { writes++; });
  assert.equal(writes, 0, 'Cancel/undecided must not save a decision');
  const selectedKeys = ['arsitektur_sistem'];
  for (const locale of ['en', 'id'] as const) {
    setActiveLanguage(locale);
    for (const key of ['question', 'yes', 'no', 'undecided', 'confirmClose', 'closed', 'closeFailed'] as const) assert(!translate(`projectPhase.${key}`).startsWith('projectPhase.'));
    assert.equal(formatActivityDescription('PRA_TENDER_DECIDED', 'CLOSE_PRA_TENDER'), translate('projectPhase.closed'));
    assert.deepEqual(selectedKeys, ['arsitektur_sistem'], 'Changing locale cannot replace scope state');
  }
  setActiveLanguage('en');

  // Execute the actual mutation hooks, without a browser or live backend.
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  const invalidations: readonly unknown[][] = [];
  const recorded: unknown[][] = invalidations as unknown[][];
  client.invalidateQueries = async filters => { recorded.push([...(filters?.queryKey || [])]); };
  let close!: ReturnType<typeof useClosePraTender>;
  let yes!: ReturnType<typeof useContinueTenderPhase>;
  function Harness() { close = useClosePraTender('p'); yes = useContinueTenderPhase('p'); return null; }
  renderToString(createElement(QueryClientProvider, { client }, createElement(Harness)));
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  let fail = false;
  globalThis.fetch = async (url, options) => {
    requests.push(String(url)); assert.equal(options?.method, 'POST');
    if (String(url).endsWith('/pra-tender/close')) assert.equal(options?.body, '{}');
    else assert.deepEqual(JSON.parse(String(options?.body)), { selected_document_keys: selectedKeys });
    return new Response(JSON.stringify(fail ? { success: false, message: 'Conflict' } : { success: true, data: { phase_id: 'pra', closed: true, created: true } }), { status: fail ? 409 : 200, headers: { 'content-type': 'application/json' } });
  };
  const assertRuntimeRefresh = () => {
    assert(recorded.some(key => key[0] === 'projects'));
    assert(recorded.some(key => key[0] === 'dashboard'));
    assert(recorded.some(key => key[0] === 'project-milestones'));
  };
  try {
    assert.equal(requests.length, 0, 'Rendering/undecided does not call either endpoint');
    await close.mutateAsync(); assertRuntimeRefresh();
    recorded.length = 0;
    await yes.mutateAsync(selectedKeys); assertRuntimeRefresh();
    recorded.length = 0; fail = true;
    await assert.rejects(close.mutateAsync()); assertRuntimeRefresh();
    recorded.length = 0;
    await assert.rejects(yes.mutateAsync(selectedKeys)); assertRuntimeRefresh();
    assert.deepEqual(selectedKeys, ['arsitektur_sistem'], 'Conflict preserves selected scope');
  } finally { globalThis.fetch = originalFetch; client.clear(); }
  console.log('Pra-Tender decision eligibility, terminal task removal, EN/ID, cancellation and actual mutation refresh/error hooks passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
