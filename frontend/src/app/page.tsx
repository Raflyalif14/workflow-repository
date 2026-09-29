"use client";

import { translate as translateI18n, getIntlLocale, type TranslationKey } from "@/i18n";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FolderKanban,
  PauseCircle,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useAuth } from "@/components/auth/auth-provider";
import { useApprovals, useApprovalStats } from "@/hooks/use-approvals";
import { useDashboard } from "@/hooks/use-dashboard";
import { AssignedMilestone, useMyAssignedMilestones, useProjects } from "@/hooks/use-projects";
import {
  buildDashboardDistribution,
  DashboardProjectHealth,
  DashboardWorkItem,
  formatDashboardActivityLabel,
  formatDashboardDate,
  formatDashboardDeadline,
  formatDashboardLabel,
  formatDashboardTimestamp,
  getApprovalProjectHref,
  getDashboardGreeting,
  getDashboardGreetingSubject,
  getDashboardInsights,
  getDashboardKpiLabels,
  getDashboardProjectHealthLabel,
  getDashboardRoleContent,
  getHeadSaOutputReviewItems,
  getDashboardSnapshotTitle,
  getSaDashboardItems,
  getSaDashboardMetrics,
  getSaOutputRevisionItems,
  getSalesDashboardItems,
  sortDashboardItems,
  sortDashboardProjectHealth,
  sortSaWorkload,
  shouldShowSaWorkload,
  shouldShowDashboardInsights,
} from "@/lib/dashboard-ux";
import { formatActorRoleLabel } from "@/lib/workflow-ux-helpers";
import { ApprovalItem } from "@/types/approval";
import { DashboardSaWorkload, DashboardSummary, ProjectProgress, RecentActivity } from "@/types/dashboard";
import { Project } from "@/types/project";

type SummaryMetric = {
  label: string;
  value: number;
};

const formatRevenue = (value: number): string =>
  new Intl.NumberFormat(getIntlLocale(), {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

const getApprovalPresentation = (item: ApprovalItem) => {
  switch (item.category) {
    case "PROJECT_PLAN":
      return {
        label: translateI18n("dashboardPage.planReview"),
        actionLabel: translateI18n("dashboardPage.reviewPlan"),
        priority: 20,
        description: translateI18n("dashboardPage.planDecision"),
      };
    default:
      return {
        label: translateI18n("dashboardPage.deadlineReview"),
        actionLabel: translateI18n("dashboardPage.reviewDeadline"),
        priority: 35,
        description: translateI18n("dashboardPage.deadlineDecision"),
      };
  }
};

const getHeadSaItems = (approvals: ApprovalItem[], projects: Project[]): DashboardWorkItem[] => {
  const items: DashboardWorkItem[] = approvals.map((approval) => {
    const presentation = getApprovalPresentation(approval);
    const milestoneSuffix = approval.milestoneName ? ` - ${approval.milestoneName}` : "";
    const requestedAt = formatDashboardDate(approval.requestedAt || approval.submittedAt);
    const meta = [approval.submittedBy ? translateI18n("dashboardPage.requestedBy", { name: approval.submittedBy }) : undefined, requestedAt].filter(Boolean).join(" - ");

    return {
      id: `approval-${approval.id}`,
      priority: presentation.priority,
      group: "action",
      label: presentation.label,
      title: `${approval.projectName}${milestoneSuffix}`,
      description: presentation.description,
      meta: meta || undefined,
      state: "Pending review",
      href: getApprovalProjectHref(approval.projectId, approval.category, approval.milestoneId),
      actionLabel: presentation.actionLabel,
    };
  });

  for (const project of projects) {
    if (project.status === "DRAFT" && project.currentRole === "SALES") {
      items.push({
        id: `head-sa-waiting-${project.id}`,
        priority: 40,
        group: "waiting",
        label: translateI18n("dashboardPage.planPreparing"),
        title: project.name,
        description: translateI18n("dashboardPage.salesPreparing"),
        meta: project.customer ? translateI18n("dashboardWork.customer", { name: project.customer }) : undefined,
        state: "Planning",
        href: `/projects/${project.id}`,
      });
      continue;
    }

    if (project.status !== "ACTIVE" || project.pic || project.currentRole !== "HEAD_SA") continue;

    items.push({
      id: `assign-pic-${project.id}`,
      priority: 36,
      group: "action",
      label: translateI18n("dashboardPage.picAssignment"),
      title: project.name,
      description: translateI18n("dashboardPage.picReady"),
      meta: project.customer ? translateI18n("dashboardWork.customer", { name: project.customer }) : undefined,
      state: translateI18n("dashboardPage.needsAssignment"),
      href: `/projects/${project.id}#project-pic-assignment`,
      actionLabel: translateI18n("dashboardPage.assignPic"),
    });
  }

  return items;
};

const getSuperAdminItems = (summary: DashboardSummary, projectProgress: ProjectProgress[]): DashboardWorkItem[] => {
  const items: DashboardWorkItem[] = [];

  for (const project of projectProgress.filter((item) => item.overdueMilestones > 0)) {
    items.push({
      id: `overdue-${project.id}`,
      priority: 10,
      group: "action",
      label: translateI18n("dashboardPage.deliveryException"),
      title: project.name,
      description: project.overdueMilestones === 1 ? translateI18n("dashboardPage.overdueOne") : translateI18n("dashboardPage.overdueCount", { count: project.overdueMilestones }),
      meta: project.clientName ? translateI18n("dashboardWork.customer", { name: project.clientName }) : undefined,
      state: translateI18n("dashboardPage.needsAttention"),
      href: `/projects/${project.id}`,
      actionLabel: translateI18n("dashboardPage.reviewProject"),
    });
  }

  if (summary.waitingApproval > 0) {
    items.push({
      id: "approval-pipeline",
      priority: 20,
      group: "action",
      label: translateI18n("dashboardPage.approvalPipeline"),
      title: summary.waitingApproval === 1 ? translateI18n("dashboardPage.oneReview") : translateI18n("dashboardPage.itemsReview", { count: summary.waitingApproval }),
      description: translateI18n("dashboardPage.approvalHelp"),
      state: "Pending review",
      href: "/approvals",
      actionLabel: translateI18n("dashboardPage.openApprovals"),
    });
  }

  return items;
};

const getRoleSummary = ({
  role,
  projects,
  approvals,
  milestones,
  summary,
  outputReviewCount,
}: {
  role: string;
  projects: Project[];
  approvals: ApprovalItem[];
  milestones: AssignedMilestone[];
  summary: DashboardSummary;
  outputReviewCount?: number;
}): SummaryMetric[] => {
  if (role === "SALES") {
    return [
      { label: "Total estimated revenue", value: projects.reduce((total, project) => total + (project.estimated_revenue || 0), 0) },
      { label: "Waiting result", value: projects.filter((project) => project.status === "WAITING_RESULT").length },
      { label: "Won", value: projects.filter((project) => project.status === "WON").length },
      { label: "Lost", value: projects.filter((project) => project.status === "LOST").length },
    ];
  }

  if (role === "HEAD_SA") {
    const assignedArchitectIds = new Set(
      projects.filter((project) => project.status === "ACTIVE" && project.pic?.id).map((project) => project.pic!.id)
    );
    return [
      { label: "Assigned architects", value: assignedArchitectIds.size },
      { label: "Active delivery", value: projects.filter((project) => project.status === "ACTIVE").length },
      { label: "Outputs awaiting review", value: outputReviewCount || 0 },
      { label: "Unassigned projects", value: projects.filter((project) => project.status === "ACTIVE" && !project.pic && project.currentRole === "HEAD_SA").length },
    ];
  }

  if (role === "SA") {
    const metrics = getSaDashboardMetrics(milestones);
    return [
      { label: "In progress", value: metrics.inProgress },
      { label: "Needs revision", value: metrics.needsRevision },
      { label: "Upcoming deadlines", value: metrics.upcomingDeadlines },
      { label: "Overdue", value: metrics.overdue },
    ];
  }

  return [
    { label: "Active projects", value: summary.activeProjects },
    { label: "Overdue milestones", value: summary.overdueMilestones },
    { label: "Pending reviews", value: summary.waitingApproval },
    { label: "Completed projects", value: summary.completedProjects },
  ];
};

const getViewAllHref = (role: string): string => {
  if (role === "HEAD_SA") return "/approvals";
  if (role === "SA") return "/milestones";
  return "/projects";
};

type MetricVisual = {
  description: string;
  icon: typeof ClipboardCheck;
  iconClassName: string;
};

const metricLabels: Record<string, TranslationKey> = {
  "Assigned architects": "dashboardMetric.assignedArchitects",
  "Active delivery": "dashboardMetric.activeDelivery",
  "Outputs awaiting review": "dashboardMetric.workSubmissions",
  "Unassigned projects": "dashboardMetric.unassignedProjects",
  "Total estimated revenue": "dashboardMetric.estimatedRevenue",
  "Waiting result": "dashboardMetric.waitingResult",
  Won: "dashboardMetric.won",
  Lost: "dashboardMetric.lost",
  "In progress": "dashboardMetric.inProgress",
  "Needs revision": "dashboardMetric.needsRevision",
  "Upcoming deadlines": "dashboardMetric.upcomingDeadlines",
  Overdue: "dashboardMetric.overdue",
  "Active projects": "dashboardMetric.activeProjects",
  "Overdue milestones": "dashboardMetric.overdueMilestones",
  "Pending reviews": "dashboardMetric.pendingReviews",
  "Completed projects": "dashboardMetric.completedProjects",
};

const getMetricVisual = (label: string): MetricVisual => {
  const descriptions: Record<string, string> = {
    "Plans to review": translateI18n("dashboardMetricDescription.plansToReview"),
    "Outputs awaiting review": translateI18n("dashboardMetricDescription.workSubmissions"),
    "Deadline requests": translateI18n("dashboardMetricDescription.deadlineRequests"),
    "Unassigned projects": translateI18n("dashboardMetricDescription.unassignedProjects"),
    Planning: translateI18n("dashboardMetricDescription.planning"),
    "Waiting for review": translateI18n("dashboardMetricDescription.waitingForReview"),
    "Active projects": translateI18n("dashboardMetricDescription.activeProjects"),
    Postponed: translateI18n("dashboardMetricDescription.postponed"),
    "In progress": translateI18n("dashboardMetricDescription.inProgress"),
    "Needs revision": translateI18n("dashboardMetricDescription.needsRevision"),
    Completed: translateI18n("dashboardMetricDescription.completed"),
    "Overdue milestones": translateI18n("dashboardMetricDescription.overdueMilestones"),
    "Pending reviews": translateI18n("dashboardMetricDescription.pendingReviews"),
    "Completed projects": translateI18n("dashboardMetricDescription.completedProjects"),
    "Total estimated revenue": translateI18n("dashboardMetricDescription.estimatedRevenue"),
    "Waiting result": translateI18n("dashboardMetricDescription.waitingResult"),
    Won: translateI18n("dashboardMetricDescription.won"),
    Lost: translateI18n("dashboardMetricDescription.lost"),
    "Assigned architects": translateI18n("dashboardMetricDescription.assignedArchitects"),
    "Active delivery": translateI18n("dashboardMetricDescription.activeDelivery"),
    "Upcoming deadlines": translateI18n("dashboardMetricDescription.upcomingDeadlines"),
    Overdue: translateI18n("dashboardMetricDescription.overdue"),
  };

  if (/overdue|revision/i.test(label)) {
    return {
      description: descriptions[label] || translateI18n("dashboardMetricDescription.attention"),
      icon: RotateCcw,
      iconClassName: "bg-destructive/10 text-destructive",
    };
  }
  if (/unassigned/i.test(label)) {
    return {
      description: descriptions[label] || translateI18n("dashboardMetricDescription.assignment"),
      icon: UserRound,
      iconClassName: "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]",
    };
  }
  if (/postponed/i.test(label)) {
    return {
      description: descriptions[label] || translateI18n("dashboardMetricDescription.paused"),
      icon: PauseCircle,
      iconClassName: "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]",
    };
  }
  if (/deadline|waiting/i.test(label)) {
    return {
      description: descriptions[label] || translateI18n("dashboardMetricDescription.waiting"),
      icon: CalendarClock,
      iconClassName: "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]",
    };
  }
  if (/completed/i.test(label)) {
    return {
      description: descriptions[label] || translateI18n("dashboardMetricDescription.completedItems"),
      icon: CheckCircle2,
      iconClassName: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
    };
  }
  if (/active|progress/i.test(label)) {
    return {
      description: descriptions[label] || translateI18n("dashboardMetricDescription.underway"),
      icon: FolderKanban,
      iconClassName: "bg-primary/10 text-primary",
    };
  }
  return {
    description: descriptions[label] || translateI18n("dashboardMetricDescription.available"),
    icon: ClipboardCheck,
    iconClassName: "bg-primary/10 text-primary",
  };
};

function MetricCard({ metric }: { metric: SummaryMetric }) {
  const visual = getMetricVisual(metric.label);
  const Icon = visual.icon;

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium leading-5 text-muted-foreground">{metricLabels[metric.label] ? translateI18n(metricLabels[metric.label]) : metric.label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {metric.label === "Total estimated revenue" ? formatRevenue(metric.value) : metric.value}
          </p>
        </div>
        <span className={["flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9", visual.iconClassName].join(" ")}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 hidden text-xs leading-5 text-muted-foreground sm:block">{visual.description}</p>
    </div>
  );
}

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

function ProjectDeliveryRow({
  project,
  role,
  hasOverdueData,
}: {
  project: DashboardProjectHealth;
  role: string;
  hasOverdueData: boolean;
}) {
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
    : hasOverdueData && healthLabel !== formatDashboardLabel(project.status)
    ? healthLabel
    : null;
  const ownerLabel = project.ownerName || (project.ownerKnown ? translateI18n("ui.unassigned") : translateI18n("common.notAvailable"));
  const openProject = (
    <Link
      href={"/projects/" + project.id}
      className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-0 lg:border-0 lg:px-0 lg:text-primary lg:hover:bg-transparent lg:hover:underline"
    >
      {translateI18n("common.open")}
      <ChevronRight className="h-4 w-4" />
    </Link>
  );

  if (role === "SALES") {
    return (
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(180px,1.3fr)_minmax(130px,1fr)_minmax(160px,1fr)_minmax(140px,0.9fr)_110px_auto] lg:items-center lg:px-5">
        <div className="min-w-0"><p className="break-words text-sm font-semibold text-foreground">{project.name}</p>{project.outputSelectedCount !== undefined && <p className="mt-1 text-xs text-muted-foreground">{translateI18n("dashboardPage.outputApproved", { approved: project.outputApprovedCount || 0, total: project.outputSelectedCount })}</p>}</div>
        <div><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("copy.estimatedRevenue")}</p><p className="mt-1 text-sm text-foreground lg:mt-0">{project.estimatedRevenue === null || project.estimatedRevenue === undefined ? translateI18n("common.notAvailable") : formatRevenue(project.estimatedRevenue)}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("copy.stage")}</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.currentStage || translateI18n("common.notAvailable")}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">PIC</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.picName || translateI18n("ui.unassigned")}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("common.status")}</p><span className={["mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-medium lg:mt-0", getProjectStatusClassName(project.status)].join(" ")}>{formatDashboardLabel(project.status)}</span></div>
        {openProject}
      </div>
    );
  }

  if (role === "HEAD_SA") {
    return (
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(180px,1.3fr)_minmax(140px,1fr)_minmax(180px,1.1fr)_110px_minmax(150px,1fr)_auto] lg:items-center lg:px-5">
        <p className="break-words text-sm font-semibold text-foreground">{project.name}</p>
        <div><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("role.SA")}</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.picName || translateI18n("ui.unassigned")}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("copy.currentWork")}</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.currentStage || translateI18n("common.notAvailable")}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("common.status")}</p><span className={["mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-medium lg:mt-0", getProjectStatusClassName(project.status)].join(" ")}>{formatDashboardLabel(project.status)}</span></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("copy.progress")}</p><p className="mt-1 text-sm text-foreground lg:mt-0">{hasProgress ? `${project.percentage}%` : translateI18n("dashboardPage.unknown")}</p><p className="mt-1 text-xs text-muted-foreground">{project.totalMilestones > 0 ? translateI18n("dashboardPage.stages", { done: project.completedMilestones, total: project.totalMilestones }) : translateI18n("dashboardPage.stageUnavailable")}</p></div>
        {openProject}
      </div>
    );
  }

  if (role === "SA") {
    return (
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(180px,1.3fr)_minmax(140px,1fr)_minmax(180px,1.1fr)_minmax(140px,0.9fr)_110px_auto] lg:items-center lg:px-5">
        <p className="break-words text-sm font-semibold text-foreground">{project.name}</p>
        <div><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("project.customer")}</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.clientName || translateI18n("common.notAvailable")}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("copy.currentWork")}</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.currentStage || translateI18n("common.notAvailable")}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("copy.deadline")}</p><p className={["mt-1 text-sm lg:mt-0", project.overdueMilestones > 0 ? "text-destructive" : "text-foreground"].join(" ")}>{deadlineLabel}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">{translateI18n("common.status")}</p><span className={["mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-medium lg:mt-0", getProjectStatusClassName(project.status)].join(" ")}>{formatDashboardLabel(project.status)}</span></div>
        {openProject}
      </div>
    );
  }

  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(170px,1.4fr)_minmax(110px,0.9fr)_110px_minmax(145px,1fr)_minmax(135px,1fr)_minmax(110px,0.9fr)_auto] lg:items-center lg:px-5">
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold text-foreground">{project.name}</p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground lg:hidden">{translateI18n("project.customer")}</p>
        <p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.clientName || translateI18n("common.notAvailable")}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground lg:hidden">{translateI18n("common.status")}</p>
        <span className={["mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-medium lg:mt-0", getProjectStatusClassName(project.status)].join(" ")}>
          {formatDashboardLabel(project.status)}
        </span>
      </div>
      <div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground lg:hidden">{translateI18n("copy.progress")}</span>
          <span className="text-foreground">{hasProgress ? String(project.percentage) + "%" : translateI18n("dashboardPage.unknown")}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          {hasProgress && (
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: String(Math.min(100, Math.max(0, project.percentage || 0))) + "%" }}
            />
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {project.totalMilestones > 0
            ? translateI18n("dashboardPage.stages", { done: project.completedMilestones, total: project.totalMilestones })
            : translateI18n("dashboardPage.stageUnavailable")}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground lg:hidden">{translateI18n("copy.deadlineRisk")}</p>
        <p className={["mt-1 text-sm lg:mt-0", project.overdueMilestones > 0 ? "text-destructive" : "text-foreground"].join(" ")}>
          {deadlineLabel}
        </p>
        {riskDetail && <p className="mt-0.5 text-xs text-muted-foreground">{riskDetail}</p>}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground lg:hidden">{translateI18n("project.owner")}</p>
        <p className="mt-1 break-words text-sm text-foreground lg:mt-0">{ownerLabel}</p>
      </div>
      {openProject}
    </div>
  );
}

function DeliveryHealthPanel({
  statusDistribution,
  scenarioDistribution,
  projects,
  role,
  loading,
}: {
  statusDistribution: Array<{ status: string; count: number; color: string }>;
  scenarioDistribution: Array<{ scenarioName: string; count: number }>;
  projects: DashboardProjectHealth[];
  role: string;
  loading: boolean;
}) {
  const statusData = statusDistribution
    .filter((item) => item.count > 0)
    .map((item) => ({ name: formatDashboardLabel(item.status), value: item.count, color: item.color }));
  const statusTotal = statusData.reduce((total, item) => total + item.value, 0);
  const scenarios = buildDashboardDistribution(
    scenarioDistribution.map((item) => ({ label: item.scenarioName, count: item.count }))
  );
  const projectCompletion = projects.filter((project) => project.percentage !== null).slice(0, 5);
  const showScenarioBreakdown = scenarios.length > 0 && (
    shouldShowDashboardInsights(role, scenarios.length, statusData.length) || projectCompletion.length === 0
  );

  return (
    <section aria-labelledby="delivery-health-heading" className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BarChart3 className="h-4 w-4" />
        </span>
        <div>
          <h2 id="delivery-health-heading" className="text-base font-semibold text-foreground">{translateI18n("copy.workCondition")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{translateI18n("copy.projectReviewStatus")}</p>
        </div>
      </div>

      {loading && statusData.length === 0 ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2" aria-label={translateI18n("dashboardPage.loadingHealth")}>
          <div className="mx-auto h-48 w-48 animate-pulse rounded-full bg-muted" />
          <div className="space-y-4">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-9 animate-pulse rounded bg-muted" />)}
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-7 sm:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.15fr)] sm:items-center">
          <div>
            {statusData.length > 0 ? (
              <>
                <div className="relative mx-auto h-48 w-full max-w-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={57}
                        outerRadius={78}
                        paddingAngle={2}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {statusData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [Number(value), translateI18n("dashboardPage.chartProjects")]}
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          color: "hsl(var(--popover-foreground))",
                          fontSize: "12px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-semibold text-foreground">{statusTotal}</span>
                    <span className="text-xs text-muted-foreground">{translateI18n("ui.projectUnit")}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-2">
                  {statusData.map((item) => (
                    <span key={item.name} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name} {item.value}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-foreground">{translateI18n("copy.noStatusData")}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{translateI18n("copy.distributionEmpty")}</p>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {showScenarioBreakdown ? translateI18n("dashboardPage.byScenario") : translateI18n("dashboardPage.projectCompletion")}
            </p>
            <div className="mt-4 space-y-4">
              {showScenarioBreakdown ? (
                scenarios.map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 break-words text-foreground">{item.label}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {item.count} ({item.percentage}%)
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: String(item.percentage) + "%" }} />
                    </div>
                  </div>
                ))
              ) : projectCompletion.length > 0 ? (
                projectCompletion.map((project) => (
                  <div key={project.id}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-foreground">{project.name}</span>
                      <span className="shrink-0 text-muted-foreground">{project.percentage}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: String(Math.min(100, Math.max(0, project.percentage || 0))) + "%" }}
                      />
                    </div>
                  </div>
                ))
              ) : scenarios.length > 0 ? (
                scenarios.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
                    <span className="text-sm text-foreground">{item.label}</span>
                    <span className="text-sm font-medium text-muted-foreground">{item.count}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">{translateI18n("copy.completionUnavailable")}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function QuickInsightsPanel({
  insights,
  loading,
  viewAllHref,
  hasMore,
}: {
  insights: ReturnType<typeof getDashboardInsights>;
  loading: boolean;
  viewAllHref: string;
  hasMore: boolean;
}) {
  return (
    <section aria-labelledby="quick-insights-heading" className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div>
        <h2 id="quick-insights-heading" className="text-base font-semibold text-foreground">{translateI18n("copy.needsAttention")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{translateI18n("copy.actionItems")}</p>
      </div>

      {loading && insights.length === 0 ? (
        <div className="mt-5 space-y-4" aria-label={translateI18n("dashboardPage.loadingInsights")}>
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded bg-muted" />)}
        </div>
      ) : insights.length > 0 ? (
        <div className="mt-5 divide-y divide-border">
          {insights.map((insight) => {
            const isRisk = insight.tone === "risk";
            const isWaiting = insight.tone === "waiting";
            const Icon = isRisk ? AlertTriangle : isWaiting ? Clock3 : ChevronRight;
            const iconClassName = isRisk
              ? "bg-destructive/10 text-destructive"
              : isWaiting
              ? "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]"
              : "bg-primary/10 text-primary";
            const content = (
              <div className="flex min-w-0 items-start gap-3 py-4 first:pt-0 last:pb-0">
                <span className={["mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconClassName].join(" ")}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-foreground">{insight.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{insight.description}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {[insight.label, insight.meta, insight.state].filter(Boolean).join(" - ")}
                  </p>
                </div>
                {insight.href && <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
              </div>
            );

            return insight.href ? (
              <Link
                key={insight.id}
                href={insight.href}
                className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {content}
              </Link>
            ) : (
              <div key={insight.id}>{content}</div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 flex items-start gap-3 py-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--success))]" />
          <div>
            <p className="text-sm font-medium text-foreground">{translateI18n("copy.noAttention")}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{translateI18n("copy.queueClear")}</p>
          </div>
        </div>
      )}

      {hasMore && (
        <Link href={viewAllHref} className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {translateI18n("dashboardPage.fullQueue")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}

function SolutionArchitectWorkloadPanel({
  workload,
  loading,
  hasError,
}: {
  workload: DashboardSaWorkload[];
  loading: boolean;
  hasError: boolean;
}) {
  const everyoneIdle = workload.length > 0 && workload.every((item) =>
    item.activeProjectCount === 0
    && item.activeMilestoneCount === 0
    && item.revisionCount === 0
    && item.waitingReviewCount === 0
    && item.overdueCount === 0
  );

  return (
    <section aria-labelledby="sa-workload-heading" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-5">
        <h2 id="sa-workload-heading" className="text-base font-semibold text-foreground">{translateI18n("copy.saWorkload")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{translateI18n("copy.workloadDescription")}</p>
      </div>

      {loading && workload.length === 0 ? (
        <div className="space-y-3 p-5" aria-label={translateI18n("dashboardPage.loadingWorkload")}>
          {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded bg-muted" />)}
        </div>
      ) : hasError && workload.length === 0 ? (
        <div className="px-5 py-8 text-sm text-muted-foreground">{translateI18n("ui.workloadLoadFailed")}</div>
      ) : workload.length === 0 ? (
        <div className="px-5 py-8 text-sm text-muted-foreground">{translateI18n("copy.noActiveSa")}</div>
      ) : (
        <>
          {everyoneIdle && <p className="border-b border-border bg-muted/30 px-5 py-3 text-sm text-muted-foreground">{translateI18n("copy.noSaWork")}</p>}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">{translateI18n("role.SA")}</th>
                  <th className="px-3 py-3 text-center font-medium">{translateI18n("copy.activeProjects")}</th>
                  <th className="px-3 py-3 text-center font-medium">{translateI18n("copy.activeWork")}</th>
                  <th className="px-3 py-3 font-medium">{translateI18n("copy.nearestDeadline")}</th>
                  <th className="px-3 py-3 text-center font-medium">{translateI18n("copy.revision")}</th>
                  <th className="px-3 py-3 text-center font-medium">{translateI18n("copy.waitingReview")}</th>
                  <th className="px-5 py-3 text-center font-medium">{translateI18n("copy.overdue")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workload.map((item) => {
                  const deadline = formatDashboardDeadline(item.nearestDeadline);
                  return (
                    <tr key={item.saId}>
                      <td className="px-5 py-4 font-medium text-foreground">{item.saName}</td>
                      <td className="px-3 py-4 text-center text-foreground">{item.activeProjectCount}</td>
                      <td className="px-3 py-4 text-center text-foreground">{item.activeMilestoneCount || <span className="text-muted-foreground">{translateI18n("copy.noActiveWork")}</span>}</td>
                      <td className="px-3 py-4 text-muted-foreground">{deadline || translateI18n("dashboardPage.noDeadline")}</td>
                      <td className="px-3 py-4 text-center"><span className={item.revisionCount > 0 ? "font-medium text-[hsl(var(--warning))]" : "text-muted-foreground"}>{item.revisionCount}</span></td>
                      <td className="px-3 py-4 text-center text-muted-foreground">{item.waitingReviewCount}</td>
                      <td className="px-5 py-4 text-center"><span className={item.overdueCount > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}>{item.overdueCount}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-border lg:hidden">
            {workload.map((item) => {
              const deadline = formatDashboardDeadline(item.nearestDeadline);
              return (
                <div key={item.saId} className="space-y-3 px-5 py-4">
                  <p className="font-medium text-foreground">{item.saName}</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.activeProjects")}</dt><dd className="mt-1 text-foreground">{item.activeProjectCount}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.activeWork")}</dt><dd className="mt-1 text-foreground">{item.activeMilestoneCount || translateI18n("dashboardPage.noActiveWork")}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.nearestDeadline")}</dt><dd className="mt-1 text-foreground">{deadline || translateI18n("dashboardPage.noDeadline")}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.waitingReview")}</dt><dd className="mt-1 text-foreground">{item.waitingReviewCount}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.revision")}</dt><dd className={item.revisionCount > 0 ? "mt-1 font-medium text-[hsl(var(--warning))]" : "mt-1 text-foreground"}>{item.revisionCount}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.overdue")}</dt><dd className={item.overdueCount > 0 ? "mt-1 font-semibold text-destructive" : "mt-1 text-foreground"}>{item.overdueCount}</dd></div>
                  </dl>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [greeting, setGreeting] = useState(() => translateI18n("dashboardCopy.hello"));
  const userRole = user?.role || "GUEST";
  const isHeadSa = userRole === "HEAD_SA";
  const isSa = userRole === "SA";

  useEffect(() => {
    setGreeting(getDashboardGreeting(new Date().getHours()));
  }, []);

  const dashboardQuery = useDashboard();
  const approvalStatsQuery = useApprovalStats();
  const approvalsQuery = useApprovals({}, isHeadSa);
  const assignedMilestonesQuery = useMyAssignedMilestones(isSa || isHeadSa);
  const projectsQuery = useProjects({ limit: 100 });

  const summary = dashboardQuery.data?.summary;
  const summaryForMetrics: DashboardSummary = {
    totalProjects: summary?.totalProjects || 0,
    activeProjects: summary?.activeProjects || 0,
    completedProjects: summary?.completedProjects || 0,
    onHoldProjects: summary?.onHoldProjects || 0,
    postponedProjects: summary?.postponedProjects || 0,
    overdueMilestones: summary?.overdueMilestones || 0,
    waitingApproval: summary?.waitingApproval ?? approvalStatsQuery.data?.totalPending ?? 0,
  };
  const projectProgress = dashboardQuery.data?.projectProgress || [];
  const recentActivity = dashboardQuery.data?.recentActivity || [];
  const statusDistribution = dashboardQuery.data?.statusDistribution || [];
  const scenarioDistribution = dashboardQuery.data?.scenarioDistribution || [];
  const outputDocuments = dashboardQuery.data?.outputDocuments || { reviewQueue: [], revisionQueue: [], salesProgress: [] };
  const saWorkload = sortSaWorkload(dashboardQuery.data?.saWorkload || []);
  const projects = projectsQuery.data?.projects || [];
  const approvals = approvalsQuery.data || [];
  const assignedMilestones = assignedMilestonesQuery.data || [];
  const roleContent = getDashboardRoleContent(userRole);
  const greetingSubject = getDashboardGreetingSubject(user?.fullName, userRole);

  const roleItems =
    userRole === "SALES"
      ? getSalesDashboardItems(projects, user?.id)
      : userRole === "HEAD_SA"
      ? [...getHeadSaItems(approvals, projects), ...getHeadSaOutputReviewItems(outputDocuments.reviewQueue)]
      : userRole === "SA"
      ? [...getSaDashboardItems(assignedMilestones, user?.id), ...getSaOutputRevisionItems(outputDocuments.revisionQueue)]
      : userRole === "SUPER_ADMIN"
      ? getSuperAdminItems(summaryForMetrics, projectProgress)
      : [];
  const actionItems = sortDashboardItems(roleItems.filter((item) => item.group === "action"));
  const nextTask = actionItems[0];
  const quickInsights = getDashboardInsights(roleItems, nextTask?.id, 5);
  const remainingItemCount = Math.max(0, roleItems.length - (nextTask ? 1 : 0));
  const viewAllHref = getViewAllHref(userRole);
  const salesResults = userRole === "SALES" ? dashboardQuery.data?.salesResults : null;
  const calculatedMetrics = salesResults ? [
    { label: "Total estimated revenue", value: salesResults.totalEstimatedRevenue },
    { label: "Waiting result", value: salesResults.waitingResult.count },
    { label: "Won", value: salesResults.won.count },
    { label: "Lost", value: salesResults.lost.count },
  ] : getRoleSummary({
    role: userRole,
    projects,
    approvals,
    milestones: assignedMilestones,
    summary: summaryForMetrics,
    outputReviewCount: outputDocuments.reviewQueue.reduce((total, item) => total + item.count, 0),
  });
  const metricValues = new Map(calculatedMetrics.map((metric) => [metric.label, metric.value]));
  const metrics = getDashboardKpiLabels(userRole).map((label) => ({
    label,
    value: metricValues.get(label) || 0,
  }));
  const isRoleDataLoading =
    (userRole === "SALES" && (projectsQuery.isLoading || dashboardQuery.isLoading)) ||
    (isHeadSa && (approvalsQuery.isLoading || projectsQuery.isLoading)) ||
    (isSa && assignedMilestonesQuery.isLoading) ||
    (userRole === "SUPER_ADMIN" && dashboardQuery.isLoading);
  const hasPartialError =
    dashboardQuery.isError ||
    projectsQuery.isError ||
    (isHeadSa && approvalsQuery.isError) ||
    (isSa && assignedMilestonesQuery.isError);

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const salesOutputProgressByProject = new Map(outputDocuments.salesProgress.map((item) => [item.projectId, item]));
  const healthSource: DashboardProjectHealth[] = (
    projectProgress.length > 0
      ? projectProgress
      : projects.map((project) => ({
          id: project.id,
          name: project.name,
          clientName: project.customer,
          status: project.status,
          targetEndDate: project.currentMilestone?.due_date || project.targetEndDate || null,
          totalMilestones: project.totalMilestones || 0,
          completedMilestones: project.completedMilestones || 0,
          overdueMilestones: 0,
          percentage: typeof project.progress === "number" ? project.progress : null,
        }))
  ).map((project) => {
    const matchingProject = projectsById.get(project.id);
    const outputProgress = salesOutputProgressByProject.get(project.id);
    const owner = matchingProject?.pic || matchingProject?.sales || matchingProject?.salesPIC || null;

    return {
      id: project.id,
      name: project.name,
      clientName: project.clientName || matchingProject?.customer,
      status: project.status,
      percentage: project.percentage,
      completedMilestones: project.completedMilestones,
      totalMilestones: project.totalMilestones,
      overdueMilestones: project.overdueMilestones,
      targetEndDate: project.targetEndDate || matchingProject?.currentMilestone?.due_date || null,
      ownerName: owner?.fullName || owner?.full_name || null,
      ownerKnown: Boolean(matchingProject),
      hasPic: matchingProject ? Boolean(matchingProject.pic) : undefined,
      currentRole: matchingProject?.currentRole,
      currentStage: matchingProject?.currentStage,
      currentDeadline: matchingProject?.currentMilestone?.due_date || null,
      picName: matchingProject?.pic?.fullName || matchingProject?.pic?.full_name || null,
      estimatedRevenue: matchingProject?.estimated_revenue ?? null,
      outputApprovedCount: outputProgress?.approvedCount,
      outputSelectedCount: outputProgress?.selectedCount,
    };
  });
  const projectDelivery = sortDashboardProjectHealth(healthSource, userRole).slice(0, 8);
  const projectDeliveryTitle = userRole === "SALES"
    ? translateI18n("dashboardPage.revenueOpportunity")
    : userRole === "HEAD_SA"
    ? translateI18n("dashboardPage.projectDelivery")
    : userRole === "SA"
    ? translateI18n("dashboardPage.yourDeadlines")
    : translateI18n("dashboardPage.projectDelivery");
  const projectDeliveryDescription = userRole === "SALES"
    ? translateI18n("dashboardPage.salesDeliveryDescription")
    : userRole === "HEAD_SA"
    ? translateI18n("dashboardPage.headDeliveryDescription")
    : userRole === "SA"
    ? translateI18n("dashboardPage.saDeliveryDescription")
    : translateI18n("dashboardPage.adminDeliveryDescription");
  const projectProgressIds = new Set(projectProgress.map((project) => project.id));
  const isProjectDeliveryLoading = dashboardQuery.isLoading && projectsQuery.isLoading;
  const hasProjectDeliveryError = dashboardQuery.isError && projectsQuery.isError;

  const retryVisibleQueries = () => {
    void dashboardQuery.refetch();
    void projectsQuery.refetch();
    void approvalStatsQuery.refetch();
    if (isHeadSa) void approvalsQuery.refetch();
    if (isSa) void assignedMilestonesQuery.refetch();
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">{roleContent.eyebrow}</p>
          <h1 className="mt-2 break-words text-2xl font-semibold text-foreground sm:text-3xl">
            {greeting}, {greetingSubject}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{roleContent.description}</p>
          {nextTask && (
            <p className="mt-3 break-words text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{translateI18n("copy.nextLabel")}</span> {nextTask.title}
            </p>
          )}
        </div>

        {isRoleDataLoading && !nextTask ? (
          <div className="h-10 w-full animate-pulse rounded-md bg-muted sm:w-36" aria-label={translateI18n("dashboardPage.loadingNext")} />
        ) : nextTask ? (
          <Link
            href={nextTask.href || viewAllHref}
            className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
          >
            {nextTask.actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <Link href="/projects" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            {translateI18n("copy.viewProject")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </header>

      {hasPartialError && (
        <div className="flex flex-col gap-3 rounded-lg border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.08)] p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
            <p>{translateI18n("copy.partialLoad")}</p>
          </div>
          <button
            type="button"
            onClick={retryVisibleQueries}
            className="text-left text-sm font-medium text-foreground underline underline-offset-4 hover:text-primary sm:text-right"
          >
            {translateI18n("common.retry")}
          </button>
        </div>
      )}

      <section aria-label={getDashboardSnapshotTitle(userRole)}>
        {isRoleDataLoading ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label={translateI18n("dashboardPage.loadingMetrics")}>
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-xl border border-border bg-muted sm:h-32" />
            ))}
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <dt className="sr-only">{metric.label}</dt>
                <dd><MetricCard metric={metric} /></dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {userRole === "SALES" && !dashboardQuery.isLoading && !dashboardQuery.isError && salesResults && (
        <section aria-label={translateI18n("dashboardPage.salesResults")} className="grid gap-4 border-y border-border py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-muted-foreground">{translateI18n("projectStatus.WAITING_RESULT")}</p><p className="font-semibold">{translateI18n("dashboardPage.projectCount", { count: salesResults.waitingResult.count })}</p><p className="text-xs text-muted-foreground">{translateI18n("dashboardPage.estimate", { value: formatRevenue(salesResults.waitingResult.estimatedRevenue) })}</p></div>
          <div><p className="text-muted-foreground">{translateI18n("projectStatus.WON")}</p><p className="font-semibold">{translateI18n("dashboardPage.projectCount", { count: salesResults.won.count })}</p><p className="text-xs text-muted-foreground">{translateI18n("dashboardPage.estimate", { value: formatRevenue(salesResults.won.estimatedRevenue) })}</p></div>
          <div><p className="text-muted-foreground">{translateI18n("projectStatus.LOST")}</p><p className="font-semibold">{translateI18n("dashboardPage.projectCount", { count: salesResults.lost.count })}</p><p className="text-xs text-muted-foreground">{translateI18n("dashboardPage.estimate", { value: formatRevenue(salesResults.lost.estimatedRevenue) })}</p></div>
          <div><p className="text-muted-foreground">{translateI18n("copy.finalContract")}</p><p className="font-semibold">{formatRevenue(salesResults.finalContractValueTotal)}</p><p className="text-xs text-muted-foreground">{translateI18n("copy.wonOnly")}</p></div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <DeliveryHealthPanel
          statusDistribution={statusDistribution}
          scenarioDistribution={scenarioDistribution}
          projects={projectDelivery}
          role={userRole}
          loading={dashboardQuery.isLoading}
        />
        <QuickInsightsPanel
          insights={quickInsights}
          loading={isRoleDataLoading}
          viewAllHref={viewAllHref}
          hasMore={remainingItemCount > quickInsights.length}
        />
      </div>

      {shouldShowSaWorkload(userRole) && (
        <SolutionArchitectWorkloadPanel
          workload={saWorkload}
          loading={dashboardQuery.isLoading}
          hasError={dashboardQuery.isError}
        />
      )}

      <section aria-labelledby="project-delivery-heading" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="project-delivery-heading" className="text-base font-semibold text-foreground">{projectDeliveryTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{projectDeliveryDescription}</p>
          </div>
          {projectDelivery.length > 0 && (
            <Link href="/projects" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              {translateI18n("dashboardPage.viewAllProjects")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        {userRole === "SALES" ? (
          <div className="hidden grid-cols-[minmax(180px,1.3fr)_minmax(130px,1fr)_minmax(160px,1fr)_minmax(140px,0.9fr)_110px_auto] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>{translateI18n("nav.projects")}</span><span>{translateI18n("project.revenue")}</span><span>{translateI18n("copy.stage")}</span><span>PIC</span><span>{translateI18n("common.status")}</span><span>{translateI18n("common.actions")}</span>
          </div>
        ) : userRole === "HEAD_SA" ? (
          <div className="hidden grid-cols-[minmax(180px,1.3fr)_minmax(140px,1fr)_minmax(180px,1.1fr)_110px_minmax(150px,1fr)_auto] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>{translateI18n("nav.projects")}</span><span>{translateI18n("role.SA")}</span><span>{translateI18n("copy.currentTasks")}</span><span>{translateI18n("common.status")}</span><span>{translateI18n("copy.progress")}</span><span>{translateI18n("common.actions")}</span>
          </div>
        ) : userRole === "SA" ? (
          <div className="hidden grid-cols-[minmax(180px,1.3fr)_minmax(140px,1fr)_minmax(180px,1.1fr)_minmax(140px,0.9fr)_110px_auto] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>{translateI18n("nav.projects")}</span><span>{translateI18n("project.customer")}</span><span>{translateI18n("copy.currentTasks")}</span><span>{translateI18n("copy.deadline")}</span><span>{translateI18n("common.status")}</span><span>{translateI18n("common.actions")}</span>
          </div>
        ) : (
          <div className="hidden grid-cols-[minmax(170px,1.4fr)_minmax(110px,0.9fr)_110px_minmax(145px,1fr)_minmax(135px,1fr)_minmax(110px,0.9fr)_auto] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>{translateI18n("nav.projects")}</span><span>{translateI18n("project.customer")}</span><span>{translateI18n("common.status")}</span><span>{translateI18n("copy.progress")}</span><span>{translateI18n("copy.deadlineRisk")}</span><span>{translateI18n("project.owner")}</span><span>{translateI18n("common.actions")}</span>
          </div>
        )}

        {isProjectDeliveryLoading && projectDelivery.length === 0 ? (
          <div className="space-y-3 p-5" aria-label={translateI18n("dashboardPage.loadingProjects")}>
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded bg-muted" />)}
          </div>
        ) : projectDelivery.length > 0 ? (
          <div className="divide-y divide-border">
            {projectDelivery.map((project) => (
              <ProjectDeliveryRow
                key={project.id}
                project={project}
                role={userRole}
                hasOverdueData={projectProgressIds.has(project.id)}
              />
            ))}
          </div>
        ) : hasProjectDeliveryError ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            {translateI18n("dashboardPage.projectsFailed")}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 px-5 py-8">
            <p className="text-sm font-medium text-foreground">{translateI18n("copy.noProjectData")}</p>
            <p className="text-sm text-muted-foreground">{translateI18n("copy.accessibleProjects")}</p>
            <Link href="/projects" className="text-sm font-medium text-primary hover:underline">{translateI18n("copy.viewProject")}</Link>
          </div>
        )}
      </section>

      <section aria-labelledby="recent-activity-heading" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-5">
          <h2 id="recent-activity-heading" className="text-base font-semibold text-foreground">{translateI18n("copy.recentActivity")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{translateI18n("copy.accessibleChanges")}</p>
        </div>

        {dashboardQuery.isLoading && recentActivity.length === 0 ? (
          <div className="space-y-3 p-5" aria-label={translateI18n("dashboardPage.loadingActivity")}>
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded bg-muted" />)}
          </div>
        ) : recentActivity.length > 0 ? (
          <div className="divide-y divide-border">
            {recentActivity.slice(0, 8).map((activity: RecentActivity) => {
              const timestamp = formatDashboardTimestamp(activity.createdAt);
              const content = (
                <div className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(170px,0.8fr)_minmax(220px,1.5fr)_minmax(170px,0.9fr)_auto] sm:items-center sm:gap-5">
                  <p className="text-sm font-medium text-foreground">{formatDashboardActivityLabel(activity.action)}</p>
                  <div className="min-w-0">
                    <p className="break-words text-sm text-foreground">{activity.project?.name || "Project unavailable"}</p>
                    <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{activity.details}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[activity.user.fullName, formatActorRoleLabel(activity.user.role)].filter(Boolean).join(" - ")}
                  </p>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-xs text-muted-foreground">{timestamp || "Time unavailable"}</span>
                    {activity.project && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </div>
                </div>
              );

              return activity.project ? (
                <Link
                  key={activity.id}
                  href={"/projects/" + activity.project.id}
                  className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  {content}
                </Link>
              ) : (
                <div key={activity.id}>{content}</div>
              );
            })}
          </div>
        ) : dashboardQuery.isError ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">{translateI18n("ui.activityLoadFailed")}</div>
        ) : (
          <div className="px-5 py-8 text-sm text-muted-foreground">{translateI18n("copy.noRecentActivity")}</div>
        )}
      </section>
    </div>
  );
}
