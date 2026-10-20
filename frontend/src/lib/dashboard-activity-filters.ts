import type { DashboardActivityFilters, DashboardActivityKind } from "@/types/dashboard";
import type { TranslationKey } from "@/i18n";

export type ActivityFilterDraft = {
  projectId: string;
  kind: DashboardActivityKind | "";
  period: "all" | "today" | "last7" | "custom";
  from: string;
  to: string;
};
export const EMPTY_ACTIVITY_FILTERS: ActivityFilterDraft = { projectId: "", kind: "", period: "all", from: "", to: "" };
export const ACTIVITY_KIND_LABELS: Record<DashboardActivityKind, TranslationKey> = {
  PROJECT: "activityFilters.projectChanges", MILESTONE: "activityFilters.milestones",
  DOCUMENT: "activityFilters.documents", APPROVAL: "activityFilters.approvals", ASSIGNMENT: "activityFilters.assignments",
};

function localDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1000 || year > 9999) return;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

// Dates are calendar days in the user's browser, including the entire final day.
export function buildActivityFilters(draft: ActivityFilterDraft, now = new Date()): { filters: DashboardActivityFilters; error?: undefined } | { error: TranslationKey; filters?: undefined } {
  const filters: DashboardActivityFilters = {};
  if (draft.projectId) filters.projectId = draft.projectId;
  if (draft.kind) filters.kind = draft.kind;
  if (draft.period !== "all") {
    let from: Date | undefined, to: Date | undefined;
    if (draft.period === "custom") {
      from = localDate(draft.from); to = localDate(draft.to);
      if (!from || !to) return { error: "activityFilters.invalidDates" };
      if (from > to) return { error: "activityFilters.invalidRange" };
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      to = new Date(from);
      if (draft.period === "last7") from.setDate(from.getDate() - 6);
    }
    to.setDate(to.getDate() + 1);
    filters.from = from.toISOString(); filters.to = to.toISOString();
  }
  return { filters };
}
