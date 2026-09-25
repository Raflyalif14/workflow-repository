import {
  getActiveOutputDocuments,
  getOutputDocumentApprovalSelection,
  getOutputDocumentApprovalSelectionLabel,
  getOutputDocumentApproveAction,
  getOutputDocumentContextMessage,
  getOutputDocumentSubmissionSelectionLabel,
  getOutputDocumentSubmitAction,
  getOutputDocumentsHeaderDescription,
  getSingleSubmissionOperationState,
  getSingleReviewOperationState,
  getReviewableOutputDocuments,
  isBatchReviewOperation,
  isBatchSubmissionOperation,
  getSubmittableOutputDocuments,
} from "./output-document-ux";

type TestOutputDocument = {
  key: string;
  isRequired: boolean;
  isSelected: boolean;
  status: "NOT_REQUIRED" | "TO_DO" | "APPROVED";
};

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const documents: TestOutputDocument[] = [
  { key: "required", isRequired: true, isSelected: false, status: "TO_DO" },
  { key: "selected-optional", isRequired: false, isSelected: true, status: "APPROVED" },
  { key: "unselected-optional", isRequired: false, isSelected: false, status: "NOT_REQUIRED" },
];
const originalDocuments = [...documents];

const activeDocuments = getActiveOutputDocuments(documents);

assert(activeDocuments.some((document) => document.key === "required"), "Required outputs must remain active.");
assert(activeDocuments.some((document) => document.key === "selected-optional"), "Selected optional outputs must be active.");
assert(!activeDocuments.some((document) => document.key === "unselected-optional"), "Unselected optional outputs must not be active.");
assert(documents.length === originalDocuments.length && documents.every((document, index) => document === originalDocuments[index]), "Filtering must not mutate the input array.");
assert(
  activeDocuments.filter((document) => document.status === "APPROVED").length === 1 && activeDocuments.length === 2,
  "Status counters must use active outputs only."
);

const headSaMessage = (status: string, hasAssignedPic = true) => getOutputDocumentContextMessage({
  role: "HEAD_SA",
  status,
  canUpload: false,
  canReview: false,
  hasAssignedPic,
});

assert(headSaMessage("TO_DO") === "Menunggu SA yang ditugaskan mengunggah output ini.", "Head SA TO_DO copy must name the pending SA upload.");
assert(headSaMessage("DRAFT") === "Menunggu SA yang ditugaskan mengajukan output ini.", "Head SA DRAFT copy must name the pending submission.");
assert(headSaMessage("REVISION_REQUIRED") === "Menunggu SA yang ditugaskan mengunggah dan mengajukan revisi.", "Head SA revision copy must name the pending revision.");
assert(headSaMessage("APPROVED") === "Peninjauan selesai.", "Head SA approved copy must confirm review completion.");
assert(headSaMessage("TO_DO", false) === "Menunggu penetapan Solution Architect.", "Head SA copy must not imply an assigned SA when no PIC exists.");
assert(
  getOutputDocumentContextMessage({ role: "HEAD_SA", status: "IN_REVIEW", canUpload: false, canReview: true, hasAssignedPic: true }) === null,
  "Head SA review actions must not be replaced by waiting copy."
);
assert(
  getOutputDocumentContextMessage({ role: "SA", status: "IN_REVIEW", canUpload: false, canReview: false, hasAssignedPic: true }) === "Menunggu peninjauan Head SA.",
  "Assigned SA IN_REVIEW copy must identify Head SA as the reviewer."
);
assert(
  getOutputDocumentContextMessage({ role: "SA", status: "APPROVED", canUpload: false, canReview: false, hasAssignedPic: true }) === "Disetujui dan tersedia sebagai hasil proyek.",
  "Assigned SA approved copy must confirm the project deliverable."
);
assert(
  getOutputDocumentContextMessage({ role: "SALES", status: "APPROVED", canUpload: false, canReview: false, hasAssignedPic: true }) === "Hasil proyek disetujui.",
  "Sales approved copy must remain limited to the final deliverable."
);
assert(
  getOutputDocumentContextMessage({ role: "SUPER_ADMIN", status: "APPROVED", canUpload: false, canReview: false, hasAssignedPic: true }) === "Hasil proyek disetujui.",
  "Super Admin approved copy must remain limited to the final deliverable."
);
assert(
  getOutputDocumentContextMessage({ role: "SA", status: "TO_DO", canUpload: true, canReview: false, hasAssignedPic: true }) === null,
  "Available actions must not be replaced by waiting copy."
);
assert(
  getOutputDocumentContextMessage({ role: "SA", status: "DRAFT", canUpload: true, canReview: false, hasAssignedPic: true }) === "Siap diajukan untuk ditinjau Head SA.",
  "Eligible SA drafts must explain the next review action."
);
const presentationInput = { role: "HEAD_SA", status: "TO_DO", canUpload: false, canReview: false, hasAssignedPic: true };
const originalPresentationInput = { ...presentationInput };
getOutputDocumentContextMessage(presentationInput);
assert(
  Object.entries(presentationInput).every(([key, value]) => originalPresentationInput[key as keyof typeof originalPresentationInput] === value),
  "Output document presentation helpers must not mutate their input."
);
assert(
  getOutputDocumentsHeaderDescription("HEAD_SA") === "Tinjau output yang diajukan dan pantau hasil proyek yang disepakati.",
  "Head SA must receive the review-oriented output header copy."
);
assert(
  getOutputDocumentsHeaderDescription("SA") === "Unggah output proyek dan ajukan draf untuk ditinjau Head SA.",
  "SA must receive the draft-submission-oriented output header copy."
);

const eligibleDraft = { key: "draft", status: "DRAFT", currentVersionId: "version-draft" };
assert(
  getOutputDocumentSubmitAction({ status: eligibleDraft.status, currentVersionId: eligibleDraft.currentVersionId, role: "SA", canUpload: true }) === "Ajukan untuk ditinjau",
  "Eligible SA drafts must expose a direct submit action without selection mode."
);
for (const status of ["TO_DO", "IN_REVIEW", "REVISION_REQUIRED", "APPROVED"] as const) {
  assert(
    getOutputDocumentSubmitAction({ status, currentVersionId: "version-1", role: "SA", canUpload: true }) === null,
    `${status} must not expose an SA submit action.`
  );
}
for (const role of ["HEAD_SA", "SALES", "SUPER_ADMIN"] as const) {
  assert(
    getOutputDocumentSubmitAction({ status: eligibleDraft.status, currentVersionId: eligibleDraft.currentVersionId, role, canUpload: true }) === null,
    `${role} must not receive the SA submit action.`
  );
}

const batchCandidates = [
  eligibleDraft,
  { key: "missing-version", status: "DRAFT", currentVersionId: null },
  { key: "revision", status: "REVISION_REQUIRED", currentVersionId: "version-revision" },
  { key: "review", status: "IN_REVIEW", currentVersionId: "version-review" },
];
const originalBatchCandidates = [...batchCandidates];
const submittableDocuments = getSubmittableOutputDocuments(batchCandidates, true, "SA");
assert(
  submittableDocuments.length === 1 && submittableDocuments[0].key === "draft",
  "Batch selection must include only SA drafts with a current version."
);
assert(
  batchCandidates.every((document, index) => document === originalBatchCandidates[index]),
  "Batch eligibility must not mutate input documents."
);
assert(
  getOutputDocumentSubmissionSelectionLabel("Technical Proposal") === "Pilih Technical Proposal untuk diajukan",
  "Submission selection labels must include the document name."
);

const singleSubmissionA = { kind: "single", documentKey: "draft-a" } as const;
const singleAState = getSingleSubmissionOperationState(singleSubmissionA, "draft-a");
const singleBState = getSingleSubmissionOperationState(singleSubmissionA, "draft-b");
assert(singleAState.isLoading && singleAState.ariaBusy && singleAState.isDisabled, "The selected single document must be the only loading submission row.");
assert(!singleBState.isLoading && !singleBState.ariaBusy && singleBState.isDisabled, "Other draft rows must be disabled without showing a submission spinner.");
assert(isBatchSubmissionOperation({ kind: "batch" }), "A batch operation must be identified for the batch button only.");
assert(!getSingleSubmissionOperationState({ kind: "batch" }, "draft-a").isLoading, "Batch submission must not make a single document row show loading.");
const idleSubmissionState = getSingleSubmissionOperationState(null, "draft-a");
assert(!idleSubmissionState.isLoading && !idleSubmissionState.isDisabled && !idleSubmissionState.ariaBusy, "A cleared operation must restore idle single-submit presentation after success or failure.");

const validReviewVersionA = "11111111-1111-4111-8111-111111111111";
const validReviewVersionB = "22222222-2222-4222-8222-222222222222";
const reviewCandidates = [
  { key: "review-a", status: "IN_REVIEW", currentVersionId: validReviewVersionA },
  { key: "review-b", status: "IN_REVIEW", currentVersionId: validReviewVersionB },
  { key: "invalid-version", status: "IN_REVIEW", currentVersionId: "not-a-uuid" },
  { key: "draft-review", status: "DRAFT", currentVersionId: "33333333-3333-4333-8333-333333333333" },
  { key: "approved-review", status: "APPROVED", currentVersionId: "44444444-4444-4444-8444-444444444444" },
];
const originalReviewCandidates = [...reviewCandidates];
const reviewableDocuments = getReviewableOutputDocuments(reviewCandidates, true);
assert(
  getOutputDocumentApproveAction({ status: "IN_REVIEW", currentVersionId: validReviewVersionA, canReview: true }) === "Setujui",
  "A Head SA review with an IN_REVIEW document and valid version must expose single approval."
);
for (const status of ["TO_DO", "DRAFT", "REVISION_REQUIRED", "APPROVED"] as const) {
  assert(
    getOutputDocumentApproveAction({ status, currentVersionId: validReviewVersionA, canReview: true }) === null,
    `${status} must not expose approval or batch selection.`
  );
}
assert(
  getOutputDocumentApproveAction({ status: "IN_REVIEW", currentVersionId: "not-a-uuid", canReview: true }) === null,
  "IN_REVIEW documents without a valid version UUID must not be approvable."
);
assert(
  getOutputDocumentApproveAction({ status: "IN_REVIEW", currentVersionId: validReviewVersionA, canReview: false }) === null,
  "Actors without existing review eligibility must not receive approval actions."
);
assert(
  reviewableDocuments.map((document) => document.key).join(",") === "review-a,review-b",
  "Select all must be limited to eligible IN_REVIEW documents with valid versions."
);
assert(
  getOutputDocumentApprovalSelection(reviewableDocuments, false).length === 0,
  "Head SA batch mode must start with an empty selection."
);
assert(
  getOutputDocumentApprovalSelection(reviewableDocuments, true).join(",") === "review-a,review-b",
  "Select all reviews must select every eligible review and nothing else."
);
assert(
  getOutputDocumentApprovalSelectionLabel("Assessment Report") === "Pilih Assessment Report untuk disetujui",
  "Approval checkbox labels must include the document name."
);
assert(
  reviewCandidates.every((document, index) => document === originalReviewCandidates[index]),
  "Approval eligibility and selection helpers must not mutate their input."
);

const singleReviewA = { kind: "single", documentKey: "review-a" } as const;
const singleReviewAState = getSingleReviewOperationState(singleReviewA, "review-a");
const singleReviewBState = getSingleReviewOperationState(singleReviewA, "review-b");
assert(singleReviewAState.isLoading && singleReviewAState.ariaBusy && singleReviewAState.isDisabled, "Only the clicked single Approve button must show approval loading.");
assert(!singleReviewBState.isLoading && !singleReviewBState.ariaBusy && singleReviewBState.isDisabled, "Other Approve buttons may be disabled but must not show approval loading.");
assert(isBatchReviewOperation({ kind: "batch" }), "Batch approval loading must be identifiable separately from single approval.");
assert(!getSingleReviewOperationState({ kind: "batch" }, "review-a").isLoading, "Batch approval must not make a single Approve button show loading.");
const idleReviewState = getSingleReviewOperationState(null, "review-a");
assert(!idleReviewState.isLoading && !idleReviewState.isDisabled && !idleReviewState.ariaBusy, "A cleared review operation must restore idle approval presentation.");

console.log("Output document active visibility: passed");
