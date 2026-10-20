import assert from "node:assert/strict";
import { buildActivityFilters, EMPTY_ACTIVITY_FILTERS } from "./dashboard-activity-filters";

const now = new Date(2026, 9, 20, 15, 30);
assert.deepEqual(buildActivityFilters(EMPTY_ACTIVITY_FILTERS, now), { filters: {} });
for (const [period, startDay] of [["today", 20], ["last7", 14]] as const) {
  const result = buildActivityFilters({ ...EMPTY_ACTIVITY_FILTERS, period }, now);
  assert.deepEqual(result.filters, { from: new Date(2026, 9, startDay).toISOString(), to: new Date(2026, 9, 21).toISOString() });
}
const range = { ...EMPTY_ACTIVITY_FILTERS, period: "custom" as const, from: "2026-10-08", to: "2026-10-08", projectId: "p", kind: "DOCUMENT" as const };
assert.deepEqual(buildActivityFilters(range).filters, { projectId: "p", kind: "DOCUMENT", from: new Date(2026, 9, 8).toISOString(), to: new Date(2026, 9, 9).toISOString() });
assert.equal(buildActivityFilters({ ...range, from: "2026-10-09" }).error, "activityFilters.invalidRange");
for (const value of ["", "2026-02-30", "2026-13-01", "bad", "2026-10-08T00:00:00Z"]) assert.equal(buildActivityFilters({ ...range, from: value }).error, "activityFilters.invalidDates");
assert.deepEqual(buildActivityFilters({ ...range, period: "all" }).filters, { projectId: "p", kind: "DOCUMENT" }, "Hidden date fields do not continue filtering");
console.log("Activity filters: browser calendar-day boundaries, today/7-day presets, inclusive final day, combined fields, invalid dates and range validation passed");
