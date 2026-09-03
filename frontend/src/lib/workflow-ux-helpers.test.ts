import {
  formatMilestoneStatusLabel,
  formatProjectStatusLabel,
  getApprovalTypeDisplay,
  isTimelineComplete,
  resolveCurrentStage,
  resolveNextAction,
} from "./workflow-ux-helpers";
import { Project, ProjectMilestonePhase4, ProjectPlanApproval } from "@/types/project";

const baseProject: Project = {
  id: "project-1",
  name: "Bank Mega Core Migration",
  customer: "Bank Mega",
  status: "DRAFT",
  sales_id: "sales-1",
  pic: null,
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
};

const milestone1: ProjectMilestonePhase4 = {
  id: "m-1",
  project_id: "project-1",
  workflow_stage_id: "ws-1",
  name: "Minutes of Meeting",
  step_order: 1,
  status: "COMPLETED",
  workflow_stage: { id: "ws-1", default_role: "SALES" },
  start_date: "2026-08-28",
  duration_working_days: 1,
  due_date: "2026-08-28",
  created_at: "2026-08-28T00:00:00.000Z",
  updated_at: "2026-08-28T00:00:00.000Z",
};

const milestone2: ProjectMilestonePhase4 = {
  id: "m-2",
  project_id: "project-1",
  workflow_stage_id: "ws-2",
  name: "Assign PIC",
  step_order: 2,
  status: "IN_PROGRESS",
  workflow_stage: { id: "ws-2", default_role: "HEAD_SA" },
  created_at: "2026-08-28T00:00:00.000Z",
  updated_at: "2026-08-28T00:00:00.000Z",
};

const milestone3: ProjectMilestonePhase4 = {
  id: "m-3",
  project_id: "project-1",
  workflow_stage_id: "ws-3",
  name: "Assessment Report",
  step_order: 3,
  status: "CREATED",
  pic_id: "sa-1",
  pic: { id: "sa-1", full_name: "Budi SA", email: "budi@work.com", role: "SA" },
  workflow_stage: { id: "ws-3", default_role: "SA" },
  start_date: "2026-08-29",
  duration_working_days: 3,
  due_date: "2026-09-02",
  created_at: "2026-08-28T00:00:00.000Z",
  updated_at: "2026-08-28T00:00:00.000Z",
};

// ─── Test 1: Labels ───
if (formatProjectStatusLabel("DRAFT") !== "Draft" || formatProjectStatusLabel("ACTIVE") !== "Active") {
  throw new Error("formatProjectStatusLabel failed");
}
if (formatMilestoneStatusLabel("IN_PROGRESS") !== "In Progress" || formatMilestoneStatusLabel("SUBMITTED") !== "Under Review") {
  throw new Error("formatMilestoneStatusLabel failed");
}
if (getApprovalTypeDisplay("PROJECT_PLAN") !== "Project Plan" || getApprovalTypeDisplay("DEADLINE") !== "Deadline Change" || getApprovalTypeDisplay("SUBMISSION") !== "SA Submission") {
  throw new Error("getApprovalTypeDisplay failed");
}

// ─── Test 2: Current Stage Resolution ───
const current1 = resolveCurrentStage([milestone1, milestone2, milestone3]);
if (current1?.id !== "m-2") {
  throw new Error(`resolveCurrentStage should pick in-progress milestone m-2, got ${current1?.id}`);
}

const current2 = resolveCurrentStage([
  milestone1,
  { ...milestone2, status: "COMPLETED" },
  milestone3,
]);
if (current2?.id !== "m-3") {
  throw new Error(`resolveCurrentStage should pick next CREATED milestone m-3, got ${current2?.id}`);
}

const current3 = resolveCurrentStage([
  milestone1,
  { ...milestone2, status: "COMPLETED" },
  { ...milestone3, status: "COMPLETED" },
]);
if (current3 !== null) {
  throw new Error("resolveCurrentStage should return null when all completed");
}

// ─── Test 3: Timeline Completeness ───
const completeness1 = isTimelineComplete([milestone1, milestone2, milestone3]);
if (!completeness1.isComplete) {
  throw new Error("Timeline with valid milestone3 should be complete");
}

const completeness2 = isTimelineComplete([
  milestone1,
  milestone2,
  { ...milestone3, start_date: null },
]);
if (completeness2.isComplete || completeness2.incompleteMilestoneNames.length === 0) {
  throw new Error("Timeline with missing start_date should be incomplete");
}

// ─── Test 4: Next Action in DRAFT state ───
const draftActionSales = resolveNextAction(baseProject, [milestone1, milestone2, milestone3], null, {
  id: "sales-1",
  role: "SALES",
});
if (draftActionSales.actionType !== "SUBMIT_PLAN" || !draftActionSales.canPerformAction) {
  throw new Error("Sales should have SUBMIT_PLAN action for draft project");
}

const draftActionOther = resolveNextAction(baseProject, [milestone1, milestone2, milestone3], null, {
  id: "head-1",
  role: "HEAD_SA",
});
if (!draftActionOther.isWaiting || draftActionOther.waitingForRole !== "SALES") {
  throw new Error("Head SA should see waiting for SALES state on unsubmitted draft");
}

// ─── Test 5: Next Action for PENDING Plan Review ───
const pendingPlan: ProjectPlanApproval = {
  id: "plan-app-1",
  project_id: "project-1",
  status: "PENDING",
  requested_by: { id: "sales-1", full_name: "Sales Rep", email: "sales@work.com" },
  reviewed_by: null,
  request_note: "Ready for review",
  review_note: null,
  submitted_at: "2026-08-28T00:00:00.000Z",
  reviewed_at: null,
  created_at: "2026-08-28T00:00:00.000Z",
  updated_at: "2026-08-28T00:00:00.000Z",
};

const pendingPlanHeadSa = resolveNextAction(baseProject, [milestone1, milestone2, milestone3], pendingPlan, {
  id: "head-1",
  role: "HEAD_SA",
});
if (pendingPlanHeadSa.actionType !== "REVIEW_PLAN" || !pendingPlanHeadSa.canPerformAction) {
  throw new Error("Head SA should have REVIEW_PLAN action for pending plan");
}

const pendingPlanSales = resolveNextAction(baseProject, [milestone1, milestone2, milestone3], pendingPlan, {
  id: "sales-1",
  role: "SALES",
});
if (!pendingPlanSales.isWaiting || pendingPlanSales.waitingForRole !== "HEAD_SA") {
  throw new Error("Sales should see waiting for HEAD_SA when plan is pending");
}

// ─── Test 6: Next Action for ACTIVE project on Assign PIC ───
const activeProject: Project = { ...baseProject, status: "ACTIVE" };
const activeAssignPicHeadSa = resolveNextAction(activeProject, [milestone1, milestone2, milestone3], null, {
  id: "head-1",
  role: "HEAD_SA",
});
if (activeAssignPicHeadSa.actionType !== "ASSIGN_PIC" || !activeAssignPicHeadSa.canPerformAction) {
  throw new Error("Head SA should have ASSIGN_PIC action");
}

const activeAssignPicSales = resolveNextAction(activeProject, [milestone1, milestone2, milestone3], null, {
  id: "sales-1",
  role: "SALES",
});
if (!activeAssignPicSales.isWaiting || activeAssignPicSales.waitingForRole !== "HEAD_SA") {
  throw new Error("Sales should see waiting for HEAD_SA for PIC assignment");
}

// ─── Test 7: Next Action for SA stage in progress / submitted / rejected ───
const saMilestones: ProjectMilestonePhase4[] = [
  milestone1,
  { ...milestone2, status: "COMPLETED" },
  { ...milestone3, status: "IN_PROGRESS" },
];

const saActionAssigned = resolveNextAction(activeProject, saMilestones, null, {
  id: "sa-1",
  role: "SA",
});
if (saActionAssigned.actionType !== "SUBMIT_WORK" || !saActionAssigned.canPerformAction) {
  throw new Error("Assigned SA should have SUBMIT_WORK action");
}

const saActionOther = resolveNextAction(activeProject, saMilestones, null, {
  id: "sales-1",
  role: "SALES",
});
if (!saActionOther.isWaiting || saActionOther.waitingForRole !== "SA") {
  throw new Error("Sales should see waiting for SA when milestone is in progress");
}

// ─── Test 8: Postponed & Completed states ───
const headSaPicMilestone = {
  ...milestone3,
  pic_id: "head-1",
  pic: { id: "head-1", full_name: "Head SA", email: "head@work.com", role: "HEAD_SA" },
};
const headSaAssignedSubmit = resolveNextAction(
  activeProject,
  [milestone1, { ...milestone2, status: "COMPLETED" }, { ...headSaPicMilestone, status: "IN_PROGRESS" }],
  null,
  { id: "head-1", role: "HEAD_SA" }
);
if (headSaAssignedSubmit.actionType !== "SUBMIT_WORK" || !headSaAssignedSubmit.canPerformAction) {
  throw new Error("Assigned HEAD_SA PIC should have SUBMIT_WORK action on an SA stage");
}

const headSaOtherSubmit = resolveNextAction(activeProject, saMilestones, null, {
  id: "head-1",
  role: "HEAD_SA",
});
if (headSaOtherSubmit.actionType === "SUBMIT_WORK" || headSaOtherSubmit.canPerformAction) {
  throw new Error("Unassigned HEAD_SA must not receive SA-stage worker actions");
}

const headSaAssignedRevision = resolveNextAction(
  activeProject,
  [milestone1, { ...milestone2, status: "COMPLETED" }, { ...headSaPicMilestone, status: "REJECTED" }],
  null,
  { id: "head-1", role: "HEAD_SA" }
);
if (headSaAssignedRevision.actionType !== "START_REVISION" || !headSaAssignedRevision.canPerformAction) {
  throw new Error("Assigned HEAD_SA PIC should have START_REVISION action on an SA stage");
}

const headSaSelfReview = resolveNextAction(
  activeProject,
  [milestone1, { ...milestone2, status: "COMPLETED" }, { ...headSaPicMilestone, status: "SUBMITTED" }],
  null,
  { id: "head-1", role: "HEAD_SA" }
);
if (headSaSelfReview.actionType !== "REVIEW_SUBMISSION" || !headSaSelfReview.canPerformAction) {
  throw new Error("HEAD_SA should retain REVIEW_SUBMISSION after self-submission");
}

const postponedProject: Project = { ...baseProject, status: "POSTPONED", is_postponed: true };
const postponedSales = resolveNextAction(postponedProject, saMilestones, null, {
  id: "sales-1",
  role: "SALES",
});
if (postponedSales.actionType !== "RESUME_PROJECT" || !postponedSales.canPerformAction) {
  throw new Error("Sales should be able to RESUME_PROJECT on postponed project");
}

const completedProject: Project = { ...baseProject, status: "COMPLETED" };
const completedAction = resolveNextAction(completedProject, saMilestones, null, {
  id: "sales-1",
  role: "SALES",
});
if (completedAction.actionType !== "NONE" || completedAction.isWaiting) {
  throw new Error("Completed project should show Workflow Completed with no pending actions");
}

console.log("All workflow UX helper tests passed successfully!");
