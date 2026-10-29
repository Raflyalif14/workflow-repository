"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, FolderKanban, PauseCircle } from "lucide-react";
import { translate as translateI18n } from "@/i18n";
import { formatDashboardDate, formatDashboardLabel, getDashboardProjectHealthLabel, type DashboardProjectHealth } from "@/lib/dashboard-ux";
import { formatRevenue } from "@/lib/dashboard-overview";

const projectStatusIcon = (status: string) => {
  if (status === "COMPLETED" || status === "WON") return CheckCircle2;
  if (status === "POSTPONED" || status === "ON_HOLD") return PauseCircle;
  if (status === "LOST" || status === "CANCELLED") return AlertTriangle;
  if (status === "ACTIVE") return FolderKanban;
  return Clock3;
};

const getProjectStatusClassName = (status: string): string => {
  if (status === "ACTIVE") return "border-primary/25 bg-primary/10 text-primary";
  if (status === "COMPLETED" || status === "WON") {
    return "border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]";
  }
  if (status === "POSTPONED" || status === "ON_HOLD" || status === "WAITING_RESULT") {
    return "border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning)/0.1)] text-[hsl(var(--warning))]";
  }
  if (status === "CANCELLED" || status === "LOST") return "border-destructive/25 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
};

export function ProjectDeliveryRow({
  project,
  role,
  hasOverdueData,
}: {
  project: DashboardProjectHealth;
  role: string;
  hasOverdueData: boolean;
}) {
  const StatusIcon = projectStatusIcon(project.status);
  const targetDate = formatDashboardDate(project.targetEndDate);
  const healthLabel = getDashboardProjectHealthLabel(project, role);
  const hasProgress = project.percentage !== null;
  const deadlineLabel = project.overdueMilestones > 0
    ? translateI18n("dashboardPage.overdueShort", { count: project.overdueMilestones })
    : targetDate
    ? translateI18n("dashboardPage.due", { date: targetDate })
    : translateI18n("common.notAvailable");
  const riskDetail = project.overdueMilestones > 0
    ? translateI18n("dashboardPage.needsAttention")
    : hasOverdueData && healthLabel !== (project.status === "ACTIVE" && project.scenarioKey === "ON_SUBMISSION_TENDER" ? translateI18n("workflowUpdate.onProgressTender") : formatDashboardLabel(project.status))
    ? healthLabel
    : null;
  const ownerLabel = project.ownerName || (project.ownerKnown ? translateI18n("ui.unassigned") : translateI18n("common.notAvailable"));
  const openProject = (
    <Link
      href={"/projects/" + project.id}
      className="inline-flex min-h-9 w-fit shrink-0 items-center justify-center gap-1 self-center justify-self-end rounded-md border border-primary/20 bg-primary/5 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {translateI18n("common.open")}
      <ChevronRight className="h-4 w-4" />
    </Link>
  );

  if (role === "SALES") {
    return (
      <div className="sales-delivery-row grid min-w-0 gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))_minmax(0,1fr)_minmax(0,0.85fr)] lg:items-start lg:gap-4 lg:px-5">
        <div className="min-w-0 space-y-1.5">
          <p className="break-words text-sm font-semibold text-foreground">{project.name}</p>
          {project.outputSelectedCount !== undefined ? (
            <p className="text-xs text-muted-foreground">{translateI18n("dashboardPage.outputApproved", { approved: project.outputApprovedCount || 0, total: project.outputSelectedCount })}</p>
          ) : hasProgress && <p className="text-xs text-muted-foreground">{translateI18n("copy.progress")}: {project.percentage}%</p>}
          <div className="flex flex-wrap items-center gap-2">
            <span className={["inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium", getProjectStatusClassName(project.status)].join(" ")}><StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{(project.status === "ACTIVE" && project.scenarioKey === "ON_SUBMISSION_TENDER" ? translateI18n("workflowUpdate.onProgressTender") : formatDashboardLabel(project.status))}</span>
            {openProject}
          </div>
        </div>
        <div className="min-w-0"><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("copy.estimatedRevenue")}</p><p className="mt-1 break-words text-sm tabular-nums text-foreground lg:mt-0">{project.estimatedRevenue === null || project.estimatedRevenue === undefined ? translateI18n("common.notAvailable") : formatRevenue(project.estimatedRevenue)}</p></div>
        <div className="min-w-0"><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("dashboardPage.finalRevenue")}</p><p className="mt-1 break-words text-sm tabular-nums text-foreground lg:mt-0">{project.finalRevenue == null ? '—' : formatRevenue(project.finalRevenue)}</p></div>
        <div className="min-w-0"><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("copy.stage")}</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.currentStage || translateI18n("common.notAvailable")}</p></div>
        <div className="min-w-0"><p className="text-xs text-muted-foreground lg:hidden">PIC</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.picName || translateI18n("ui.unassigned")}</p></div>
      </div>
    );
  }

  return (
    <div className="delivery-row">
      <div className="delivery-project min-w-0">
        <p className="break-words text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{project.name}</p>
        {(role === "SA" || role === "SUPER_ADMIN") && (
          <p className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {translateI18n("project.customer")}: {project.clientName || translateI18n("common.notAvailable")}
          </p>
        )}
      </div>
      <div className="min-w-0">
        <p className="delivery-cell-label">PIC</p>
        <p className="break-words text-sm text-foreground [overflow-wrap:anywhere]">{project.picName || translateI18n("ui.unassigned")}</p>
        {role === "SUPER_ADMIN" && <p className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{translateI18n("project.owner")}: {ownerLabel}</p>}
      </div>
      <div className="min-w-0">
        <p className="delivery-cell-label">{translateI18n("copy.currentWork")}</p>
        <p className="break-words text-sm text-foreground [overflow-wrap:anywhere]">{project.currentStage || translateI18n("common.notAvailable")}</p>
        {(role === "SA" || role === "SUPER_ADMIN") && (
          <p className={["mt-1 break-words text-xs", project.overdueMilestones > 0 ? "text-destructive" : "text-muted-foreground"].join(" ")}>
            {translateI18n("copy.deadline")}: {deadlineLabel}
          </p>
        )}
        {role === "SUPER_ADMIN" && riskDetail && <p className="mt-0.5 text-xs text-muted-foreground">{riskDetail}</p>}
      </div>
      <div className="min-w-0">
        <p className="delivery-cell-label">{translateI18n("common.status")}</p>
        <span className={["inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium", getProjectStatusClassName(project.status)].join(" ")}>
          <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="break-words">{(project.status === "ACTIVE" && project.scenarioKey === "ON_SUBMISSION_TENDER" ? translateI18n("workflowUpdate.onProgressTender") : formatDashboardLabel(project.status))}</span>
        </span>
      </div>
      <div className="delivery-progress min-w-0">
        <p className="delivery-cell-label">{translateI18n("copy.progress")}</p>
        <p className="text-xs font-medium tabular-nums text-foreground">{hasProgress ? String(project.percentage) + "%" : translateI18n("dashboardPage.unknown")}</p>
        <div className="mt-1.5 h-1.5 rounded-full bg-muted">
          {hasProgress && <div className="h-full rounded-full bg-primary" style={{ width: String(Math.min(100, Math.max(0, project.percentage || 0))) + "%" }} />}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{project.totalMilestones > 0
          ? translateI18n("dashboardPage.stages", { done: project.completedMilestones, total: project.totalMilestones })
          : translateI18n("dashboardPage.stageUnavailable")}</p>
      </div>
      {openProject}
    </div>
  );
}
