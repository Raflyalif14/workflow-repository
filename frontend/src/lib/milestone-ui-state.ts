import {
  MilestoneDeadlineApproval,
  MilestoneSubmissionApproval,
  ProjectMilestonePhase4,
} from "@/types/project";

export type DeadlinePrerequisiteStatus = "APPROVED" | "PENDING" | "REJECTED" | "NOT_SET";

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
