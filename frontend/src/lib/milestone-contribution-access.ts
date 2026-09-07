type ContributionActor = {
  id?: string | null;
  role?: string | null;
};

type ContributionProject = {
  salesId?: string | null;
  status?: string | null;
  isPostponed?: boolean | null;
  workflowModel?: string | null;
  workflowVersion?: number | null;
};

type ContributionMilestone = {
  stepOrder: number;
  status: string;
  picId?: string | null;
};

export function isOperationalV2FirstMilestone(
  project: ContributionProject,
  milestone: ContributionMilestone
): boolean {
  return (
    project.workflowModel === "OPERATIONAL_V2" &&
    project.workflowVersion === 2 &&
    milestone.stepOrder === 1
  );
}

export function canViewMilestoneContributions(
  actor: ContributionActor | null | undefined,
  project: ContributionProject,
  milestone: ContributionMilestone
): boolean {
  if (!actor?.id || !isOperationalV2FirstMilestone(project, milestone)) return false;
  if (actor.role === "SUPER_ADMIN" || actor.role === "HEAD_SA") return true;
  if (actor.role === "SALES") return actor.id === project.salesId;
  if (actor.role === "SA") return actor.id === milestone.picId;
  return false;
}

export function canAddMilestoneContribution(
  actor: ContributionActor | null | undefined,
  project: ContributionProject,
  milestone: ContributionMilestone
): boolean {
  return (
    Boolean(actor?.id) &&
    actor?.role === "SALES" &&
    actor.id === project.salesId &&
    project.status === "ACTIVE" &&
    !project.isPostponed &&
    milestone.status === "IN_PROGRESS" &&
    Boolean(milestone.picId) &&
    isOperationalV2FirstMilestone(project, milestone)
  );
}
