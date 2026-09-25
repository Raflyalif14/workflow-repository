type AssignedWork = {
  status: string;
  project?: { status?: string; is_postponed?: boolean | null } | null;
};

export function isAssignedProjectActive(item: AssignedWork): boolean {
  return item.project?.status === "ACTIVE" && item.project.is_postponed !== true;
}

export function isAssignedProjectPaused(item: AssignedWork): boolean {
  return item.project?.status === "POSTPONED" || item.project?.is_postponed === true;
}

export function getAssignedMilestonesNeedingAction<T extends AssignedWork>(milestones: T[]): T[] {
  return milestones.filter(
    (item) => isAssignedProjectActive(item) && (item.status === "IN_PROGRESS" || item.status === "REJECTED")
  );
}

export function countAssignedMilestonesNeedingAction(milestones: AssignedWork[]): number {
  return getAssignedMilestonesNeedingAction(milestones).length;
}
