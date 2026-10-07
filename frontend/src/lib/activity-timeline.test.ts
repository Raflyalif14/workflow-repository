import { setActiveLanguage } from "@/i18n";
import { strict as assert } from "assert";
import { flattenActivityPages, formatActivityAction, formatActivityDescription } from "./activity-timeline";
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
