import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getMandatoryDocumentKeys, getScenarioDocuments, ScenarioKey } from '../constants/scenarios';
import { buildInitialMilestoneRows } from './milestone.service';
import { areExpectedProjectOutputsApproved } from './workflow-progression.service';

for (const scenario of ['PRA_TENDER', 'ON_SUBMISSION_TENDER'] as ScenarioKey[]) {
  const definitions = getScenarioDocuments(scenario);
  const required = getMandatoryDocumentKeys(scenario);
  const optional = definitions.find((item) => !item.isRequired)!;
  const stages = [...new Set(definitions.map((item) => item.stageKey))].map((stageKey, index) => ({
    id: stageKey, name: stageKey, description: null, step_order: index + 1,
    stage_key: stageKey, default_role: 'SA',
  }));
  stages.push({ id: 'TENDER_PROCESS', name: 'Tender Process', description: null,
    step_order: stages.length + 1, stage_key: 'TENDER_PROCESS', default_role: 'SALES' });
  const requiredStages = new Set(definitions.filter((item) => item.isRequired).map((item) => item.stageKey));
  const requiredRows = buildInitialMilestoneRows(scenario, stages, undefined,
    { workflow_model: 'OPERATIONAL_V2', workflow_version: 2 }, requiredStages);
  assert.deepEqual(requiredRows.map((row) => row.workflow_stage_id),
    stages.filter((stage) => requiredStages.has(stage.stage_key) || stage.default_role === 'SALES').map((stage) => stage.id));
  assert.deepEqual(requiredRows.map((row) => row.step_order), requiredRows.map((_, index) => index + 1));
  assert.equal(requiredRows.at(-1)?.workflow_stage_id, 'TENDER_PROCESS');
  const withOptional = new Set([...requiredStages, optional.stageKey]);
  const optionalRows = buildInitialMilestoneRows(scenario, stages, undefined,
    { workflow_model: 'OPERATIONAL_V2', workflow_version: 2 }, withOptional);
  assert(optionalRows.length >= requiredRows.length);

  const approved = required.map((document_key) => ({ document_key, is_required: true, is_selected: true, status: 'APPROVED' }));
  const scenarioName = scenario === 'PRA_TENDER' ? 'Pra-Tender' : 'On Submission Tender';
  assert(areExpectedProjectOutputsApproved(required, scenarioName, approved));
  assert(!areExpectedProjectOutputsApproved(required, scenarioName, approved.slice(1)));
  assert(!areExpectedProjectOutputsApproved([...required, optional.key], scenarioName, approved));
  assert(!areExpectedProjectOutputsApproved(required, scenarioName,
    approved.map((row, index) => index === 0 ? { ...row, status: 'IN_REVIEW' } : row)));
}

const migration = readFileSync(join(__dirname, '../../supabase/phase19-selected-sa-output-scope.sql'), 'utf8');
const guard = migration.indexOf("'An output with work has an invalid milestone mapping'");
const deleteRows = migration.indexOf('delete from public.project_output_documents od');
const deleteStages = migration.indexOf('delete from public.project_milestones pm');
assert(guard > 0 && guard < deleteRows && deleteRows < deleteStages);
assert(migration.includes("raise exception 'Selected output is missing or not approved'"));
assert(migration.includes("pm.project_id is distinct from p_project_id"));
console.log('Selected scope, missing-output gate, and pre-delete SQL guards: OK');
