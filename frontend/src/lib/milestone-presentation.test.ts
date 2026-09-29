import assert from "node:assert/strict";
import type { ProjectOutputDocumentItem } from "@/types/project";
import { initialExpandedMilestoneIds, milestoneIdFromHash, reconcileExpandedMilestoneIds, visibleMilestoneOutputCounts } from "./milestone-presentation";

const milestones = [
  { id: "done", status: "COMPLETED" },
  { id: "active", status: "IN_PROGRESS" },
  { id: "review", status: "CREATED" },
  { id: "next", status: "CREATED" },
];
const output = (milestoneId: string, status: ProjectOutputDocumentItem["status"]): ProjectOutputDocumentItem => ({
  id: `${milestoneId}-${status}`, projectId: "project", key: `${milestoneId}-${status}`,
  milestoneId, name: "Output with a long descriptive name", group: "PRA_TENDER",
  isRequired: true, isSelected: true, status,
});
const documents = [output("active", "APPROVED"), output("active", "IN_REVIEW"), output("active", "REVISION_REQUIRED"), output("review", "IN_REVIEW")];

assert.deepEqual([...initialExpandedMilestoneIds(milestones, documents, "SA")], ["active"]);
assert.deepEqual([...initialExpandedMilestoneIds(milestones, documents, "HEAD_SA")], ["active", "review"]);
assert.deepEqual([...initialExpandedMilestoneIds(milestones, documents, "SALES")], ["active"]);
assert.equal(milestoneIdFromHash("#project-milestone-review", milestones.map((item) => item.id)), "review");
assert.equal(milestoneIdFromHash("#milestone-outputs-review", milestones.map((item) => item.id)), "review");
assert.equal(milestoneIdFromHash("#project-milestone-missing", milestones.map((item) => item.id)), null);
assert.equal(milestoneIdFromHash("#project-milestone-%invalid", milestones.map((item) => item.id)), null);
assert.deepEqual([...reconcileExpandedMilestoneIds(new Set(["done", "review"]), milestones, documents, "HEAD_SA", new Set(["active"]))], ["done", "review"]);
assert.deepEqual([...reconcileExpandedMilestoneIds(new Set(["done"]), milestones, documents, "HEAD_SA", new Set())], ["done", "active", "review"]);
assert.deepEqual(visibleMilestoneOutputCounts(documents, "active", true),
  { total: 3, approved: 1, inReview: 1, revisionRequired: 1 });
assert.deepEqual(visibleMilestoneOutputCounts([documents[0]], "active", false),
  { total: null, approved: 1, inReview: 0, revisionRequired: 0 });
console.log("Milestone expansion, deep links, and role-safe output summary: passed");
