import assert from "node:assert/strict";
import {
  formatDocumentDateTime,
  formatDocumentFileSize,
  formatDocumentParticipant,
  formatDocumentStatus,
  getDocumentContextLabel,
  getDocumentPrimaryActionLabel,
  getEmptyDiscussionLabel,
  getLatestVersionLabel,
  getVersionLabel,
} from "./document-surface-ux";

assert.equal(getVersionLabel(3), "Version 3");
assert.equal(getLatestVersionLabel(true), "Latest");
assert.equal(getLatestVersionLabel(false), null);

assert.equal(formatDocumentParticipant(undefined), "Not available");
assert.equal(formatDocumentDateTime("invalid"), "Not available");
assert.equal(formatDocumentFileSize(undefined), "Size not available");
assert.equal(formatDocumentFileSize(Number.NaN), "Size not available");

assert.equal(formatDocumentStatus("PENDING_INTERNAL_REVIEW"), "Pending Internal Review");
assert(!formatDocumentStatus("PENDING_INTERNAL_REVIEW").includes("_"));

assert.equal(getDocumentPrimaryActionLabel(true), "Upload new version");
assert.equal(getDocumentPrimaryActionLabel(false), "Download latest");
assert.equal(
  getDocumentContextLabel("OFFICIAL_DOCUMENT", "milestone-1"),
  "Milestone deliverable"
);
assert.equal(
  getDocumentContextLabel("PROJECT_INTAKE", null),
  "Project Intake evidence"
);
assert.notEqual(
  getDocumentContextLabel("PROJECT_INTAKE", null),
  "Official document"
);
assert.equal(getEmptyDiscussionLabel(), "No discussion yet.");

console.log("Document surface UX tests passed.");
