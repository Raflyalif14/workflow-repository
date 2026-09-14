import { formatActivityAction } from "@/lib/activity-timeline";

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
        eyebrow: "SALES WORKSPACE",
        title: "Sales workspace",
        description: "Keep planning clear and customer delivery moving.",
      };
    case "HEAD_SA":
      return {
        eyebrow: "REVIEW WORKSPACE",
        title: "Review workspace",
        description: "Focus on the decisions that keep project delivery moving.",
      };
    case "SA":
      return {
        eyebrow: "DELIVERY WORKSPACE",
        title: "Delivery workspace",
        description: "Continue assigned work and respond to review feedback.",
      };
    case "SUPER_ADMIN":
      return {
        eyebrow: "OPERATIONS OVERVIEW",
        title: "Operations overview",
        description: "Monitor portfolio delivery and operational exceptions.",
      };
    default:
      return {
        eyebrow: "WORKSPACE",
        title: "Workspace",
        description: "View the work and projects available to your account.",
      };
  }
};

export const getDashboardGreeting = (hour: number): string => {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return "Hello";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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
      return ["Plans to review", "Work submissions", "Deadline requests", "Unassigned projects"];
    case "SALES":
      return ["Planning", "Waiting for review", "Active projects", "Postponed"];
    case "SA":
      return ["In progress", "Needs revision", "Waiting for review", "Completed"];
    case "SUPER_ADMIN":
      return ["Active projects", "Overdue milestones", "Pending reviews", "Completed projects"];
    default:
      return ["Projects", "Active", "Waiting", "Completed"];
  }
};

export const formatDashboardLabel = (value?: string | null): string => {
  if (!value) return "Unknown";

  const labels: Record<string, string> = {
    DRAFT: "Planning",
    ACTIVE: "Active",
    POSTPONED: "Postponed",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    CREATED: "Not started",
    IN_PROGRESS: "In progress",
    SUBMITTED: "Under review",
    REJECTED: "Revision required",
    APPROVED: "Approved",
    PENDING: "Pending review",
    PROJECT_PLAN: "Project plan",
    DEADLINE: "Deadline change",
    SUBMISSION: "Work submission",
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

export const getDraftProjectActionCopy = (currentRole?: string | null): string =>
  currentRole === "SALES" ? "Continue project planning" : "Review project status";

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

  return date.toLocaleDateString("id-ID", { dateStyle: "medium" });
};

export const formatDashboardTimestamp = (value?: string | null): string | null => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

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
  if (/revision|overdue|exception|postponed/i.test(`${item.label} ${item.state || ""}`)) return "risk";
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
  if (role === "HEAD_SA" && project.status === "ACTIVE" && !project.hasPic && project.currentRole === "HEAD_SA") return 1;
  if (project.status === "POSTPONED" || project.status === "ON_HOLD") return 1;
  if (role === "SUPER_ADMIN" && project.status === "ACTIVE" && project.percentage !== null && project.percentage < 25) return 2;
  if (project.status === "ACTIVE") return 3;
  if (project.status === "DRAFT") return 4;
  if (project.status === "COMPLETED" || project.status === "CANCELLED") return 7;
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
