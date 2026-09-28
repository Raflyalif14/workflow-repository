export type SalesMilestoneUploadActor = {
  id?: string | null;
  role?: string | null;
};

export type SalesMilestoneUploadProject = {
  salesId?: string | null;
  status?: string | null;
  isPostponed?: boolean | null;
};

export type SalesMilestoneUploadMilestone = {
  status?: string | null;
  stageRole?: string | null;
};

export function canUploadSalesMilestoneDocuments(
  actor: SalesMilestoneUploadActor | null | undefined,
  project: SalesMilestoneUploadProject,
  milestone: SalesMilestoneUploadMilestone
): boolean {
  return Boolean(
    actor?.role === "SALES" &&
      actor.id &&
      actor.id === project.salesId &&
      project.status === "ACTIVE" &&
      project.isPostponed !== true &&
      milestone.stageRole === "SALES" &&
      milestone.status === "IN_PROGRESS"
  );
}
