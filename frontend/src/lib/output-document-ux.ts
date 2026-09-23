type OutputDocumentSelection = {
  isRequired: boolean;
  isSelected: boolean;
};

export function getActiveOutputDocuments<T extends OutputDocumentSelection>(documents: readonly T[]): T[] {
  return documents.filter((document) => document.isRequired || document.isSelected);
}

type OutputDocumentPresentationInput = {
  role?: string;
  status: string;
  canUpload: boolean;
  canReview: boolean;
  hasAssignedPic: boolean;
};

export function getOutputDocumentContextMessage({
  role,
  status,
  canUpload,
  canReview,
  hasAssignedPic,
}: OutputDocumentPresentationInput): string | null {
  if (canUpload || canReview) return null;

  if (role === "HEAD_SA") {
    if (!hasAssignedPic) return "Waiting for a Solution Architect assignment.";
    if (status === "TO_DO") return "Waiting for the assigned SA to upload this output.";
    if (status === "DRAFT") return "Waiting for the assigned SA to submit this output for review.";
    if (status === "REVISION_REQUIRED") return "Waiting for the assigned SA to upload and submit a revision.";
    if (status === "APPROVED") return "Review completed.";
  }

  if (role === "SA") {
    if (status === "IN_REVIEW") return "Waiting for Head SA review.";
    if (status === "APPROVED") return "Approved and available as a project deliverable.";
  }

  if ((role === "SALES" || role === "SUPER_ADMIN") && status === "APPROVED") {
    return "Approved deliverable.";
  }

  return null;
}

export function getOutputDocumentsHeaderDescription(role?: string): string {
  if (role === "HEAD_SA") return "Review submitted outputs and monitor agreed project deliverables.";
  return "Upload, submit, and review each agreed output independently.";
}
