import {
  getActiveOutputDocuments,
  getOutputDocumentContextMessage,
  getOutputDocumentSubmissionSelectionLabel,
  getOutputDocumentSubmitAction,
  getOutputDocumentsHeaderDescription,
  getSingleSubmissionOperationState,
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

assert(headSaMessage("TO_DO") === "Waiting for the assigned SA to upload this output.", "Head SA TO_DO copy must name the pending SA upload.");
assert(headSaMessage("DRAFT") === "Waiting for the assigned SA to submit this output for review.", "Head SA DRAFT copy must name the pending submission.");
assert(headSaMessage("REVISION_REQUIRED") === "Waiting for the assigned SA to upload and submit a revision.", "Head SA revision copy must name the pending revision.");
assert(headSaMessage("APPROVED") === "Review completed.", "Head SA approved copy must confirm review completion.");
assert(headSaMessage("TO_DO", false) === "Waiting for a Solution Architect assignment.", "Head SA copy must not imply an assigned SA when no PIC exists.");
assert(
  getOutputDocumentContextMessage({ role: "HEAD_SA", status: "IN_REVIEW", canUpload: false, canReview: true, hasAssignedPic: true }) === null,
  "Head SA review actions must not be replaced by waiting copy."
);
assert(
  getOutputDocumentContextMessage({ role: "SA", status: "IN_REVIEW", canUpload: false, canReview: false, hasAssignedPic: true }) === "Waiting for Head SA review.",
  "Assigned SA IN_REVIEW copy must identify Head SA as the reviewer."
);
assert(
  getOutputDocumentContextMessage({ role: "SA", status: "APPROVED", canUpload: false, canReview: false, hasAssignedPic: true }) === "Approved and available as a project deliverable.",
  "Assigned SA approved copy must confirm the project deliverable."
);
assert(
  getOutputDocumentContextMessage({ role: "SALES", status: "APPROVED", canUpload: false, canReview: false, hasAssignedPic: true }) === "Approved deliverable.",
  "Sales approved copy must remain limited to the final deliverable."
);
assert(
  getOutputDocumentContextMessage({ role: "SUPER_ADMIN", status: "APPROVED", canUpload: false, canReview: false, hasAssignedPic: true }) === "Approved deliverable.",
  "Super Admin approved copy must remain limited to the final deliverable."
);
assert(
  getOutputDocumentContextMessage({ role: "SA", status: "TO_DO", canUpload: true, canReview: false, hasAssignedPic: true }) === null,
  "Available actions must not be replaced by waiting copy."
);
assert(
  getOutputDocumentContextMessage({ role: "SA", status: "DRAFT", canUpload: true, canReview: false, hasAssignedPic: true }) === "Ready to submit for Head SA review.",
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
  getOutputDocumentsHeaderDescription("HEAD_SA") === "Review submitted outputs and monitor agreed project deliverables.",
  "Head SA must receive the review-oriented output header copy."
);
assert(
  getOutputDocumentsHeaderDescription("SA") === "Upload project outputs and submit drafts for Head SA review.",
  "SA must receive the draft-submission-oriented output header copy."
);

const eligibleDraft = { key: "draft", status: "DRAFT", currentVersionId: "version-draft" };
assert(
  getOutputDocumentSubmitAction({ status: eligibleDraft.status, currentVersionId: eligibleDraft.currentVersionId, role: "SA", canUpload: true }) === "Submit for review",
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
  getOutputDocumentSubmissionSelectionLabel("Technical Proposal") === "Select Technical Proposal for submission",
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

console.log("Output document active visibility: passed");
