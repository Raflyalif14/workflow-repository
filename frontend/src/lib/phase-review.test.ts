import { getSalesDashboardItems } from "./dashboard-ux";
import assert from 'node:assert/strict';
import { activePhaseMilestones, canContinueTenderPhase, captureOutputReview, hasReviewReason, reviewTargetsAreCurrent, runConfirmedDecision } from './phase-review';
import { getScenarioDocuments } from '@/constants/scenarios';
import { setActiveLanguage, translate, DEFAULT_LANGUAGE } from '@/i18n';
import { resolveNextAction, resolveNextActionTargetId } from './workflow-ux-helpers';
import type { Project, ProjectPhase, ProjectMilestonePhase4, ProjectOutputDocumentItem } from '@/types/project';

async function main() {
  assert.equal(DEFAULT_LANGUAGE, 'en');
  assert.equal(getScenarioDocuments('PRA_TENDER').length, 10);
  assert.equal(getScenarioDocuments('ON_SUBMISSION_TENDER').length, 7);
  const phase: ProjectPhase = { id: 'pra', project_id: 'p', scenario_id: 's', phase_key: 'PRA_TENDER', status: 'COMPLETED', selected_document_keys: ['proposal_deck_solusi'] };
  const project = { id: 'p', active_phase_id: 'pra', sales_id: 'owner', status: 'ACTIVE', phases: [phase] } as unknown as Project;
  assert(canContinueTenderPhase(project, 'SALES', 'owner'));
  for (const role of ['SA', 'HEAD_SA', 'SUPER_ADMIN', undefined]) assert(!canContinueTenderPhase(project, role, 'owner'));
  assert(!canContinueTenderPhase(project, 'SALES', 'other'));
  for (const status of ['DRAFT', 'POSTPONED', 'WAITING_RESULT', 'WON', 'LOST'] as const) assert(!canContinueTenderPhase({ ...project, status }, 'SALES', 'owner'));
  assert(!canContinueTenderPhase({ ...project, is_postponed: true }, 'SALES', 'owner'));
  assert(!canContinueTenderPhase({ ...project, phases: [...project.phases!, { ...phase, id: 'tender', phase_key: 'ON_SUBMISSION_TENDER', status: 'DRAFT' }] }, 'SALES', 'owner'));
  const rows = [{ id: 'previous', phase_id: 'pra', status: 'COMPLETED' }, { id: 'current', phase_id: 'tender', status: 'IN_PROGRESS' }] as ProjectMilestonePhase4[];
  assert.deepEqual(activePhaseMilestones({ ...project, active_phase_id: 'tender' }, rows).map(row => row.id), ['current']);
  assert.equal(rows.length, 2, 'Historical milestones remain available');
  const dashboard = getSalesDashboardItems([project], "owner");
  assert.equal(dashboard.length, 1); assert.equal(dashboard[0].href, "/projects/p#project-phase-panel");
  assert.equal(getSalesDashboardItems([project], "other").length, 0);
  const next = resolveNextAction(project, [], null, { id: 'owner', role: 'SALES' });
  assert.equal(next.actionType, 'CONTINUE_PHASE'); assert(next.canPerformAction);
  assert.equal(resolveNextActionTargetId(next), 'project-phase-panel');
  assert(!resolveNextAction(project, [], null, { id: 'head', role: 'HEAD_SA' }).canPerformAction);

  const document = { key: 'proposal_deck_solusi', name: 'Proposal', group: 'PRA_TENDER', status: 'IN_REVIEW',
    currentVersionId: 'immutable-v2', currentVersionNumber: 2, files: [{ id: 'a' }, { id: 'b' }] } as ProjectOutputDocumentItem;
  const captured = captureOutputReview([document]);
  assert.equal(captured[0].version, 2); assert.equal(captured[0].fileCount, 2);
  assert(reviewTargetsAreCurrent(captured, [document]));
  assert(!reviewTargetsAreCurrent(captured, [{ ...document, currentVersionId: 'v3' }]));
  assert(!reviewTargetsAreCurrent(captured, [{ ...document, status: 'APPROVED' }]));
  assert.equal(captured[0].expected_version_id, 'immutable-v2', 'Query refresh cannot replace the reviewed CAS identity');
  assert(!hasReviewReason(' \n\t')); assert(hasReviewReason('Please revise'));
  let saves = 0;
  const save = async () => { saves++; return 'saved'; };
  assert.equal(await runConfirmedDecision({ confirmed: false, current: true }, save), undefined);
  assert.equal(saves, 0, 'Cancel / initial review step cannot mutate');
  await assert.rejects(runConfirmedDecision({ confirmed: true, current: true, reasonRequired: true, reason: '  ' }, save));
  await assert.rejects(runConfirmedDecision({ confirmed: true, current: false }, save));
  assert.equal(saves, 0);
  assert.equal(await runConfirmedDecision({ confirmed: true, current: true, reasonRequired: true, reason: ' Revise ' }, save), 'saved');
  assert.equal(saves, 1);
  const dialog = { reason: 'Keep this input', confirmed: true, targets: captured };
  await assert.rejects(runConfirmedDecision({ ...dialog, current: true }, async () => { throw new Error('HTTP error'); }));
  assert.equal(dialog.reason, 'Keep this input'); assert.equal(dialog.confirmed, true);
  for (const locale of ['en', 'id'] as const) {
    setActiveLanguage(locale);
    assert(!translate('reviewConfirm.snapshot', { version: 2, count: 2 }).includes('{'));
    assert(!translate('projectPhase.continue').includes('projectPhase.'));
    assert.equal(dialog.reason, 'Keep this input'); assert.deepEqual(dialog.targets, captured);
  }
  setActiveLanguage('en');
  console.log('Phase scope/roles, next action, captured snapshot CAS, confirmation/cancel/failure and EN/ID state preservation passed');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
