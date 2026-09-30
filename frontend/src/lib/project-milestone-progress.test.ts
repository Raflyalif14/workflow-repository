import assert from "node:assert/strict";
import type { ProjectMilestonePhase4, ProjectStatus } from "@/types/project";
import { calculateProjectMilestoneProgress } from "./project-milestone-progress";

type Status = ProjectMilestonePhase4["status"];
const milestones = (...statuses: Status[]) => statuses.map((status) => ({ status }));
const endpointRule = (statuses: Status[]) => {
  const completed = statuses.filter((status) => status === "COMPLETED" || status === "APPROVED").length;
  return { completed, total: statuses.length, percentage: statuses.length ? Math.round(completed / statuses.length * 100) : 0 };
};

for (const statuses of [
  [],
  ["CREATED", "IN_PROGRESS", "SUBMITTED", "REJECTED"],
  ["COMPLETED", "IN_PROGRESS", "APPROVED"],
  ["COMPLETED", "APPROVED"],
  ["APPROVED", "PENDING", "WAITING_APPROVAL", "COMPLETED", "NOT_STARTED", "OVERDUE"],
] as Status[][]) {
  assert.deepEqual(calculateProjectMilestoneProgress(milestones(...statuses)), endpointRule(statuses));
}
assert.deepEqual(calculateProjectMilestoneProgress(milestones("COMPLETED", "CREATED", "CREATED")),
  { completed: 1, total: 3, percentage: 33 }, "Percentage follows endpoint rounding");

for (const projectStatus of ["DRAFT", "ACTIVE", "POSTPONED", "WAITING_RESULT", "WON", "LOST"] as ProjectStatus[]) {
  const storedMilestones = milestones("COMPLETED", "APPROVED", "CREATED");
  assert.deepEqual(calculateProjectMilestoneProgress(storedMilestones), endpointRule(storedMilestones.map((item) => item.status)),
    `${projectStatus}: project status does not override stored milestone progress`);
}

const selectedPhase19Milestones = milestones("COMPLETED", "CREATED");
assert.deepEqual(calculateProjectMilestoneProgress(selectedPhase19Milestones), { completed: 1, total: 2, percentage: 50 },
  "Uncreated Phase 19 template stages are excluded from the denominator");
console.log("Project milestone progress parity and stored milestone scope: passed");
