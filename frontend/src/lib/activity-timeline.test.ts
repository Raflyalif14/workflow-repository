import { strict as assert } from "assert";
import { flattenActivityPages, formatActivityAction } from "./activity-timeline";

assert.equal(formatActivityAction("PROJECT_PLAN_APPROVED"), "Project Plan Approved", "Test 1: known actions receive readable labels");
assert.equal(formatActivityAction("MILESTONE_REVISION_STARTED"), "Revision Requested", "Test 1: revision action family receives a shared label");
console.log("Test 1 - Known activity action formatting: passed");

assert.equal(formatActivityAction("LEGACY_CUSTOM_EVENT"), "Legacy Custom Event", "Test 2: unknown historical actions remain readable");
console.log("Test 2 - Unknown action fallback formatting: passed");

const flattened = flattenActivityPages([
  { items: [{ id: "one" } as any], nextCursor: "cursor-one" },
  { items: [{ id: "two" } as any], nextCursor: null },
]);
assert.deepEqual(flattened.map((item) => item.id), ["one", "two"], "Test 3: paginated activity results preserve page order");
console.log("Test 3 - Activity page flattening: passed");
