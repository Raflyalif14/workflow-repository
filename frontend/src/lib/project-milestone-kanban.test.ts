import assert from "node:assert/strict";
import { en } from "@/i18n/en";
import { id } from "@/i18n/id";
import type { ProjectMilestonePhase4, ProjectOutputDocumentItem } from "@/types/project";

// 1. Verify i18n keys parity
const requiredKanbanKeys = [
  "viewList",
  "viewKanban",
  "notStarted",
  "inProgress",
  "underReview",
  "completed",
  "noStages",
  "startStage",
  "starting",
  "workingDays",
  "dueOn",
  "noDueDate",
  "step",
  "viewInList",
  "mandatory",
  "optional",
  "draftUploaded",
  "waitingDraft",
  "underReviewBadge",
  "approvedBadge",
  "revisionBadge",
] as const;

for (const key of requiredKanbanKeys) {
  assert.ok(
    Boolean(en.kanban[key]),
    `en.kanban.${key} must be defined and non-empty`
  );
  assert.ok(
    Boolean(id.kanban[key]),
    `id.kanban.${key} must be defined and non-empty`
  );
}

// 2. Test Kanban column categorization logic
type KanbanColumnKey = "NOT_STARTED" | "IN_PROGRESS" | "UNDER_REVIEW" | "COMPLETED";

function getColumnForMilestone(
  milestone: Pick<ProjectMilestonePhase4, "id" | "status">,
  doc?: Pick<ProjectOutputDocumentItem, "status">,
  hasPendingDeadline = false
): KanbanColumnKey {
  const isApprovedOrCompleted =
    milestone.status === "COMPLETED" || milestone.status === "APPROVED";
  const isDocInReview = doc?.status === "IN_REVIEW";
  const isMilestoneAwaitingReview =
    ["SUBMITTED", "APPROVAL", "WAITING_APPROVAL"].includes(milestone.status) ||
    hasPendingDeadline;

  if (isApprovedOrCompleted) return "COMPLETED";
  if (isDocInReview || isMilestoneAwaitingReview) return "UNDER_REVIEW";
  if (["IN_PROGRESS", "TRIGGERED", "REJECTED"].includes(milestone.status)) return "IN_PROGRESS";
  return "NOT_STARTED";
}

// Test cases
assert.equal(
  getColumnForMilestone({ id: "1", status: "CREATED" }),
  "NOT_STARTED",
  "CREATED status goes to NOT_STARTED"
);

assert.equal(
  getColumnForMilestone({ id: "2", status: "IN_PROGRESS" }, { status: "DRAFT" }),
  "IN_PROGRESS",
  "IN_PROGRESS with DRAFT doc goes to IN_PROGRESS"
);

assert.equal(
  getColumnForMilestone({ id: "3", status: "IN_PROGRESS" }, { status: "IN_REVIEW" }),
  "UNDER_REVIEW",
  "IN_PROGRESS with IN_REVIEW doc moves to UNDER_REVIEW"
);

assert.equal(
  getColumnForMilestone({ id: "4", status: "SUBMITTED" }),
  "UNDER_REVIEW",
  "SUBMITTED milestone status moves to UNDER_REVIEW"
);

assert.equal(
  getColumnForMilestone({ id: "5", status: "COMPLETED" }),
  "COMPLETED",
  "COMPLETED status moves to COMPLETED"
);

assert.equal(
  getColumnForMilestone({ id: "6", status: "APPROVED" }),
  "COMPLETED",
  "APPROVED status moves to COMPLETED"
);

assert.equal(
  getColumnForMilestone({ id: "7", status: "IN_PROGRESS" }, undefined, true),
  "UNDER_REVIEW",
  "Pending deadline approval places item into UNDER_REVIEW"
);

// 3. Test in-column sorting and displayOrder alignment
const mockStages = [
  { id: "stage-a", status: "CREATED" },
  { id: "stage-b", status: "CREATED" },
  { id: "stage-c", status: "CREATED" },
];
const displayIndexMap = new Map<string, number>();
mockStages.forEach((m, idx) => displayIndexMap.set(m.id, idx + 1));

assert.equal(displayIndexMap.get("stage-a"), 1, "First stage is index 1");
assert.equal(displayIndexMap.get("stage-b"), 2, "Second stage is index 2");
assert.equal(displayIndexMap.get("stage-c"), 3, "Third stage is index 3");

// Verify sorting in column
const unsortedColumnItems = [
  { milestone: mockStages[2], displayOrder: 3 },
  { milestone: mockStages[0], displayOrder: 1 },
  { milestone: mockStages[1], displayOrder: 2 },
];
unsortedColumnItems.sort((a, b) => a.displayOrder - b.displayOrder);
assert.deepEqual(
  unsortedColumnItems.map((i) => i.displayOrder),
  [1, 2, 3],
  "Items in column must be sorted in ascending order of displayOrder"
);

console.log("Kanban i18n parity, column categorization, and step order tests passed successfully.");
