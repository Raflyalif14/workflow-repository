"use client";

import { CalendarClock, CheckCircle2, ClipboardCheck, FolderKanban, PauseCircle, RotateCcw, UserRound } from "lucide-react";
import { translate as translateI18n, type TranslationKey } from "@/i18n";
import { formatRevenue, type SummaryMetric } from "@/lib/dashboard-overview";

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

export function MetricCard({ metric, compact = false }: { metric: SummaryMetric; compact?: boolean }) {
  const visual = getMetricVisual(metric.label);
  const Icon = visual.icon;

  return (
    <div className={`dashboard-surface flex h-full min-w-0 flex-1 flex-col p-4 ${compact ? '' : 'sm:p-5'}`}>
      <div className={`flex min-w-0 items-start justify-between gap-3 ${compact ? '' : 'sm:min-h-10'}`}>
        <div className="min-w-0">
          <p className="text-xs font-medium leading-5 text-muted-foreground">{metricLabels[metric.label] ? translateI18n(metricLabels[metric.label]) : metric.label}</p>
        </div>
        <span className={["flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", compact ? '' : 'sm:h-9 sm:w-9', visual.iconClassName].join(" ")}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={`mt-1 min-w-0 flex-1 break-words text-xl font-semibold tabular-nums text-foreground [overflow-wrap:anywhere] ${compact ? '' : 'sm:text-2xl xl:text-xl 2xl:text-2xl'}`}>
        {metric.label === "Total estimated revenue" ? formatRevenue(metric.value) : metric.value}
      </p>
      <p className={compact ? 'sr-only' : 'mt-3 hidden text-xs leading-5 text-muted-foreground sm:block sm:min-h-10'}>{visual.description}</p>
    </div>
  );
}
