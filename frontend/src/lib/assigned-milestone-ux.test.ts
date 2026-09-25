import { strict as assert } from "node:assert";
import {
  countAssignedMilestonesNeedingAction,
  getAssignedMilestonesNeedingAction,
  isAssignedProjectActive,
  isAssignedProjectPaused,
} from "./assigned-milestone-ux";

const milestones = [
  { id: "active-work", status: "IN_PROGRESS", project: { status: "ACTIVE", is_postponed: false } },
  { id: "active-revision", status: "REJECTED", project: { status: "ACTIVE", is_postponed: false } },
  { id: "paused-status", status: "IN_PROGRESS", project: { status: "POSTPONED", is_postponed: false } },
  { id: "paused-flag", status: "REJECTED", project: { status: "ACTIVE", is_postponed: true } },
  { id: "completed-project", status: "IN_PROGRESS", project: { status: "COMPLETED", is_postponed: false } },
  { id: "active-review", status: "SUBMITTED", project: { status: "ACTIVE", is_postponed: false } },
];

const original = JSON.stringify(milestones);
const needsAction = getAssignedMilestonesNeedingAction(milestones);
assert.deepEqual(needsAction.map((item) => item.id), ["active-work", "active-revision"]);
assert.equal(needsAction.length, 2);
assert.equal(milestones.length, 6, "All assigned must retain postponed milestones");
assert.equal(JSON.stringify(milestones), original, "Filtering must not mutate assigned data");
assert.equal(isAssignedProjectActive(milestones[0]), true);
assert.equal(isAssignedProjectActive(milestones[2]), false);
assert.equal(isAssignedProjectActive(milestones[3]), false);
assert.equal(isAssignedProjectPaused(milestones[2]), true);
assert.equal(isAssignedProjectPaused(milestones[3]), true);
assert.equal(isAssignedProjectPaused(milestones[4]), false);
assert.equal(isAssignedProjectActive({ status: "IN_PROGRESS", project: null }), false);

const sidebarCount = countAssignedMilestonesNeedingAction;
const pageCount = (items: typeof milestones) => getAssignedMilestonesNeedingAction(items).length;
assert.equal(sidebarCount(milestones), pageCount(milestones));
assert.equal(sidebarCount([milestones[2], milestones[3]]), 0, "Postponed projects have no sidebar badge or page actions");
const resumed = milestones.map((item) => item.id === "paused-status"
  ? { ...item, project: { status: "ACTIVE", is_postponed: false } }
  : item);
assert.equal(sidebarCount(resumed), pageCount(resumed));
assert.equal(sidebarCount(resumed), 3, "Resumed work is actionable again");

console.log("Assigned milestone action eligibility: active versus postponed passed");
