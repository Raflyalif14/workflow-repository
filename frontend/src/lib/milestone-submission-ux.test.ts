import assert from "node:assert/strict";
import {
  getMilestoneSubmissionPresentation,
} from "./milestone-submission-ux";
import type { MilestoneSubmissionRevision } from "@/types/project";

const retainedAttachment = {
  id: "attachment-1",
  fileName: "rejected-evidence.pdf",
  fileSize: 1024,
  mimeType: "application/pdf",
  status: "REJECTED" as const,
  promotedDocumentId: null,
};

const rejectedRevision: MilestoneSubmissionRevision = {
  id: "package-1",
  revision: 1,
  status: "REJECTED",
  submission: {
    approvalId: "approval-1",
    note: "Initial work",
    submittedAt: "2026-09-01T08:00:00.000Z",
    submittedBy: { id: "sa-1", fullName: "Solution Architect" },
  },
  review: {
    note: "Clarify the findings.",
    reviewedAt: null,
    reviewedBy: null,
  },
  attachments: [retainedAttachment],
};

const submit = getMilestoneSubmissionPresentation("IN_PROGRESS");
assert.equal(submit.mode, "SUBMIT");
assert.equal(submit.primaryLabel, "Submit work");

const revisionRequired = getMilestoneSubmissionPresentation(
  "REVISION_REQUIRED",
  [rejectedRevision]
);
assert.equal(revisionRequired.mode, "REVISION");
assert.equal(revisionRequired.primaryLabel, "Submit revision");
assert.deepEqual(
  revisionRequired.retainedAttachments,
  [retainedAttachment],
  "Retained rejected evidence must remain separate from newly selected files."
);

const activeRevision = getMilestoneSubmissionPresentation(
  "IN_PROGRESS",
  [rejectedRevision]
);
assert.equal(activeRevision.mode, "REVISION");
assert.equal(activeRevision.pendingLabel, "Submitting revision...");

const pendingReview = getMilestoneSubmissionPresentation("PENDING_REVIEW");
assert.equal(pendingReview.mode, "WAITING");
assert.equal(pendingReview.primaryLabel, null);

assert.doesNotThrow(() =>
  getMilestoneSubmissionPresentation("REJECTED", [rejectedRevision])
);

const unknown = getMilestoneSubmissionPresentation("UNKNOWN_INTERNAL_STATE");
assert.equal(unknown.mode, "READ_ONLY");
assert.equal(unknown.stateLabel, "Unknown internal state");
assert(!unknown.stateLabel.includes("_"));

console.log("Milestone submission UX tests passed.");
