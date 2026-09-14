import assert from "node:assert/strict";
import {
  formatReviewDate,
  formatReviewDateTime,
  formatReviewParticipant,
  formatReviewStatus,
  getDeadlineChangeDays,
  getReviewActionCopy,
  isProjectPlanPicRequired,
} from "./review-surface-ux";

assert.equal(
  getReviewActionCopy("PROJECT_PLAN", "APPROVE").submitLabel,
  "Approve & activate"
);
assert.equal(
  getReviewActionCopy("PROJECT_PLAN", "REJECT").submitLabel,
  "Reject plan"
);
assert.equal(
  getReviewActionCopy("SUBMISSION", "APPROVE").submitLabel,
  "Approve submission"
);
assert.equal(
  getReviewActionCopy("SUBMISSION", "REJECT").submitLabel,
  "Request revision"
);
assert.equal(
  getReviewActionCopy("DEADLINE", "APPROVE").submitLabel,
  "Approve deadline"
);
assert.equal(
  getReviewActionCopy("DEADLINE", "REJECT").submitLabel,
  "Reject request"
);

assert.equal(getReviewActionCopy("SUBMISSION", "APPROVE").noteRequired, false);
assert.equal(getReviewActionCopy("SUBMISSION", "REJECT").noteRequired, true);
assert.equal(getReviewActionCopy("DEADLINE", "APPROVE").pendingLabel, "Approving...");
assert.equal(
  getReviewActionCopy("DEADLINE", "REJECT").pendingLabel,
  "Rejecting request..."
);
assert.equal(formatReviewParticipant(undefined), "Unavailable");
assert.equal(formatReviewParticipant(""), "Unavailable");
assert.equal(formatReviewParticipant("  Senja  "), "Senja");
assert.equal(formatReviewDate(undefined), "Unavailable");
assert.equal(formatReviewDate("not-a-date"), "Unavailable");
assert.equal(formatReviewDateTime(null), "Unavailable");
assert.equal(formatReviewDateTime("not-a-date"), "Unavailable");
assert.notEqual(formatReviewDate("2026-09-15"), "Unavailable");
assert.notEqual(formatReviewDateTime("2026-09-15T08:30:00Z"), "Unavailable");
assert(!formatReviewDate("not-a-date").includes("NaN"));
assert.equal(getDeadlineChangeDays("2026-09-10", "2026-09-15"), 5);
assert.equal(getDeadlineChangeDays("2026-09-15", "2026-09-10"), -5);
assert.equal(getDeadlineChangeDays("invalid", "2026-09-15"), null);
assert.equal(getDeadlineChangeDays("2026-02-30", "2026-09-15"), null);
assert.equal(getDeadlineChangeDays(undefined, "2026-09-15"), null);

assert.equal(formatReviewStatus("PENDING_REVIEW"), "Waiting for review");
assert.equal(formatReviewStatus("REJECTED", true), "Revision requested");
assert.equal(formatReviewStatus("UNKNOWN_REVIEW_STATE"), "Unknown review state");
assert(!formatReviewStatus("UNKNOWN_REVIEW_STATE").includes("_"));

assert.equal(
  isProjectPlanPicRequired("APPROVE", "OPERATIONAL_V2", 2),
  true
);
assert.equal(
  isProjectPlanPicRequired("REJECT", "OPERATIONAL_V2", 2),
  false
);
assert.equal(isProjectPlanPicRequired("APPROVE", "LEGACY", 1), false);

console.log("Review surface UX tests passed.");
