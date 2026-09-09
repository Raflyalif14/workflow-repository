import {
  MilestoneDeadlineApproval,
  MilestoneSubmissionApproval,
  ProjectMilestonePhase4,
} from "@/types/project";

export type DeadlinePrerequisiteStatus = "APPROVED" | "PENDING" | "REJECTED" | "NOT_SET";
export type DeadlineHealthStatus = "NOT_SET" | "ON_TRACK" | "DUE_SOON" | "OVERDUE" | "COMPLETED";
export type DeadlineHealthTone = "neutral" | "success" | "warning" | "destructive";

export type DeadlineHealthPresentation = {
  label: string;
  detail?: string;
  tone: DeadlineHealthTone;
};

export function getDeadlineHealthPresentation(
  status: DeadlineHealthStatus,
  remainingWorkingDays: number | null
): DeadlineHealthPresentation {
  const remaining = Math.abs(remainingWorkingDays ?? 0);
  const workingDays = `${remaining} working day${remaining === 1 ? "" : "s"}`;

  switch (status) {
    case "OVERDUE":
      return { label: "OVERDUE", detail: `Overdue by ${workingDays}`, tone: "destructive" };
    case "DUE_SOON":
      return { label: "DUE SOON", detail: `${workingDays} remaining`, tone: "warning" };
    case "ON_TRACK":
      return {
        label: "ON TRACK",
        detail: remainingWorkingDays === null ? undefined : `${workingDays} remaining`,
        tone: "success",
      };
    case "COMPLETED":
      return { label: "COMPLETED", tone: "success" };
    case "NOT_SET":
      return { label: "NOT SET", tone: "neutral" };
  }
}

export function getMilestoneDisplayStatus(milestone: Pick<ProjectMilestonePhase4, "status">) {
  return milestone.status;
}

export function isMilestoneCompleted(milestone: Pick<ProjectMilestonePhase4, "status">) {
  return milestone.status === "COMPLETED" || milestone.status === "APPROVED";
}

export function getEffectiveDeadline(
  milestone: Pick<ProjectMilestonePhase4, "start_date" | "duration_working_days" | "due_date">
) {
  return {
    start_date: milestone.start_date,
    duration_working_days: milestone.duration_working_days,
    due_date: milestone.due_date,
  };
}

export function hasEffectiveDeadline(
  milestone: Pick<ProjectMilestonePhase4, "start_date" | "duration_working_days" | "due_date">
) {
  return Boolean(milestone.start_date && milestone.duration_working_days && milestone.due_date);
}

export function getLatestSubmissionApproval(history: MilestoneSubmissionApproval[] = []) {
  return history[0] || null;
}

export function canViewCurrentRejectedSubmission(
  packageStatus: string | null | undefined,
  actor: { id?: string; role?: string } | null | undefined,
  milestone: Pick<ProjectMilestonePhase4, "pic_id">
) {
  if (packageStatus !== "REJECTED" || !actor) return false;
  if (actor.role === "SUPER_ADMIN" || actor.role === "HEAD_SA") return true;
  return actor.role === "SA" && milestone.pic_id === actor.id;
}

function approvalMatchesEffectiveDeadline(
  milestone: Pick<ProjectMilestonePhase4, "start_date" | "duration_working_days" | "due_date">,
  approval?: MilestoneDeadlineApproval | null
) {
  return Boolean(
    approval?.status === "APPROVED" &&
      approval.deadline &&
      approval.deadline.start_date === milestone.start_date &&
      approval.deadline.duration_working_days === milestone.duration_working_days &&
      approval.deadline.due_date === milestone.due_date
  );
}

export function getDeadlinePrerequisiteStatus(
  milestone: Pick<ProjectMilestonePhase4, "start_date" | "duration_working_days" | "due_date">,
  currentApproval?: MilestoneDeadlineApproval | null,
  approvalHistory: MilestoneDeadlineApproval[] = []
): DeadlinePrerequisiteStatus {
  const effectiveExists = hasEffectiveDeadline(milestone);
  const hasApprovedEffective =
    approvalMatchesEffectiveDeadline(milestone, currentApproval) ||
    approvalHistory.some((approval) => approvalMatchesEffectiveDeadline(milestone, approval));

  if (effectiveExists && hasApprovedEffective) return "APPROVED";
  if (!effectiveExists && currentApproval?.status === "PENDING") return "PENDING";
  if (!effectiveExists && currentApproval?.status === "REJECTED") return "REJECTED";
  if (effectiveExists && currentApproval?.status !== "PENDING") return "APPROVED";
  return "NOT_SET";
}
