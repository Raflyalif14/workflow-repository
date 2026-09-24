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
  if (role === "SA" && status === "DRAFT" && canUpload) {
    return "Ready to submit for Head SA review.";
  }

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
  if (role === "SA") return "Upload project outputs and submit drafts for Head SA review.";
  return "Upload, submit, and review each agreed output independently.";
}

type OutputDocumentSubmissionInput = {
  key: string;
  status: string;
  currentVersionId?: string | null;
};

export function getOutputDocumentSubmitAction({
  role,
  status,
  currentVersionId,
  canUpload,
}: Pick<OutputDocumentSubmissionInput, "status" | "currentVersionId"> & { role?: string; canUpload: boolean }): string | null {
  return role === "SA" && canUpload && status === "DRAFT" && Boolean(currentVersionId) ? "Submit for review" : null;
}

export function getSubmittableOutputDocuments<T extends OutputDocumentSubmissionInput>(
  documents: readonly T[],
  canUpload: boolean,
  role?: string
): T[] {
  return documents.filter((document) => Boolean(getOutputDocumentSubmitAction({ ...document, canUpload, role })));
}

export function getOutputDocumentSubmissionSelectionLabel(documentName: string): string {
  return `Select ${documentName} for submission`;
}

export type SubmissionOperation =
  | { kind: "single"; documentKey: string }
  | { kind: "batch" }
  | null;

export function getSingleSubmissionOperationState(operation: SubmissionOperation, documentKey: string) {
  const isLoading = operation?.kind === "single" && operation.documentKey === documentKey;
  return {
    isLoading,
    isDisabled: operation !== null,
    ariaBusy: isLoading,
  };
}

export function isBatchSubmissionOperation(operation: SubmissionOperation): boolean {
  return operation?.kind === "batch";
}

type OutputDocumentReviewInput = {
  key: string;
  status: string;
  currentVersionId?: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getOutputDocumentApproveAction({
  status,
  currentVersionId,
  canReview,
}: Pick<OutputDocumentReviewInput, "status" | "currentVersionId"> & { canReview: boolean }): string | null {
  return canReview && status === "IN_REVIEW" && Boolean(currentVersionId && UUID_PATTERN.test(currentVersionId))
    ? "Approve"
    : null;
}

export function getReviewableOutputDocuments<T extends OutputDocumentReviewInput>(
  documents: readonly T[],
  canReview: boolean
): T[] {
  return documents.filter((document) => Boolean(getOutputDocumentApproveAction({ ...document, canReview })));
}

export function getOutputDocumentApprovalSelectionLabel(documentName: string): string {
  return `Select ${documentName} for approval`;
}

export function getOutputDocumentApprovalSelection<T extends { key: string }>(
  reviewableDocuments: readonly T[],
  selectAll: boolean
): string[] {
  return selectAll ? reviewableDocuments.map((document) => document.key) : [];
}

export type ReviewOperation =
  | { kind: "single"; documentKey: string }
  | { kind: "batch" }
  | null;

export function getSingleReviewOperationState(operation: ReviewOperation, documentKey: string) {
  const isLoading = operation?.kind === "single" && operation.documentKey === documentKey;
  return {
    isLoading,
    isDisabled: operation !== null,
    ariaBusy: isLoading,
  };
}

export function isBatchReviewOperation(operation: ReviewOperation): boolean {
  return operation?.kind === "batch";
}
