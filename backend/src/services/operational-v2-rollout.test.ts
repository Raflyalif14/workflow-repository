import { readFileSync } from 'fs';
import { join } from 'path';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const migration = readFileSync(join(__dirname, '../../supabase/phase11h-operational-v2-rollout.sql'), 'utf8');
const requiredStageMappings = [
  [6, 1, 'Customer Assessment'],
  [7, 2, 'Assessment Report'],
  [8, 3, 'Requirement Gathering'],
  [9, 4, 'Pain Point Analysis'],
  [10, 5, 'Proposal Solution'],
  [11, 6, 'Deliverables'],
  [12, 7, 'Technical Proposal & BOQ'],
  [13, 8, 'Tender Process'],
] as const;

const hasRequiredStageMappings = requiredStageMappings.every(([sourceStep, targetStep, name]) =>
  new RegExp(`\\(${sourceStep}\\s*,\\s*${targetStep}\\s*,\\s*'${name}'\\)`).test(migration)
);
const hasMetadataParityChecks = [
  'v2_stage.default_role is not distinct from source_stage.default_role',
  'v2_stage.default_duration_working_days is not distinct from source_stage.default_duration_working_days',
  'v2_stage.is_required is not distinct from source_stage.is_required',
  'v2_stage.description is not distinct from source_stage.description',
  'source_stage.is_active is true',
  'v2_stage.is_active is true',
].every((check) => migration.includes(check));

assert(migration.includes("name = 'Assessment'") && migration.includes("workflow_model = 'LEGACY'") && migration.includes('workflow_version = 1'), 'Test 1: rollout must validate legacy Assessment by name and LEGACY v1');
assert(migration.includes("name = 'Assessment Operational V2'") && migration.includes("workflow_model = 'OPERATIONAL_V2'") && migration.includes('workflow_version = 2'), 'Test 2: rollout must validate V2 by name and OPERATIONAL_V2 v2');
assert(
  hasRequiredStageMappings &&
    /total_v2_stage_count\s*<>\s*8\s+or\s+matching_v2_stage_count\s*<>\s*8/i.test(migration) &&
    hasMetadataParityChecks,
  'Test 3: rollout must require eight mapped active V2 stages with legacy metadata parity'
);
assert(migration.includes('where scenario_id = operational_v2_id') && migration.includes('v2_project_count <> 0'), 'Test 4: rollout must stop when any project already references V2');
assert(migration.includes('set is_active = true') && migration.includes('where id = operational_v2_id'), 'Test 5: rollout must activate only the V2 scenario row');
assert(migration.includes('set is_active = false') && migration.includes('where id = legacy_assessment_id'), 'Test 6: rollout must deactivate only the legacy Assessment scenario row');
assert(!migration.includes('update public.workflow_stages'), 'Test 7: rollout must not deactivate or modify legacy workflow stages');
assert(!migration.includes('update public.projects') && !migration.includes('update public.project_milestones'), 'Test 8: rollout must not reshape existing projects or milestones');

console.log('Test 1-8 - Operational V2 rollout migration validates templates, toggles only scenario rows, and preserves legacy project/stage data: passed');
