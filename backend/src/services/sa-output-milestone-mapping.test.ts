import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SCENARIO_DOCUMENTS, getMandatoryDocumentKeys } from '../constants/scenarios';

const expand = readFileSync(join(__dirname, '../../supabase/phase18a-sa-output-milestones-expand.sql'), 'utf8');
const retire = readFileSync(join(__dirname, '../../supabase/phase18b-retire-milestone-submissions.sql'), 'utf8');
const allowedStages = {
  PRA_TENDER: new Set(['CUSTOMER_ASSESSMENT', 'ASSESSMENT_REPORT', 'REQUIREMENT_GATHERING',
    'PAIN_POINT_ANALYSIS', 'PROPOSAL_SOLUTION', 'DELIVERABLES', 'TECHNICAL_PROPOSAL_BOQ']),
  ON_SUBMISSION_TENDER: new Set(['REQUIREMENT_GATHERING', 'PAIN_POINT_ANALYSIS',
    'PROPOSAL_SOLUTION', 'DELIVERABLES', 'TECHNICAL_PROPOSAL_BOQ']),
};

for (const scenarioKey of ['PRA_TENDER', 'ON_SUBMISSION_TENDER'] as const) {
  const definitions = SCENARIO_DOCUMENTS[scenarioKey];
  const keys = new Set<string>();
  for (const definition of definitions) {
    assert(!keys.has(definition.key), `${scenarioKey}: duplicate output key ${definition.key}`);
    keys.add(definition.key);
    assert(allowedStages[scenarioKey].has(definition.stageKey), `${scenarioKey}: invalid SA stage ${definition.stageKey}`);
    const pair = `('${definition.key}','${definition.stageKey}')`;
    assert(expand.includes(pair) && retire.includes(pair), `${scenarioKey}: migration mapping drift for ${definition.key}`);
  }
  const selected = new Set(getMandatoryDocumentKeys(scenarioKey));
  assert(definitions.filter((definition) => selected.has(definition.key)).every((definition) => definition.isRequired),
    `${scenarioKey}: unselected optional output entered the completion gate`);
  assert([...allowedStages[scenarioKey]].some((stageKey) =>
    !definitions.some((definition) => selected.has(definition.key) && definition.stageKey === stageKey)),
    `${scenarioKey}: expected a valid SA stage without selected output`);
}

assert(!SCENARIO_DOCUMENTS.PRA_TENDER.some((definition) => definition.stageKey === 'TENDER_PROCESS'));
assert(!SCENARIO_DOCUMENTS.ON_SUBMISSION_TENDER.some((definition) => definition.stageKey === 'TENDER_PROCESS'));
