import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SCENARIO_DOCUMENTS } from '../constants/scenarios';

const preflight = readFileSync(join(__dirname, '../../supabase/phase18-preflight.sql'), 'utf8');
const retire = readFileSync(join(__dirname, '../../supabase/phase18b-retire-milestone-submissions.sql'), 'utf8');
const approvalGuard = retire.indexOf('Phase 18: milestone approval outside a valid SA stage');
const outputGuard = retire.indexOf('Phase 18: output document mapped to the wrong project or SA stage');
const firstMutation = retire.indexOf('update public.project_output_documents od set milestone_id');
const firstLegacyDelete = retire.indexOf('delete from public.notification_deliveries');
const firstDrop = retire.indexOf('drop table if exists public.milestone_submission_attachments');

assert(approvalGuard > retire.indexOf('begin;') && approvalGuard < firstMutation,
  'Approval guard must run at the start of Phase 18b.');
assert(firstMutation < outputGuard && outputGuard < firstLegacyDelete && firstLegacyDelete < firstDrop,
  'Both guards must run before legacy row deletion and table removal.');
assert(!/drop table[^;]*cascade/i.test(retire), 'Legacy table removal must not cascade.');

for (const sql of [preflight, retire]) {
  for (const condition of [
    'pm.id is null', 'p.id is null', 'ws.id is null', 's.id is null',
    'ws.scenario_id is distinct from p.scenario_id',
    "ws.default_role is distinct from 'SA'",
  ]) {
    assert(sql.includes(condition), `Approval classification is missing ${condition}.`);
  }
}
assert(preflight.includes('group by coalesce(ac.stage_role, c.stage_role), coalesce(ac.relationship_state, c.relationship_state)'),
  'Preflight must count approvals by role and relationship state.');

const approvalValid = (role: string | null, hasMilestone: boolean, hasProject: boolean,
  hasStage: boolean, hasScenario: boolean, scenarioMatches: boolean) =>
  hasMilestone && hasProject && hasStage && hasScenario && scenarioMatches && role === 'SA';
assert(approvalValid('SA', true, true, true, true, true));
assert(!approvalValid('SALES', true, true, true, true, true));
assert(!approvalValid('SA', false, true, true, true, true));
assert(!approvalValid('SA', true, true, false, true, true));
assert(!approvalValid('SA', true, true, true, false, true));
assert(!approvalValid('SA', true, true, true, true, false));

for (const condition of [
  'pm.project_id is distinct from od.project_id',
  'ws.scenario_id is distinct from p.scenario_id',
  "ws.default_role is distinct from 'SA'",
  'ds.stage_key is distinct from ws.stage_key',
  "s.name = 'On Submission Tender' and ds.pra_only",
  's.id is null', 'pm.id is null', 'ds.document_key is null',
]) {
  assert(retire.includes(condition), `Output mapping guard is missing ${condition}.`);
}

const mapping = new Map<string, { stageKey: string; praOnly: boolean }>();
const mappingBlock = retire.slice(retire.indexOf('with document_stage(document_key, stage_key, pra_only)'),
  retire.indexOf('select 1 from public.project_output_documents od'));
for (const match of mappingBlock.matchAll(/\('([^']+)','([^']+)',(true|false)\)/g)) {
  mapping.set(match[1], { stageKey: match[2], praOnly: match[3] === 'true' });
}
const praKeys = new Set(SCENARIO_DOCUMENTS.PRA_TENDER.map((definition) => definition.key));
const onKeys = new Set(SCENARIO_DOCUMENTS.ON_SUBMISSION_TENDER.map((definition) => definition.key));
assert.equal(mapping.size, praKeys.size, 'Guard mapping must cover each output key exactly once.');
for (const definition of SCENARIO_DOCUMENTS.PRA_TENDER) {
  assert.deepEqual(mapping.get(definition.key), {
    stageKey: definition.stageKey, praOnly: !onKeys.has(definition.key),
  }, `Guard mapping differs for ${definition.key}.`);
}

const outputValid = (scenario: string, documentKey: string, projectMatches: boolean,
  stageKey: string | null, stageRole: string, stageScenarioMatches: boolean) => {
  const expected = mapping.get(documentKey);
  return Boolean(expected && projectMatches && stageScenarioMatches && stageRole === 'SA'
    && stageKey === expected.stageKey
    && (scenario === 'Pra-Tender' || (scenario === 'On Submission Tender' && !expected.praOnly)));
};
assert(outputValid('Pra-Tender', 'assessment', true, 'ASSESSMENT_REPORT', 'SA', true));
assert(outputValid('On Submission Tender', 'proposal_teknis', true, 'TECHNICAL_PROPOSAL_BOQ', 'SA', true));
assert(!outputValid('On Submission Tender', 'assessment', true, 'ASSESSMENT_REPORT', 'SA', true));
assert(!outputValid('Pra-Tender', 'assessment', false, 'ASSESSMENT_REPORT', 'SA', true));
assert(!outputValid('Pra-Tender', 'assessment', true, 'DELIVERABLES', 'SA', true));
assert(!outputValid('Pra-Tender', 'assessment', true, null, 'SA', true));
assert(!outputValid('Pra-Tender', 'assessment', true, 'ASSESSMENT_REPORT', 'SALES', true));
assert(!outputValid('Pra-Tender', 'assessment', true, 'ASSESSMENT_REPORT', 'SA', false));
assert(!outputValid('Pra-Tender', 'unknown', true, 'ASSESSMENT_REPORT', 'SA', true));
