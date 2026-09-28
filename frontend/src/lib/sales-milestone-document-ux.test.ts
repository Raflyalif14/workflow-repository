import assert from "node:assert/strict";
import { canUploadSalesMilestoneDocuments } from "./sales-milestone-document-ux";

const actor = { id: "sales-owner", role: "SALES" };
const activeProject = { salesId: "sales-owner", status: "ACTIVE", isPostponed: false };
const activeSalesMilestone = { status: "IN_PROGRESS", stageRole: "SALES" };

assert(canUploadSalesMilestoneDocuments(actor, activeProject, activeSalesMilestone));
assert(!canUploadSalesMilestoneDocuments({ id: "sales-other", role: "SALES" }, activeProject, activeSalesMilestone));
assert(!canUploadSalesMilestoneDocuments({ id: "admin", role: "SUPER_ADMIN" }, activeProject, activeSalesMilestone));
assert(!canUploadSalesMilestoneDocuments(actor, { ...activeProject, isPostponed: true }, activeSalesMilestone));

for (const status of ["WAITING_RESULT", "WON", "LOST", "COMPLETED", "CANCELLED"]) {
  assert(!canUploadSalesMilestoneDocuments(actor, { ...activeProject, status }, activeSalesMilestone));
}
for (const status of ["CREATED", "SUBMITTED", "REJECTED", "APPROVED", "COMPLETED"]) {
  assert(!canUploadSalesMilestoneDocuments(actor, activeProject, { ...activeSalesMilestone, status }));
}
assert(!canUploadSalesMilestoneDocuments(actor, activeProject, { ...activeSalesMilestone, stageRole: "SA" }));

console.log("Sales milestone document UX policy tests passed.");
