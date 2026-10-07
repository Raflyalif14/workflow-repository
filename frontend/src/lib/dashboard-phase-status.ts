import type { DashboardData } from "@/types/dashboard";
import { translateProjectStatus } from "@/i18n";

export type WorkStatusPhase = "ALL" | "PRA_TENDER" | "ON_SUBMISSION_TENDER";
export const DEFAULT_WORK_STATUS_FILTER: WorkStatusPhase = "ALL";
export type PhaseWorkStatus = NonNullable<DashboardData["phaseWorkStatus"]>;
export type AllWorkStatus = NonNullable<DashboardData["allWorkStatus"]>;
const validCount = (count: unknown): count is number => typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
const allCategories = ["planning", "active", "postponed", "completed", "won", "lost", "waitingResult", "cancelled"] as const;

export function isPhaseWorkStatus(value: unknown): value is PhaseWorkStatus {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<PhaseWorkStatus>;
  return [summary.PRA_TENDER?.active, summary.PRA_TENDER?.postponed,
    summary.ON_SUBMISSION_TENDER?.won, summary.ON_SUBMISSION_TENDER?.lost].every(validCount)
    && validCount(Number(summary.PRA_TENDER?.active) + Number(summary.PRA_TENDER?.postponed))
    && validCount(Number(summary.ON_SUBMISSION_TENDER?.won) + Number(summary.ON_SUBMISSION_TENDER?.lost));
}

export function isAllWorkStatus(value: unknown): value is AllWorkStatus {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<AllWorkStatus>;
  return validCount(summary.total) && allCategories.every(key => validCount(summary[key]))
    && allCategories.reduce((sum, key) => sum + (summary[key] as number), 0) === summary.total;
}

const statusColors = { DRAFT: "#64748b", ACTIVE: "#3b82f6", POSTPONED: "#f59e0b", COMPLETED: "#22c55e",
  WON: "#22c55e", LOST: "#ef4444", WAITING_RESULT: "#f59e0b", CANCELLED: "#ef4444" } as const;
type Row = { status: keyof typeof statusColors; count: number };
function distribution(rows: Row[], total = rows.reduce((sum, row) => sum + row.count, 0)) {
  return { total, rows: rows.map(row => ({ ...row, color: statusColors[row.status], name: translateProjectStatus(row.status),
    percentage: total ? row.count / total * 100 : 0 })) };
}

export function getPhaseStatusDistribution(summary: PhaseWorkStatus, phase: Exclude<WorkStatusPhase, "ALL">) {
  return distribution(phase === "PRA_TENDER"
    ? [{ status: "ACTIVE", count: summary.PRA_TENDER.active }, { status: "POSTPONED", count: summary.PRA_TENDER.postponed }]
    : [{ status: "WON", count: summary.ON_SUBMISSION_TENDER.won }, { status: "LOST", count: summary.ON_SUBMISSION_TENDER.lost }]);
}

// Validate only the selected source. Bad phase metadata cannot invalidate All,
// and an old backend's missing All aggregate cannot hide its valid phase counts.
export function getWorkStatusDistribution(allSummary: unknown, phaseSummary: unknown, filter: WorkStatusPhase) {
  if (filter !== "ALL") return isPhaseWorkStatus(phaseSummary) ? getPhaseStatusDistribution(phaseSummary, filter) : null;
  if (!isAllWorkStatus(allSummary)) return null;
  const rows: Row[] = [{ status: "DRAFT", count: allSummary.planning }, { status: "ACTIVE", count: allSummary.active },
    { status: "POSTPONED", count: allSummary.postponed }, { status: "COMPLETED", count: allSummary.completed },
    { status: "WON", count: allSummary.won }, { status: "LOST", count: allSummary.lost }];
  if (allSummary.waitingResult) rows.push({ status: "WAITING_RESULT", count: allSummary.waitingResult });
  if (allSummary.cancelled) rows.push({ status: "CANCELLED", count: allSummary.cancelled });
  return distribution(rows, allSummary.total);
}
