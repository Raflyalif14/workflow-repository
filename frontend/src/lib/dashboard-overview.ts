import { getIntlLocale, translate as translateI18n } from "@/i18n";
import { planAndDeadlineApprovals } from "@/lib/approval-queue";
import { formatDashboardDate, getApprovalProjectHref, getSaDashboardMetrics, type DashboardWorkItem } from "@/lib/dashboard-ux";
import type { AssignedMilestone } from "@/hooks/use-projects";
import type { ApprovalItem } from "@/types/approval";
import type { DashboardSummary, ProjectProgress } from "@/types/dashboard";
import type { Project } from "@/types/project";

export type SummaryMetric = {
  label: string;
  value: number;
};

export const displayWorkState = (value?: string) => value === "Pending review"
  ? translateI18n("copy.waitingReview") : value === "Planning"
  ? translateI18n("projectStatus.DRAFT") : value;

export const formatRevenue = (value: number): string =>
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

export const getHeadSaItems = (approvals: ApprovalItem[], projects: Project[]): DashboardWorkItem[] => {
  const items: DashboardWorkItem[] = planAndDeadlineApprovals(approvals).map((approval) => {
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
      state: translateI18n("copy.waitingReview"),
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

export const getSuperAdminItems = (summary: DashboardSummary, projectProgress: ProjectProgress[]): DashboardWorkItem[] => {
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
      state: translateI18n("copy.waitingReview"),
      href: "/approvals",
      actionLabel: translateI18n("dashboardPage.openApprovals"),
    });
  }

  return items;
};

export const getRoleSummary = ({
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

export const getViewAllHref = (role: string): string => {
  if (role === "HEAD_SA") return "/approvals";
  if (role === "SA") return "/milestones";
  return "/projects";
};
