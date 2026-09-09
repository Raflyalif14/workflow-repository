import { readFileSync } from 'fs';
import { join } from 'path';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const migration = readFileSync(join(__dirname, '../../supabase/phase11o-scenario-name-cleanup.sql'), 'utf8');

const legacyAssessmentDelete = migration.indexOf('delete from public.scenarios');
const legacyExistingTorDelete = migration.indexOf('delete from public.scenarios', legacyAssessmentDelete + 1);
const v2AssessmentRename = migration.indexOf("set name = 'Assessment'", legacyExistingTorDelete);
const v2ExistingTorRename = migration.indexOf("set name = 'Existing TOR'", v2AssessmentRename);

assert(migration.includes('begin;') && migration.includes('commit;'), 'Test 1: scenario name cleanup must run in a transaction');
assert(
  migration.includes('lock table public.scenarios, public.projects, public.workflow_stages, public.project_milestones') &&
    migration.includes('in share row exclusive mode;'),
  'Test 2: scenario cleanup must lock scenarios and their current FK reference tables'
);
assert(
  legacyAssessmentDelete >= 0 &&
    legacyExistingTorDelete > legacyAssessmentDelete &&
    v2AssessmentRename > legacyExistingTorDelete &&
    v2ExistingTorRename > v2AssessmentRename,
  'Test 3: legacy rows must be deleted before their canonical names are assigned to Operational V2 rows'
);
assert(
  migration.includes("workflow_model = 'LEGACY'") &&
    migration.includes('workflow_version = 1') &&
    migration.includes("workflow_model = 'OPERATIONAL_V2'") &&
    migration.includes('workflow_version = 2') &&
    migration.includes('is_active is false') &&
    migration.includes('is_active is true'),
  'Test 4: scenario cleanup must guard model, version, and activation state'
);
assert(
  migration.includes('legacy_assessment_project_count <> 0 or legacy_existing_tor_project_count <> 0') &&
    migration.includes('join public.workflow_stages stage on stage.id = milestone.workflow_stage_id') &&
    migration.includes('legacy_assessment_stage_reference_count <> 0 or legacy_existing_tor_stage_reference_count <> 0') &&
    migration.includes('where id = legacy_assessment_id') &&
    migration.includes('where id = legacy_existing_tor_id') &&
    migration.includes('where id = v2_assessment_id') &&
    migration.includes('where scenario_id = v2_existing_tor_id') &&
    !migration.includes('update public.projects') &&
    !migration.includes('set scenario_id'),
  'Test 5: scenario cleanup must enforce zero legacy references, preserve V2 UUID project references, and never alter project scenario IDs'
);
assert(
  !migration.includes('drop constraint') &&
    !migration.includes('add constraint') &&
    !migration.includes('alter table public.scenarios'),
  'Test 6: scenario name cleanup must preserve the existing global UNIQUE (name) constraint'
);
assert(
  migration.includes('relevant_scenario_count <> 2') &&
    migration.includes('where id in (legacy_assessment_id, legacy_existing_tor_id)') &&
    migration.includes("name in ('Assessment Operational V2', 'Existing TOR Operational V2')"),
  'Test 7: scenario cleanup must assert that only the two canonical Operational V2 rows remain'
);

console.log('Test 1-7 - Scenario cleanup is guarded, deletes only unreferenced legacy rows, preserves V2 references, and retains global unique names: passed');
