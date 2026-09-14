import type {
  MilestoneSubmissionRevision,
  MilestoneSubmissionRevisionAttachment,
} from "@/types/project";

export type MilestoneSubmissionSurfaceMode =
  | "SUBMIT"
  | "REVISION"
  | "WAITING"
  | "READ_ONLY";

export type MilestoneSubmissionPresentation = {
  mode: MilestoneSubmissionSurfaceMode;
  stateLabel: string;
  title: string;
  primaryLabel: string | null;
  pendingLabel: string | null;
  latestRejectedRevision: MilestoneSubmissionRevision | null;
  retainedAttachments: MilestoneSubmissionRevisionAttachment[];
};

function formatStatusFallback(status: string): string {
  const words = status
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unavailable";
}

export function getMilestoneSubmissionPresentation(
  milestoneStatus: string,
  history: MilestoneSubmissionRevision[] = []
): MilestoneSubmissionPresentation {
  const latestRevision = history[0] || null;
  const latestRejectedRevision =
    history.find((revision) => revision.status === "REJECTED") || null;
  const isWaiting =
    milestoneStatus === "SUBMITTED" ||
    milestoneStatus === "PENDING_REVIEW" ||
    latestRevision?.status === "PENDING_REVIEW";
  const isRevision =
    milestoneStatus === "REJECTED" ||
    milestoneStatus === "REVISION_REQUIRED" ||
    (milestoneStatus === "IN_PROGRESS" && latestRevision?.status === "REJECTED");

  if (isWaiting) {
    return {
      mode: "WAITING",
      stateLabel: "Waiting for review",
      title: "Waiting for review",
      primaryLabel: null,
      pendingLabel: null,
      latestRejectedRevision,
      retainedAttachments: latestRejectedRevision?.attachments || [],
    };
  }

  if (isRevision) {
    return {
      mode: "REVISION",
      stateLabel:
        milestoneStatus === "IN_PROGRESS"
          ? "Revision in progress"
          : "Revision requested",
      title: "Submit revision",
      primaryLabel: "Submit revision",
      pendingLabel: "Submitting revision...",
      latestRejectedRevision,
      retainedAttachments: latestRejectedRevision?.attachments || [],
    };
  }

  if (milestoneStatus === "IN_PROGRESS") {
    return {
      mode: "SUBMIT",
      stateLabel: "In progress",
      title: "Submit work",
      primaryLabel: "Submit work",
      pendingLabel: "Submitting...",
      latestRejectedRevision,
      retainedAttachments: latestRejectedRevision?.attachments || [],
    };
  }

  return {
    mode: "READ_ONLY",
    stateLabel: formatStatusFallback(milestoneStatus),
    title: "Milestone submission",
    primaryLabel: null,
    pendingLabel: null,
    latestRejectedRevision,
    retainedAttachments: latestRejectedRevision?.attachments || [],
  };
}
