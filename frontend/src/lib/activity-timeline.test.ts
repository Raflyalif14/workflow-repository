import { setActiveLanguage, translate } from "@/i18n";
import { strict as assert } from "assert";
import { flattenActivityPages, formatActivityAction, formatActivityDescription, formatBusinessAudit, formatBusinessAuditValue } from "./activity-timeline";
import { projectKeys } from "./query-keys";

assert.equal(formatActivityAction("PROJECT_PLAN_APPROVED"), "Project Plan Approved", "Test 1: known actions receive readable labels");
console.log("Test 1 - Known activity action formatting: passed");

assert.equal(formatActivityAction("LEGACY_CUSTOM_EVENT"), "Other activity", "Test 2: unknown historical actions use a safe fallback");
console.log("Test 2 - Unknown action fallback formatting: passed");

const flattened = flattenActivityPages([
  { items: [{ id: "one" } as any], nextCursor: "cursor-one" },
  { items: [{ id: "two" } as any], nextCursor: null },
]);
assert.deepEqual(flattened.map((item) => item.id), ["one", "two"], "Test 3: paginated activity results preserve page order");
console.log("Test 3 - Activity page flattening: passed");

assert.notDeepEqual(projectKeys.detailWithoutActivity("project-1"), projectKeys.detail("project-1"), "Reduced detail must have a separate cache entry");
assert.deepEqual(projectKeys.detailWithoutActivity("project-1").slice(0, 2), projectKeys.detail("project-1"), "Detail invalidation must cover both cache entries");
assert.notDeepEqual(projectKeys.activities("project-1"), projectKeys.detailWithoutActivity("project-1"), "Paginated activities keep their own cache entry");

for (const locale of ['en', 'id'] as const) {
  setActiveLanguage(locale);
  assert.equal(formatActivityAction('PROJECT_PHASE_CREATED'), locale === 'en' ? 'Project Phase Created' : 'Fase Proyek Dibuat');
  assert.equal(formatActivityDescription('PROJECT_PHASE_COMPLETED', 'PRA_TENDER'), locale === 'en' ? 'Phase: Pra-Tender' : 'Fase: Pra-Tender');
  assert.equal(formatActivityDescription('USER_COMMENT', 'PRA_TENDER'), 'PRA_TENDER', 'User content must not be translated as a phase label');
}
setActiveLanguage('en');

const projectId = '90000000-0000-4000-8000-000000000001';
const milestoneId = '90000000-0000-4000-8000-000000000002';
const scenarioId = '90000000-0000-4000-8000-000000000003';
const context = { projectName: 'Synthetic project', milestones: [{ id: milestoneId, name: 'Proposal Solution' }],
  scenarios: [{ id: scenarioId, name: 'Pra-Tender' }] };
const scheduleChange = { objectType: 'PROJECT', objectId: projectId, changedFields: ['schedule'],
  before: { schedule: [{ id: milestoneId, start_date: '2026-10-07', duration_working_days: 5, due_date: '2026-10-13' }] },
  after: { schedule: [{ id: milestoneId, start_date: '2026-10-09', duration_working_days: 1, due_date: '2026-10-09' }] } };
const original = JSON.stringify(scheduleChange);
for (const locale of ['en', 'id'] as const) {
  setActiveLanguage(locale);
  const text = formatBusinessAudit(scheduleChange, context);
  assert(!text.includes(projectId) && !text.includes(milestoneId), 'Technical IDs never appear in audit display');
  assert(text.includes(context.projectName) && text.includes('Proposal Solution'));
  assert(text.includes(translate('businessAudit.before')) && text.includes(translate('businessAudit.after')));
  assert(text.includes(translate('businessAuditFields.start_date')) && text.includes(translate('businessAuditFields.duration_working_days')) && text.includes(translate('businessAuditFields.due_date')));
  assert(text.includes(formatBusinessAuditValue('due_date', '2026-10-13')) && text.includes(formatBusinessAuditValue('due_date', '2026-10-09')));
  const initiallyUnset = formatBusinessAudit({ ...scheduleChange, before: { schedule: [{ id: milestoneId, start_date: null, duration_working_days: null, due_date: null }] } }, context);
  assert(initiallyUnset.includes(translate('businessAudit.notSet')) && !initiallyUnset.includes('null'));
  const unknownNames = formatBusinessAudit(scheduleChange);
  assert(!unknownNames.includes(projectId) && !unknownNames.includes(milestoneId), 'Missing names use a readable fallback, never an ID');
  const creation = formatBusinessAudit({ objectType: 'PROJECT', objectId: projectId, changedFields: ['name', 'scenario_id', 'estimated_revenue', 'phase_id'],
    before: {}, after: { name: 'Synthetic project', scenario_id: scenarioId, estimated_revenue: '15000000', phase_id: milestoneId } }, context);
  assert(creation.includes('Pra-Tender') && creation.includes('15'));
  for (const value of [projectId, milestoneId, scenarioId]) assert(!creation.includes(value));
  assert.equal(formatBusinessAuditValue('scenario_id', scenarioId), translate('common.notAvailable'), 'Unresolved scenario name is not guessed');
  assert.equal(formatActivityDescription('USER_COMMENT', `User wrote ${projectId}`), `User wrote ${projectId}`, 'User content is preserved');
  assert(!formatBusinessAudit({ ...scheduleChange, after: scheduleChange.before }, context).includes('Proposal Solution'), 'Unchanged schedule rows do not clutter the display');
  assert(formatBusinessAudit({ ...scheduleChange, after: { schedule: [] } }, context).includes(translate('businessAudit.notSet')), 'Removed schedule rows keep their before/after evidence');
}
assert.equal(JSON.stringify(scheduleChange), original, 'Formatting does not alter stored audit values');
setActiveLanguage('en');
console.log('Readable audit presentation EN/ID: passed');
