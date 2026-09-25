"use client";

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
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

const getApprovalPresentation = (item: ApprovalItem) => {
  switch (item.category) {
    case "PROJECT_PLAN":
      return {
        label: "Project plan review",
        actionLabel: "Review plan",
        priority: 20,
        description: "A project plan is ready for your decision.",
      };
    case "SUBMISSION":
      return {
        label: "Work submission review",
        actionLabel: "Review submission",
        priority: 30,
        description: "Submitted work is ready for your review.",
      };
    default:
      return {
        label: "Deadline change review",
        actionLabel: "Review deadline change",
        priority: 35,
        description: "A deadline change is waiting for your decision.",
      };
  }
};

const getHeadSaItems = (approvals: ApprovalItem[], projects: Project[]): DashboardWorkItem[] => {
  const items: DashboardWorkItem[] = approvals.map((approval) => {
    const presentation = getApprovalPresentation(approval);
    const milestoneSuffix = approval.milestoneName ? ` - ${approval.milestoneName}` : "";
    const requestedAt = formatDashboardDate(approval.requestedAt || approval.submittedAt);
    const meta = [approval.submittedBy ? `Requested by ${approval.submittedBy}` : undefined, requestedAt].filter(Boolean).join(" - ");

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
        label: "Plan in preparation",
        title: project.name,
        description: "Sales is preparing the project plan for review.",
        meta: project.customer ? `Customer: ${project.customer}` : undefined,
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
      label: "PIC assignment",
      title: project.name,
      description: "The project is ready for a Solution Architect assignment.",
      meta: project.customer ? `Customer: ${project.customer}` : undefined,
      state: "Needs assignment",
      href: `/projects/${project.id}#project-pic-assignment`,
      actionLabel: "Assign PIC",
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
      label: "Delivery exception",
      title: project.name,
      description: `${project.overdueMilestones} milestone${project.overdueMilestones === 1 ? " is" : "s are"} overdue.`,
      meta: project.clientName ? `Customer: ${project.clientName}` : undefined,
      state: "Needs attention",
      href: `/projects/${project.id}`,
      actionLabel: "Review project",
    });
  }

  if (summary.waitingApproval > 0) {
    items.push({
      id: "approval-pipeline",
      priority: 20,
      group: "action",
      label: "Approval pipeline",
      title: `${summary.waitingApproval} item${summary.waitingApproval === 1 ? "" : "s"} awaiting review`,
      description: "Open the Approval Center to monitor decisions waiting in the workflow.",
      state: "Pending review",
      href: "/approvals",
      actionLabel: "Open approvals",
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
}: {
  role: string;
  projects: Project[];
  approvals: ApprovalItem[];
  milestones: AssignedMilestone[];
  summary: DashboardSummary;
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
      { label: "Work submissions", value: approvals.filter((item) => item.category === "SUBMISSION").length },
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

const metricLabels: Record<string, string> = {
  "Assigned architects": "SA bertugas",
  "Active delivery": "Proyek aktif",
  "Work submissions": "Pekerjaan diajukan",
  "Unassigned projects": "Proyek tanpa PIC",
  "Total estimated revenue": "Total estimasi pendapatan",
  "Waiting result": "Menunggu hasil",
  Won: "Menang",
  Lost: "Kalah",
  "In progress": "Sedang dikerjakan",
  "Needs revision": "Perlu revisi",
  "Upcoming deadlines": "Tenggat mendatang",
  Overdue: "Terlambat",
  "Active projects": "Proyek aktif",
  "Overdue milestones": "Milestone terlambat",
  "Pending reviews": "Menunggu peninjauan",
  "Completed projects": "Proyek selesai",
};

const getMetricVisual = (label: string): MetricVisual => {
  const descriptions: Record<string, string> = {
    "Plans to review": "Rencana proyek menunggu keputusan",
    "Work submissions": "Pekerjaan diajukan untuk ditinjau",
    "Deadline requests": "Perubahan tenggat menunggu peninjauan",
    "Unassigned projects": "Proyek aktif tanpa PIC",
    Planning: "Proyek masih dalam perencanaan",
    "Waiting for review": "Item sedang ditinjau",
    "Active projects": "Proyek sedang berjalan",
    Postponed: "Proyek sedang ditunda",
    "In progress": "Milestone yang ditugaskan sedang dikerjakan",
    "Needs revision": "Pekerjaan dikembalikan untuk revisi",
    Completed: "Milestone yang ditugaskan telah selesai",
    "Overdue milestones": "Tahap melewati tenggat",
    "Pending reviews": "Keputusan masih menunggu peninjauan",
    "Completed projects": "Pekerjaan proyek selesai",
    "Total estimated revenue": "Estimasi pendapatan semua proyek Anda",
    "Waiting result": "Pekerjaan selesai, menunggu hasil tender",
    Won: "Proyek tercatat menang",
    Lost: "Proyek tercatat kalah",
    "Assigned architects": "Solution Architect yang sedang bertugas",
    "Active delivery": "Proyek sedang dikerjakan",
    "Upcoming deadlines": "Tugas jatuh tempo dalam tujuh hari",
    Overdue: "Tugas melewati tenggat",
  };

  if (/overdue|revision/i.test(label)) {
    return {
      description: descriptions[label] || "Items needing attention",
      icon: RotateCcw,
      iconClassName: "bg-destructive/10 text-destructive",
    };
  }
  if (/unassigned/i.test(label)) {
    return {
      description: descriptions[label] || "Projects waiting for assignment",
      icon: UserRound,
      iconClassName: "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]",
    };
  }
  if (/postponed/i.test(label)) {
    return {
      description: descriptions[label] || "Projects temporarily paused",
      icon: PauseCircle,
      iconClassName: "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]",
    };
  }
  if (/deadline|waiting/i.test(label)) {
    return {
      description: descriptions[label] || "Items waiting in the workflow",
      icon: CalendarClock,
      iconClassName: "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]",
    };
  }
  if (/completed/i.test(label)) {
    return {
      description: descriptions[label] || "Completed workflow items",
      icon: CheckCircle2,
      iconClassName: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
    };
  }
  if (/active|progress/i.test(label)) {
    return {
      description: descriptions[label] || "Work currently underway",
      icon: FolderKanban,
      iconClassName: "bg-primary/10 text-primary",
    };
  }
  return {
    description: descriptions[label] || "Available in your workspace",
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
          <p className="text-xs font-medium leading-5 text-muted-foreground">{metricLabels[metric.label] || metric.label}</p>
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
    ? String(project.overdueMilestones) + " overdue"
    : targetDate
    ? "Due " + targetDate
    : "Not available";
  const riskDetail = project.overdueMilestones > 0
    ? "Needs attention"
    : hasOverdueData && healthLabel !== formatDashboardLabel(project.status)
    ? healthLabel
    : null;
  const ownerLabel = project.ownerName || (project.ownerKnown ? "Unassigned" : "Not available");
  const openProject = (
    <Link
      href={"/projects/" + project.id}
      className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-0 lg:border-0 lg:px-0 lg:text-primary lg:hover:bg-transparent lg:hover:underline"
    >
      Open
      <ChevronRight className="h-4 w-4" />
    </Link>
  );

  if (role === "SALES") {
    return (
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(180px,1.3fr)_minmax(130px,1fr)_minmax(160px,1fr)_minmax(140px,0.9fr)_110px_auto] lg:items-center lg:px-5">
        <div className="min-w-0"><p className="break-words text-sm font-semibold text-foreground">{project.name}</p>{project.outputSelectedCount !== undefined && <p className="mt-1 text-xs text-muted-foreground">{project.outputApprovedCount || 0} of {project.outputSelectedCount} outputs approved</p>}</div>
        <div><p className="text-xs text-muted-foreground lg:hidden">Estimated revenue</p><p className="mt-1 text-sm text-foreground lg:mt-0">{project.estimatedRevenue === null || project.estimatedRevenue === undefined ? "Not available" : formatRevenue(project.estimatedRevenue)}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">Stage</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.currentStage || "Not available"}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">PIC</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.picName || "Unassigned"}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">Status</p><span className={["mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-medium lg:mt-0", getProjectStatusClassName(project.status)].join(" ")}>{formatDashboardLabel(project.status)}</span></div>
        {openProject}
      </div>
    );
  }

  if (role === "HEAD_SA") {
    return (
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(180px,1.3fr)_minmax(140px,1fr)_minmax(180px,1.1fr)_110px_minmax(150px,1fr)_auto] lg:items-center lg:px-5">
        <p className="break-words text-sm font-semibold text-foreground">{project.name}</p>
        <div><p className="text-xs text-muted-foreground lg:hidden">Solution Architect</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.picName || "Unassigned"}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">Current work</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.currentStage || "Not available"}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">Status</p><span className={["mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-medium lg:mt-0", getProjectStatusClassName(project.status)].join(" ")}>{formatDashboardLabel(project.status)}</span></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">Progress</p><p className="mt-1 text-sm text-foreground lg:mt-0">{hasProgress ? `${project.percentage}%` : "Unknown"}</p><p className="mt-1 text-xs text-muted-foreground">{project.totalMilestones > 0 ? `${project.completedMilestones} of ${project.totalMilestones} stages` : "Stage data unavailable"}</p></div>
        {openProject}
      </div>
    );
  }

  if (role === "SA") {
    return (
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(180px,1.3fr)_minmax(140px,1fr)_minmax(180px,1.1fr)_minmax(140px,0.9fr)_110px_auto] lg:items-center lg:px-5">
        <p className="break-words text-sm font-semibold text-foreground">{project.name}</p>
        <div><p className="text-xs text-muted-foreground lg:hidden">Customer</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.clientName || "Not available"}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">Current work</p><p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.currentStage || "Not available"}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">Deadline</p><p className={["mt-1 text-sm lg:mt-0", project.overdueMilestones > 0 ? "text-destructive" : "text-foreground"].join(" ")}>{deadlineLabel}</p></div>
        <div><p className="text-xs text-muted-foreground lg:hidden">Status</p><span className={["mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-medium lg:mt-0", getProjectStatusClassName(project.status)].join(" ")}>{formatDashboardLabel(project.status)}</span></div>
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
        <p className="text-xs text-muted-foreground lg:hidden">Customer</p>
        <p className="mt-1 break-words text-sm text-foreground lg:mt-0">{project.clientName || "Not available"}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground lg:hidden">Status</p>
        <span className={["mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-medium lg:mt-0", getProjectStatusClassName(project.status)].join(" ")}>
          {formatDashboardLabel(project.status)}
        </span>
      </div>
      <div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground lg:hidden">Progress</span>
          <span className="text-foreground">{hasProgress ? String(project.percentage) + "%" : "Unknown"}</span>
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
            ? String(project.completedMilestones) + " of " + String(project.totalMilestones) + " stages"
            : "Stage data unavailable"}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground lg:hidden">Deadline / Risk</p>
        <p className={["mt-1 text-sm lg:mt-0", project.overdueMilestones > 0 ? "text-destructive" : "text-foreground"].join(" ")}>
          {deadlineLabel}
        </p>
        {riskDetail && <p className="mt-0.5 text-xs text-muted-foreground">{riskDetail}</p>}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground lg:hidden">Owner</p>
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
          <h2 id="delivery-health-heading" className="text-base font-semibold text-foreground">Kondisi pekerjaan</h2>
          <p className="mt-1 text-sm text-muted-foreground">Status pengerjaan dan peninjauan proyek</p>
        </div>
      </div>

      {loading && statusData.length === 0 ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2" aria-label="Loading delivery health">
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
                        formatter={(value) => [Number(value), "Proyek"]}
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
                    <span className="text-xs text-muted-foreground">proyek</span>
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
                <p className="text-sm font-medium text-foreground">Belum ada data status proyek</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Sebaran status akan tampil saat proyek tersedia.</p>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {showScenarioBreakdown ? "Proyek per skenario" : "Penyelesaian proyek"}
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
                <p className="text-sm leading-6 text-muted-foreground">Data penyelesaian proyek belum tersedia.</p>
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
        <h2 id="quick-insights-heading" className="text-base font-semibold text-foreground">Perlu perhatian</h2>
        <p className="mt-1 text-sm text-muted-foreground">Hal yang perlu Anda tindak lanjuti</p>
      </div>

      {loading && insights.length === 0 ? (
        <div className="mt-5 space-y-4" aria-label="Loading quick insights">
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
            <p className="text-sm font-medium text-foreground">No additional items need attention</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Your visible workflow queue is clear.</p>
          </div>
        </div>
      )}

      {hasMore && (
        <Link href={viewAllHref} className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          View full queue
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
        <h2 id="sa-workload-heading" className="text-base font-semibold text-foreground">Solution Architect workload</h2>
        <p className="mt-1 text-sm text-muted-foreground">Work distribution, deadlines, and review status across the SA team.</p>
      </div>

      {loading && workload.length === 0 ? (
        <div className="space-y-3 p-5" aria-label="Loading Solution Architect workload">
          {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded bg-muted" />)}
        </div>
      ) : hasError && workload.length === 0 ? (
        <div className="px-5 py-8 text-sm text-muted-foreground">Solution Architect workload couldn&apos;t be loaded.</div>
      ) : workload.length === 0 ? (
        <div className="px-5 py-8 text-sm text-muted-foreground">No active Solution Architects are available.</div>
      ) : (
        <>
          {everyoneIdle && <p className="border-b border-border bg-muted/30 px-5 py-3 text-sm text-muted-foreground">All Solution Architects currently have no active work.</p>}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Solution Architect</th>
                  <th className="px-3 py-3 text-center font-medium">Active projects</th>
                  <th className="px-3 py-3 text-center font-medium">Active work</th>
                  <th className="px-3 py-3 font-medium">Nearest deadline</th>
                  <th className="px-3 py-3 text-center font-medium">Revision</th>
                  <th className="px-3 py-3 text-center font-medium">Waiting review</th>
                  <th className="px-5 py-3 text-center font-medium">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workload.map((item) => {
                  const deadline = formatDashboardDeadline(item.nearestDeadline);
                  return (
                    <tr key={item.saId}>
                      <td className="px-5 py-4 font-medium text-foreground">{item.saName}</td>
                      <td className="px-3 py-4 text-center text-foreground">{item.activeProjectCount}</td>
                      <td className="px-3 py-4 text-center text-foreground">{item.activeMilestoneCount || <span className="text-muted-foreground">No active work</span>}</td>
                      <td className="px-3 py-4 text-muted-foreground">{deadline || "No deadline"}</td>
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
                    <div><dt className="text-xs text-muted-foreground">Active projects</dt><dd className="mt-1 text-foreground">{item.activeProjectCount}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Active work</dt><dd className="mt-1 text-foreground">{item.activeMilestoneCount || "No active work"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Nearest deadline</dt><dd className="mt-1 text-foreground">{deadline || "No deadline"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Waiting review</dt><dd className="mt-1 text-foreground">{item.waitingReviewCount}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Revision</dt><dd className={item.revisionCount > 0 ? "mt-1 font-medium text-[hsl(var(--warning))]" : "mt-1 text-foreground"}>{item.revisionCount}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Overdue</dt><dd className={item.overdueCount > 0 ? "mt-1 font-semibold text-destructive" : "mt-1 text-foreground"}>{item.overdueCount}</dd></div>
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
  const [greeting, setGreeting] = useState("Halo");
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
    ? "Peluang pendapatan"
    : userRole === "HEAD_SA"
    ? "Pelaksanaan proyek"
    : userRole === "SA"
    ? "Tenggat tugas Anda"
    : "Pelaksanaan proyek";
  const projectDeliveryDescription = userRole === "SALES"
    ? "Pendapatan, tahap pekerjaan, dan PIC pada proyek Anda"
    : userRole === "HEAD_SA"
    ? "Proyek berjalan, PIC, dan status pekerjaan"
    : userRole === "SA"
    ? "Tahap dan tenggat pada proyek yang Anda tangani"
    : "Perkembangan proyek aktif dan dalam perencanaan";
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
              <span className="font-medium text-foreground">Berikutnya:</span> {nextTask.title}
            </p>
          )}
        </div>

        {isRoleDataLoading && !nextTask ? (
          <div className="h-10 w-full animate-pulse rounded-md bg-muted sm:w-36" aria-label="Loading next task" />
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
            Lihat proyek
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </header>

      {hasPartialError && (
        <div className="flex flex-col gap-3 rounded-lg border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.08)] p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
            <p>Sebagian data gagal dimuat. Data yang tersedia tetap ditampilkan.</p>
          </div>
          <button
            type="button"
            onClick={retryVisibleQueries}
            className="text-left text-sm font-medium text-foreground underline underline-offset-4 hover:text-primary sm:text-right"
          >
            Coba lagi
          </button>
        </div>
      )}

      <section aria-label={getDashboardSnapshotTitle(userRole)}>
        {isRoleDataLoading ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Loading role metrics">
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
        <section aria-label="Sales project results" className="grid gap-4 border-y border-border py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-muted-foreground">Menunggu hasil</p><p className="font-semibold">{salesResults.waitingResult.count} proyek</p><p className="text-xs text-muted-foreground">Estimasi {formatRevenue(salesResults.waitingResult.estimatedRevenue)}</p></div>
          <div><p className="text-muted-foreground">Menang</p><p className="font-semibold">{salesResults.won.count} proyek</p><p className="text-xs text-muted-foreground">Estimasi {formatRevenue(salesResults.won.estimatedRevenue)}</p></div>
          <div><p className="text-muted-foreground">Kalah</p><p className="font-semibold">{salesResults.lost.count} proyek</p><p className="text-xs text-muted-foreground">Estimasi {formatRevenue(salesResults.lost.estimatedRevenue)}</p></div>
          <div><p className="text-muted-foreground">Nilai kontrak final</p><p className="font-semibold">{formatRevenue(salesResults.finalContractValueTotal)}</p><p className="text-xs text-muted-foreground">Hanya proyek menang</p></div>
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
              Lihat semua proyek
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        {userRole === "SALES" ? (
          <div className="hidden grid-cols-[minmax(180px,1.3fr)_minmax(130px,1fr)_minmax(160px,1fr)_minmax(140px,0.9fr)_110px_auto] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>Proyek</span><span>Pendapatan</span><span>Tahap</span><span>PIC</span><span>Status</span><span>Aksi</span>
          </div>
        ) : userRole === "HEAD_SA" ? (
          <div className="hidden grid-cols-[minmax(180px,1.3fr)_minmax(140px,1fr)_minmax(180px,1.1fr)_110px_minmax(150px,1fr)_auto] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>Proyek</span><span>Solution Architect</span><span>Tugas saat ini</span><span>Status</span><span>Progres</span><span>Aksi</span>
          </div>
        ) : userRole === "SA" ? (
          <div className="hidden grid-cols-[minmax(180px,1.3fr)_minmax(140px,1fr)_minmax(180px,1.1fr)_minmax(140px,0.9fr)_110px_auto] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>Proyek</span><span>Pelanggan</span><span>Tugas saat ini</span><span>Tenggat</span><span>Status</span><span>Aksi</span>
          </div>
        ) : (
          <div className="hidden grid-cols-[minmax(170px,1.4fr)_minmax(110px,0.9fr)_110px_minmax(145px,1fr)_minmax(135px,1fr)_minmax(110px,0.9fr)_auto] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>Proyek</span><span>Pelanggan</span><span>Status</span><span>Progres</span><span>Tenggat / Risiko</span><span>Pemilik</span><span>Aksi</span>
          </div>
        )}

        {isProjectDeliveryLoading && projectDelivery.length === 0 ? (
          <div className="space-y-3 p-5" aria-label="Loading project delivery">
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
            Data proyek gagal dimuat. Coba lagi melalui pemberitahuan di atas.
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 px-5 py-8">
            <p className="text-sm font-medium text-foreground">Belum ada data proyek</p>
            <p className="text-sm text-muted-foreground">Proyek yang dapat Anda akses akan tampil di sini.</p>
            <Link href="/projects" className="text-sm font-medium text-primary hover:underline">Lihat proyek</Link>
          </div>
        )}
      </section>

      <section aria-labelledby="recent-activity-heading" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-5">
          <h2 id="recent-activity-heading" className="text-base font-semibold text-foreground">Aktivitas terbaru</h2>
          <p className="mt-1 text-sm text-muted-foreground">Perubahan terbaru pada proyek yang dapat Anda akses</p>
        </div>

        {dashboardQuery.isLoading && recentActivity.length === 0 ? (
          <div className="space-y-3 p-5" aria-label="Loading recent activity">
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
          <div className="px-5 py-8 text-sm text-muted-foreground">Recent activity couldn&apos;t be loaded.</div>
        ) : (
          <div className="px-5 py-8 text-sm text-muted-foreground">No recent activity is available for your projects yet.</div>
        )}
      </section>
    </div>
  );
}
