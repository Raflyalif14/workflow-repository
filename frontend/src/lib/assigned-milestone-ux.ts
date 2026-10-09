type AssignedWork = {
  status: string;
  outputs?: { status: string; is_required: boolean; is_selected: boolean }[];
  project?: { status?: string; is_postponed?: boolean | null } | null;
};

export function isAssignedProjectActive(item: AssignedWork): boolean {
  return item.project?.status === "ACTIVE" && item.project.is_postponed !== true;
}

export function isAssignedProjectPaused(item: AssignedWork): boolean {
  return item.project?.status === "POSTPONED" || item.project?.is_postponed === true;
}

export type AssignedMilestoneState = "ACTION" | "WAITING_REVIEW" | "COMPLETED" | "OTHER";

export function countAssignedOutputsWaitingReview(item: AssignedWork): number {
  return (item.outputs || []).filter((output) => (output.is_required || output.is_selected)
    && ["SUBMITTED", "IN_REVIEW"].includes(output.status)).length;
}

export function getAssignedMilestoneState(item: AssignedWork): AssignedMilestoneState {
  // Completion stays driven by the milestone, not inferred from approved outputs.
  if (["COMPLETED", "APPROVED"].includes(item.status)) return "COMPLETED";
  if (!isAssignedProjectActive(item)) return "OTHER";
  if (item.outputs?.length) {
    if (["IN_PROGRESS", "REJECTED"].includes(item.status) && item.outputs.some((output) =>
      (output.is_required || output.is_selected) && ["TO_DO", "DRAFT", "REVISION_REQUIRED"].includes(output.status))) {
      return "ACTION";
    }
    if (countAssignedOutputsWaitingReview(item) > 0) return "WAITING_REVIEW";
    return "OTHER";
  }
  // Legacy milestones without output collections keep their existing action rule.
  return ["IN_PROGRESS", "REJECTED"].includes(item.status) ? "ACTION" : "OTHER";
}

export function getAssignedMilestonesNeedingAction<T extends AssignedWork>(milestones: T[]): T[] {
  return milestones.filter((item) => getAssignedMilestoneState(item) === "ACTION");
}

export function countAssignedMilestonesNeedingAction(milestones: AssignedWork[]): number {
  return getAssignedMilestonesNeedingAction(milestones).length;
}
