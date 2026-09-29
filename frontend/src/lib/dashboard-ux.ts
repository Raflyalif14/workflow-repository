import { getIntlLocale, translate } from "@/i18n";
import { formatActivityAction } from "@/lib/activity-timeline";
import type { DashboardOutputDocuments, DashboardSaWorkload } from "@/types/dashboard";
import type { Project } from "@/types/project";

export type DashboardRole = "SALES" | "HEAD_SA" | "SA" | "SUPER_ADMIN" | string | undefined;

export type DashboardItemGroup = "action" | "waiting" | "informational";

export type DashboardWorkItem = {
  id: string;
  priority: number;
  group: DashboardItemGroup;
  label: string;
  title: string;
  description: string;
  meta?: string;
  state?: string;
  href?: string;
  actionLabel?: string;
};

export type DashboardProjectHealth = {
  id: string;
  name: string;
  clientName?: string | null;
  status: string;
  percentage: number | null;
  completedMilestones: number;
  totalMilestones: number;
  overdueMilestones: number;
  targetEndDate?: string | null;
  ownerName?: string | null;
  ownerKnown?: boolean;
  hasPic?: boolean;
  currentRole?: string | null;
  currentStage?: string | null;
  currentDeadline?: string | null;
  picName?: string | null;
  estimatedRevenue?: number | null;
  outputApprovedCount?: number;
  outputSelectedCount?: number;
};

export type DashboardDistributionItem = {
  label: string;
  count: number;
  percentage: number;
};

export type DashboardInsight = DashboardWorkItem & {
  tone: "action" | "waiting" | "risk" | "informational";
  isPrimaryAction: boolean;
};

export const getDashboardRoleContent = (role: DashboardRole) => {
  switch (role) {
    case "SALES":
      return {
        eyebrow: translate("dashboardCopy.salesEyebrow"),
        title: translate("dashboardCopy.salesTitle"),
        description: translate("dashboardCopy.salesDescription"),
      };
    case "HEAD_SA":
      return {
        eyebrow: translate("dashboardCopy.headEyebrow"),
        title: translate("dashboardCopy.headTitle"),
        description: translate("dashboardCopy.headDescription"),
      };
    case "SA":
      return {
        eyebrow: translate("dashboardCopy.saEyebrow"),
        title: translate("dashboardCopy.saTitle"),
        description: translate("dashboardCopy.saDescription"),
      };
    case "SUPER_ADMIN":
      return {
        eyebrow: translate("dashboardCopy.adminEyebrow"),
        title: translate("dashboardCopy.adminTitle"),
        description: translate("dashboardCopy.adminDescription"),
      };
    default:
      return {
        eyebrow: translate("dashboardCopy.defaultEyebrow"),
        title: translate("dashboardCopy.defaultTitle"),
        description: translate("dashboardCopy.defaultDescription"),
      };
  }
};

export const getDashboardGreeting = (hour: number): string => {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return translate("dashboardCopy.hello");
  if (hour < 12) return translate("dashboardCopy.morning");
  if (hour < 18) return translate("dashboardCopy.afternoon");
  return translate("dashboardCopy.evening");
};

export const getDashboardGreetingSubject = (
  displayName: string | null | undefined,
  role: DashboardRole
): string => {
  const roleLabels: Record<string, string> = {
    HEAD_SA: "Head SA",
    SA: "Solution Architect",
    SALES: "Sales",
    SUPER_ADMIN: "Admin",
  };
  const roleFallback = roleLabels[role || ""] || (role
    ? role
        .toLowerCase()
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(" ")
    : "there");
  const normalizedName = displayName?.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

  if (!normalizedName) return roleFallback;

  const accountLabel = normalizedName.toLowerCase();
  const knownRoleNames = new Set([
    "head solution architect",
    "head sa",
    "solution architect",
    "sa",
    "sales",
    "super admin",
    "admin",
    "administrator",
  ]);
  const looksLikeTestAccount = /\b(test|demo|uat|account)\b/i.test(normalizedName);

  if (knownRoleNames.has(accountLabel) || looksLikeTestAccount) return roleFallback;
  return normalizedName.split(" ")[0];
};

export const getDashboardKpiLabels = (role: DashboardRole): string[] => {
  switch (role) {
    case "HEAD_SA":
      return ["Assigned architects", "Active delivery", "Outputs awaiting review", "Unassigned projects"];
    case "SALES":
      return ["Total estimated revenue", "Waiting result", "Won", "Lost"];
    case "SA":
      return ["In progress", "Needs revision", "Upcoming deadlines", "Overdue"];
    case "SUPER_ADMIN":
      return ["Active projects", "Overdue milestones", "Pending reviews", "Completed projects"];
    default:
      return ["Projects", "Active", "Waiting", "Completed"];
  }
};

export const formatDashboardLabel = (value?: string | null): string => {
  if (!value) return "Unknown";

  const labels: Record<string, string> = {
    DRAFT: translate("dashboardWork.planning"),
    ACTIVE: "Active",
    POSTPONED: translate("dashboardWork.postponed"),
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    WAITING_RESULT: translate("dashboardWork.waitingResult"),
    WON: "Won",
    LOST: "Lost",
    CREATED: "Not started",
    IN_PROGRESS: translate("dashboardWork.inProgress"),
    SUBMITTED: translate("dashboardWork.underReview"),
    REJECTED: translate("dashboardWork.revisionRequired"),
    APPROVED: "Approved",
    PENDING: "Pending review",
    PROJECT_PLAN: "Project plan",
    DEADLINE: "Deadline change",
  };

  return labels[value] || value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
};

export const getApprovalProjectHref = (
  projectId: string,
  category: string,
  milestoneId?: string | null
): string => {
  if (category === "PROJECT_PLAN") return `/projects/${projectId}#project-plan-review`;
  if (milestoneId) return `/projects/${projectId}#project-milestone-${milestoneId}`;
  return `/projects/${projectId}`;
};

export const getMilestoneProjectHref = (projectId: string, milestoneId: string): string =>
  `/projects/${projectId}#project-milestone-${milestoneId}`;

export const getOutputDocumentsHref = (projectId: string, milestoneId?: string): string =>
  `/projects/${projectId}${milestoneId ? `#milestone-outputs-${milestoneId}` : ""}`;

export const getHeadSaOutputReviewItems = (
  queue: DashboardOutputDocuments["reviewQueue"]
): DashboardWorkItem[] => queue.map((item) => ({
  id: `output-review-${item.milestoneId}`,
  priority: 25,
  group: "action",
  label: translate("dashboardWork.outputAwaiting"),
  title: item.projectName,
  description: item.count === 1 ? translate("dashboardWork.outputAwaitingOne") : translate("dashboardWork.outputAwaitingCount", { count: item.count }),
  state: "Pending review",
  href: getOutputDocumentsHref(item.projectId, item.milestoneId),
  actionLabel: translate("dashboardWork.reviewOutputs"),
}));

export const getSaOutputRevisionItems = (
  queue: DashboardOutputDocuments["revisionQueue"]
): DashboardWorkItem[] => queue.map((item) => ({
  id: `output-revision-${item.milestoneId}`,
  priority: 9,
  group: "action",
  label: translate("dashboardWork.outputRevision"),
  title: item.projectName,
  description: item.count === 1 ? translate("dashboardWork.outputRevisionOne") : translate("dashboardWork.outputRevisionCount", { count: item.count }),
  state: translate("dashboardWork.revisionRequired"),
  href: getOutputDocumentsHref(item.projectId, item.milestoneId),
  actionLabel: translate("dashboardWork.reviseOutputs"),
}));

export type SaDashboardMilestone = {
  id: string;
  project_id: string;
  name: string;
  step_order: number;
  status: string;
  pic_id: string | null;
  due_date?: string | null;
  project?: {
    id: string;
    name: string;
    customer?: string | null;
    status?: string;
    is_postponed?: boolean;
  } | null;
};

export type SaDashboardMetrics = {
  inProgress: number;
  needsRevision: number;
  upcomingDeadlines: number;
  overdue: number;
};

export const isPausedSaMilestone = (milestone: SaDashboardMilestone): boolean =>
  milestone.project?.status === "POSTPONED" || milestone.project?.is_postponed === true;

export const isActionableSaMilestone = (milestone: SaDashboardMilestone): boolean =>
  milestone.project?.status === "ACTIVE" && milestone.project?.is_postponed !== true;

export const getSaDashboardItems = (
  milestones: SaDashboardMilestone[],
  userId?: string
): DashboardWorkItem[] => {
  const items: DashboardWorkItem[] = [];

  for (const milestone of milestones) {
    if (milestone.pic_id !== userId) continue;

    const projectId = milestone.project?.id || milestone.project_id;
    const projectName = milestone.project?.name || translate("dashboardWork.assignedProject");
    const projectMeta = milestone.project?.customer
      ? translate("dashboardWork.customer", { name: milestone.project.customer })
      : translate("dashboardWork.stage", { number: milestone.step_order });
    const href = getMilestoneProjectHref(projectId, milestone.id);
    const title = `${projectName} - ${milestone.name}`;

    if (isPausedSaMilestone(milestone)) {
      if (milestone.status === "IN_PROGRESS") {
        items.push({
          id: `sa-paused-${milestone.id}`,
          priority: 50,
          group: "waiting",
          label: translate("dashboardWork.projectPaused"),
          title,
          description: translate("dashboardWork.workPaused"),
          meta: projectMeta,
          state: translate("dashboardWork.paused"),
          href,
        });
      }
      continue;
    }

    if (!isActionableSaMilestone(milestone)) continue;

    if (milestone.status === "IN_PROGRESS") {
      items.push({
        id: `continue-${milestone.id}`,
        priority: 30,
        group: "action",
        label: translate("dashboardWork.activeDelivery"),
        title,
        description: translate("dashboardWork.continueDelivery"),
        meta: projectMeta,
        state: translate("dashboardWork.inProgress"),
        href,
        actionLabel: translate("dashboardWork.continueWork"),
      });
      continue;
    }

  }

  return items;
};

export const getSaDashboardMetrics = (
  milestones: SaDashboardMilestone[],
  now = new Date()
): SaDashboardMetrics => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const activeMilestones = milestones.filter(isActionableSaMilestone);
  const actionable = activeMilestones.filter((milestone) =>
    milestone.status === "IN_PROGRESS"
  );
  const deadlineDistance = (value?: string | null) =>
    value ? Math.ceil((new Date(`${value}T00:00:00`).getTime() - today.getTime()) / 86400000) : null;

  return {
    inProgress: activeMilestones.filter((milestone) => milestone.status === "IN_PROGRESS").length,
    needsRevision: 0,
    upcomingDeadlines: actionable.filter((milestone) => {
      const distance = deadlineDistance(milestone.due_date);
      return distance !== null && distance >= 0 && distance <= 7;
    }).length,
    overdue: actionable.filter((milestone) => {
      const distance = deadlineDistance(milestone.due_date);
      return distance !== null && distance < 0;
    }).length,
  };
};

export const getDraftProjectActionCopy = (currentRole?: string | null): string =>
  currentRole === "SALES" ? translate("dashboardWork.continuePlanning") : translate("dashboardWork.reviewStatus");

export const getSalesDashboardItems = (projects: Project[], userId?: string): DashboardWorkItem[] => {
  const items = new Map<string, DashboardWorkItem>();

  for (const project of projects) {
    const isOwner = !project.sales_id || project.sales_id === userId;
    const projectHref = `/projects/${project.id}`;
    const projectMeta = project.customer ? translate("dashboardWork.customer", { name: project.customer }) : undefined;
    const milestone = project.currentMilestone;

    if (project.sales_id === userId && project.status === "WAITING_RESULT") {
      const id = `sales-result-${project.id}`;
      items.set(id, {
        id,
        priority: 5,
        group: "action",
        label: translate("dashboardWork.tenderResult"),
        title: project.name,
        description: translate("dashboardWork.recordResultHelp"),
        meta: projectMeta,
        state: translate("dashboardWork.waitingResult"),
        href: projectHref,
        actionLabel: translate("dashboardWork.recordResult"),
      });
      continue;
    }

    if (
      project.sales_id === userId &&
      project.status === "ACTIVE" &&
      !project.is_postponed &&
      milestone?.status === "IN_PROGRESS" &&
      milestone.default_role === "SALES"
    ) {
      const id = `sales-milestone-${milestone.id}`;
      items.set(id, {
        id,
        priority: 30,
        group: "action",
        label: translate("dashboardWork.salesMilestone"),
        title: `${project.name} - ${milestone.name}`,
        description: translate("dashboardWork.continueSales"),
        meta: projectMeta,
        state: translate("dashboardWork.inProgress"),
        href: getMilestoneProjectHref(project.id, milestone.id),
        actionLabel: translate("dashboardWork.openMilestone"),
      });
      continue;
    }

    if (isOwner && project.status === "DRAFT" && project.currentRole === "SALES") {
      const id = `sales-planning-${project.id}`;
      items.set(id, {
        id,
        priority: 40,
        group: "action",
        label: translate("dashboardWork.projectPlanning"),
        title: project.name,
        description: translate("dashboardWork.continuePlan"),
        meta: projectMeta,
        state: translate("dashboardWork.planning"),
        href: projectHref,
        actionLabel: getDraftProjectActionCopy(project.currentRole),
      });
      continue;
    }

    if (project.status === "DRAFT" && project.currentRole === "HEAD_SA") {
      const id = `sales-waiting-${project.id}`;
      items.set(id, {
        id,
        priority: 20,
        group: "waiting",
        label: translate("dashboardWork.planReview"),
        title: project.name,
        description: translate("dashboardWork.headPlanReview"),
        meta: projectMeta,
        state: translate("dashboardWork.underReview"),
        href: projectHref,
      });
      continue;
    }

    if (project.status === "POSTPONED" && isOwner) {
      const id = `sales-resume-${project.id}`;
      items.set(id, {
        id,
        priority: 50,
        group: "informational",
        label: translate("dashboardWork.projectPostponed"),
        title: project.name,
        description: translate("dashboardWork.deliveryPaused"),
        meta: projectMeta,
        state: translate("dashboardWork.postponed"),
        href: projectHref,
      });
    }
  }

  return [...items.values()];
};

export const getDashboardSnapshotTitle = (role: DashboardRole): string => {
  switch (role) {
    case "SALES":
      return "Project pipeline";
    case "HEAD_SA":
      return "Review snapshot";
    case "SA":
      return "Delivery snapshot";
    case "SUPER_ADMIN":
      return "Operations snapshot";
    default:
      return "Workspace snapshot";
  }
};

export const getDashboardQueueTitle = (role: DashboardRole): string => {
  switch (role) {
    case "SALES":
      return "Project follow-up";
    case "HEAD_SA":
      return "Review queue";
    case "SA":
      return "Assigned work";
    case "SUPER_ADMIN":
      return "Operational follow-up";
    default:
      return "Additional work";
  }
};

export const shouldShowSaWorkload = (role: DashboardRole): boolean => role === "HEAD_SA";

export const getAdditionalDashboardItems = (items: DashboardWorkItem[], limit = 4): DashboardWorkItem[] =>
  sortDashboardItems(items).slice(1, limit + 1);

export const hasAdditionalDashboardItems = (items: DashboardWorkItem[]): boolean =>
  getAdditionalDashboardItems(items, 1).length > 0;

export const formatDashboardActivityLabel = (action?: string | null): string =>
  action ? formatActivityAction(action) : "Activity";

export const formatDashboardDate = (value?: string | null): string | null => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(getIntlLocale(), { dateStyle: "medium" });
};

export const formatDashboardTimestamp = (value?: string | null): string | null => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString(getIntlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const getSafeDateOnlyTimestamp = (value?: string | null): number | null => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [year, month, day] = match.slice(1).map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? timestamp
    : null;
};

export const formatDashboardDeadline = (value?: string | null): string | null => {
  const timestamp = getSafeDateOnlyTimestamp(value);
  if (timestamp === null) return null;

  return new Date(timestamp).toLocaleDateString(getIntlLocale(), {
    dateStyle: "medium",
    timeZone: "UTC",
  });
};

export const sortSaWorkload = (workload: DashboardSaWorkload[]): DashboardSaWorkload[] =>
  [...workload].sort((left, right) => {
    if (left.overdueCount !== right.overdueCount) return right.overdueCount - left.overdueCount;
    if (left.revisionCount !== right.revisionCount) return right.revisionCount - left.revisionCount;
    if (left.activeMilestoneCount !== right.activeMilestoneCount) {
      return right.activeMilestoneCount - left.activeMilestoneCount;
    }

    const leftDeadline = getSafeDateOnlyTimestamp(left.nearestDeadline);
    const rightDeadline = getSafeDateOnlyTimestamp(right.nearestDeadline);
    if (leftDeadline !== null && rightDeadline !== null && leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
    if (leftDeadline !== null) return -1;
    if (rightDeadline !== null) return 1;
    return left.saName.localeCompare(right.saName);
  });

export const buildDashboardDistribution = (
  items: Array<{ label: string; count: number }>,
  limit = 6
): DashboardDistributionItem[] => {
  const validItems = items.filter((item) => item.count > 0);
  const total = validItems.reduce((sum, item) => sum + item.count, 0);

  return validItems
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit)
    .map((item) => ({
      ...item,
      percentage: total > 0 ? Math.round((item.count / total) * 100) : 0,
    }));
};

const getDashboardInsightTone = (item: DashboardWorkItem): DashboardInsight["tone"] => {
  if (item.group === "waiting") return "waiting";
  if (/revision|revise|overdue|exception|postponed|sales-resume/i.test(item.id)) return "risk";
  if (item.group === "action") return "action";
  return "informational";
};

export const getDashboardInsights = (
  items: DashboardWorkItem[],
  nextTaskId?: string,
  limit = 5
): DashboardInsight[] =>
  sortDashboardItems(items)
    .filter((item) => item.id !== nextTaskId)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      tone: getDashboardInsightTone(item),
      isPrimaryAction: isDashboardAction(item),
    }));

export const shouldShowDashboardInsights = (
  role: DashboardRole,
  scenarioCount: number,
  statusCount: number
): boolean =>
  role !== "SA" &&
  (role === "SALES" || role === "HEAD_SA" || role === "SUPER_ADMIN") &&
  (scenarioCount > 1 || statusCount > 1);

const getProjectHealthPriority = (project: DashboardProjectHealth, role: DashboardRole): number => {
  if (project.overdueMilestones > 0) return 0;
  if (role === "SALES" && project.status === "WAITING_RESULT") return 1;
  if (role === "HEAD_SA" && project.status === "ACTIVE" && !project.hasPic && project.currentRole === "HEAD_SA") return 1;
  if (project.status === "POSTPONED" || project.status === "ON_HOLD") return 1;
  if (role === "SUPER_ADMIN" && project.status === "ACTIVE" && project.percentage !== null && project.percentage < 25) return 2;
  if (project.status === "ACTIVE") return 3;
  if (project.status === "DRAFT") return 4;
  if (["COMPLETED", "CANCELLED", "WON", "LOST"].includes(project.status)) return 7;
  if (project.targetEndDate && formatDashboardDate(project.targetEndDate)) return 5;
  return 6;
};

export const sortDashboardProjectHealth = (
  projects: DashboardProjectHealth[],
  role: DashboardRole
): DashboardProjectHealth[] =>
  [...projects].sort((left, right) => {
    const priorityDifference = getProjectHealthPriority(left, role) - getProjectHealthPriority(right, role);
    if (priorityDifference !== 0) return priorityDifference;

    const leftDate = left.targetEndDate && Date.parse(left.targetEndDate);
    const rightDate = right.targetEndDate && Date.parse(right.targetEndDate);
    if (leftDate && rightDate && leftDate !== rightDate) return leftDate - rightDate;
    if (leftDate && !rightDate) return -1;
    if (!leftDate && rightDate) return 1;
    return left.name.localeCompare(right.name);
  });

export const getDashboardProjectHealthLabel = (
  project: DashboardProjectHealth,
  role: DashboardRole
): string => {
  if (project.overdueMilestones > 0) {
    return `${project.overdueMilestones} overdue milestone${project.overdueMilestones === 1 ? "" : "s"}`;
  }
  if (role === "HEAD_SA" && project.status === "ACTIVE" && !project.hasPic && project.currentRole === "HEAD_SA") {
    return "Needs PIC";
  }
  if (role === "SUPER_ADMIN" && project.status === "ACTIVE" && project.percentage !== null && project.percentage < 25) {
    return "Low progress";
  }
  if (project.status === "ACTIVE" && project.percentage === null) return "Active";
  if (project.status === "ACTIVE") return "On track";
  return formatDashboardLabel(project.status);
};

export const isDashboardAction = (item: DashboardWorkItem): boolean =>
  item.group === "action" && Boolean(item.href && item.actionLabel);

export const sortDashboardItems = (items: DashboardWorkItem[]): DashboardWorkItem[] =>
  [...items].sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title));
