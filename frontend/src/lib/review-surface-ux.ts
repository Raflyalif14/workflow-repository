import { getIntlLocale, translate, type TranslationKey } from "@/i18n";
export type ReviewSurfaceType = "PROJECT_PLAN" | "DEADLINE";
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

const copyPrefixes: Record<ReviewSurfaceType, Record<ReviewDecision, string>> = {
  PROJECT_PLAN: { APPROVE: "approvePlan", REJECT: "rejectPlan" },
  DEADLINE: { APPROVE: "approveDeadline", REJECT: "rejectDeadline" },
};

export function getReviewActionCopy(
  type: ReviewSurfaceType,
  decision: ReviewDecision
): ReviewActionCopy {
  const prefix = copyPrefixes[type][decision];
  const copy = (suffix: string) => translate(`reviewCopy.${prefix}${suffix}` as TranslationKey);
  return {
    title: copy("Title"),
    selectionLabel: copy("Selection"),
    submitLabel: copy("Submit"),
    pendingLabel: copy("Pending"),
    noteLabel: copy("Note"),
    notePlaceholder: copy("Placeholder"),
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
  if (!parsed) return translate("reviewCopy.unavailable");

  return parsed.toLocaleDateString(getIntlLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? "UTC" : undefined,
  });
}

export function formatReviewDateTime(value?: string | null): string {
  const parsed = parseReviewDate(value);
  if (!parsed) return translate("reviewCopy.unavailable");

  return parsed.toLocaleString(getIntlLocale(), {
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
  if (!status) return translate("reviewCopy.statusUnavailable");
  if (status === "PENDING" || status === "PENDING_REVIEW") {
    return translate("reviewCopy.waitingReview");
  }
  if (status === "APPROVED") return translate("approvalStatus.APPROVED");
  if (status === "REJECTED" && revisionContext) return translate("reviewCopy.revisionRequested");

  const normalized = status
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : translate("reviewCopy.statusUnavailable");
}

export function formatReviewParticipant(value?: string | null): string {
  return value?.trim() || translate("reviewCopy.unavailable");
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
