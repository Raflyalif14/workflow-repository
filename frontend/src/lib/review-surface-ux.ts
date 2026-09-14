export type ReviewSurfaceType = "PROJECT_PLAN" | "SUBMISSION" | "DEADLINE";
export type ReviewDecision = "APPROVE" | "REJECT";

export type ReviewActionCopy = {
  title: string;
  selectionLabel: string;
  submitLabel: string;
  pendingLabel: string;
  noteLabel: string;
  notePlaceholder: string;
  noteRequired: boolean;
};

const copyByType: Record<
  ReviewSurfaceType,
  Record<ReviewDecision, Omit<ReviewActionCopy, "noteRequired">>
> = {
  PROJECT_PLAN: {
    APPROVE: {
      title: "Approve project plan",
      selectionLabel: "Approve plan",
      submitLabel: "Approve & activate",
      pendingLabel: "Approving & activating...",
      noteLabel: "Approval remarks (optional)",
      notePlaceholder: "Add optional sign-off remarks...",
    },
    REJECT: {
      title: "Reject project plan",
      selectionLabel: "Reject plan",
      submitLabel: "Reject plan",
      pendingLabel: "Rejecting plan...",
      noteLabel: "Rejection reason / timeline feedback",
      notePlaceholder:
        "Specify timeline issues or required changes before the plan can be approved...",
    },
  },
  SUBMISSION: {
    APPROVE: {
      title: "Review work submission",
      selectionLabel: "Approve submission",
      submitLabel: "Approve submission",
      pendingLabel: "Approving...",
      noteLabel: "Review note (optional)",
      notePlaceholder: "Add optional review remarks...",
    },
    REJECT: {
      title: "Review work submission",
      selectionLabel: "Request revision",
      submitLabel: "Request revision",
      pendingLabel: "Requesting revision...",
      noteLabel: "Revision guidance",
      notePlaceholder:
        "Explain what needs to change before this work can be approved...",
    },
  },
  DEADLINE: {
    APPROVE: {
      title: "Approve deadline change",
      selectionLabel: "Approve deadline",
      submitLabel: "Approve deadline",
      pendingLabel: "Approving...",
      noteLabel: "Review note (optional)",
      notePlaceholder: "Add optional approval remarks...",
    },
    REJECT: {
      title: "Reject deadline change",
      selectionLabel: "Reject request",
      submitLabel: "Reject request",
      pendingLabel: "Rejecting request...",
      noteLabel: "Rejection reason",
      notePlaceholder:
        "Explain why this deadline change cannot be approved...",
    },
  },
};

export function getReviewActionCopy(
  type: ReviewSurfaceType,
  decision: ReviewDecision
): ReviewActionCopy {
  return {
    ...copyByType[type][decision],
    noteRequired: decision === "REJECT",
  };
}

function parseDateOnly(value?: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function parseReviewDate(value?: string | null): Date | null {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const timestamp = parseDateOnly(value);
    return timestamp === null ? null : new Date(timestamp);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatReviewDate(value?: string | null): string {
  const parsed = parseReviewDate(value);
  if (!parsed) return "Unavailable";

  return parsed.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? "UTC" : undefined,
  });
}

export function formatReviewDateTime(value?: string | null): string {
  const parsed = parseReviewDate(value);
  if (!parsed) return "Unavailable";

  return parsed.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function getDeadlineChangeDays(
  currentDueDate?: string | null,
  requestedDueDate?: string | null
): number | null {
  const current = parseDateOnly(currentDueDate);
  const requested = parseDateOnly(requestedDueDate);
  if (current === null || requested === null) return null;
  return Math.round((requested - current) / 86_400_000);
}

export function formatReviewStatus(
  status?: string | null,
  revisionContext = false
): string {
  if (!status) return "Status unavailable";
  if (status === "PENDING" || status === "PENDING_REVIEW") {
    return "Waiting for review";
  }
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED" && revisionContext) return "Revision requested";

  const normalized = status
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "Status unavailable";
}

export function formatReviewParticipant(value?: string | null): string {
  return value?.trim() || "Unavailable";
}

export function isProjectPlanPicRequired(
  decision: ReviewDecision,
  workflowModel?: string | null,
  workflowVersion?: number | null
): boolean {
  return (
    decision === "APPROVE" &&
    workflowModel === "OPERATIONAL_V2" &&
    workflowVersion === 2
  );
}
