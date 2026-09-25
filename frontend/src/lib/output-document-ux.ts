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
    return "Siap diajukan untuk ditinjau Head SA.";
  }

  if (canUpload || canReview) return null;

  if (role === "HEAD_SA") {
    if (!hasAssignedPic) return "Menunggu penetapan Solution Architect.";
    if (status === "TO_DO") return "Menunggu SA yang ditugaskan mengunggah output ini.";
    if (status === "DRAFT") return "Menunggu SA yang ditugaskan mengajukan output ini.";
    if (status === "REVISION_REQUIRED") return "Menunggu SA yang ditugaskan mengunggah dan mengajukan revisi.";
    if (status === "APPROVED") return "Peninjauan selesai.";
  }

  if (role === "SA") {
    if (status === "IN_REVIEW") return "Menunggu peninjauan Head SA.";
    if (status === "APPROVED") return "Disetujui dan tersedia sebagai hasil proyek.";
  }

  if ((role === "SALES" || role === "SUPER_ADMIN") && status === "APPROVED") {
    return "Hasil proyek disetujui.";
  }

  return null;
}

export function getOutputDocumentsHeaderDescription(role?: string): string {
  if (role === "HEAD_SA") return "Tinjau output yang diajukan dan pantau hasil proyek yang disepakati.";
  if (role === "SA") return "Unggah output proyek dan ajukan draf untuk ditinjau Head SA.";
  return "Pantau setiap output proyek yang telah disepakati.";
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
  return role === "SA" && canUpload && status === "DRAFT" && Boolean(currentVersionId) ? "Ajukan untuk ditinjau" : null;
}

export function getSubmittableOutputDocuments<T extends OutputDocumentSubmissionInput>(
  documents: readonly T[],
  canUpload: boolean,
  role?: string
): T[] {
  return documents.filter((document) => Boolean(getOutputDocumentSubmitAction({ ...document, canUpload, role })));
}

export function getOutputDocumentSubmissionSelectionLabel(documentName: string): string {
  return `Pilih ${documentName} untuk diajukan`;
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
    ? "Setujui"
    : null;
}

export function getReviewableOutputDocuments<T extends OutputDocumentReviewInput>(
  documents: readonly T[],
  canReview: boolean
): T[] {
  return documents.filter((document) => Boolean(getOutputDocumentApproveAction({ ...document, canReview })));
}

export function getOutputDocumentApprovalSelectionLabel(documentName: string): string {
  return `Pilih ${documentName} untuk disetujui`;
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
