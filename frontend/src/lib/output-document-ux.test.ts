import {
  getActiveOutputDocuments,
  getOutputDocumentContextMessage,
  getOutputDocumentsHeaderDescription,
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

console.log("Output document active visibility: passed");
