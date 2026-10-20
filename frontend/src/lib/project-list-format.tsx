import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { isProjectDeliveryCompleted } from "@/lib/project-list-status";
import { translate as translateI18n, translateProjectStatus, translateRole, type TranslationKey } from "@/i18n";
import type { Project, ProjectListStatusFilter, ProjectStatus } from "@/types/project";

export const PROJECT_LIST_STATUS_TABS: Array<{ key: ProjectListStatusFilter; label: TranslationKey }> = [
  { key: "ALL", label: "projectsList.allProjects" },
  { key: "ACTIVE", label: "common.active" },
  { key: "DRAFT", label: "projectStatus.DRAFT" },
  { key: "POSTPONED", label: "projectStatus.POSTPONED" },
  { key: "DELIVERY_COMPLETED", label: "projectsList.deliveryComplete" },
];

export const ROLE_PAGE_COPY: Record<string, { eyebrow: TranslationKey; title: TranslationKey; description: TranslationKey }> = {
  SALES: {
    eyebrow: "projectsList.salesWorkspace",
    title: "projectsList.yourProjects",
    description: "projectsList.salesDescription",
  },
  HEAD_SA: {
    eyebrow: "projectsList.deliveryOversight",
    title: "projectsList.projectOversight",
    description: "projectsList.headDescription",
  },
  SA: {
    eyebrow: "projectsList.deliveryWorkspace",
    title: "projectsList.assignedProjects",
    description: "projectsList.saDescription",
  },
  SUPER_ADMIN: {
    eyebrow: "projectsList.operationsOverview",
    title: "projectsList.projectPortfolio",
    description: "projectsList.adminDescription",
  },
};

export function getStatusBadge(projectStatus: ProjectStatus): ReactNode {
  switch (projectStatus) {
    case "ACTIVE":
      return <Badge variant="default">{translateI18n("common.active")}</Badge>;
    case "DRAFT":
      return <Badge variant="outline">{translateI18n("projectStatus.DRAFT")}</Badge>;
    case "POSTPONED":
      return <Badge variant="warning">{translateI18n("projectStatus.POSTPONED")}</Badge>;
    case "COMPLETED":
      return <Badge variant="success">{translateI18n("projectStatus.COMPLETED")}</Badge>;
    case "WAITING_RESULT":
      return <Badge variant="warning">{translateI18n("copy.waitingResult")}</Badge>;
    case "WON":
      return <Badge variant="success">{translateI18n("projectStatus.WON")}</Badge>;
    case "LOST":
      return <Badge variant="destructive">{translateI18n("projectStatus.LOST")}</Badge>;
    case "CANCELLED":
      return <Badge variant="destructive">{translateI18n("projectStatus.CANCELLED")}</Badge>;
    default:
      return <Badge variant="outline">{translateProjectStatus(projectStatus)}</Badge>;
  }
}

export function getProjectState(project: Project, role: string): string {
  if (project.status === "DRAFT") {
    return translateI18n(project.currentRole === "HEAD_SA" ? "projectsList.awaitingPlan" : "projectsList.planningProgress");
  }
  if (project.status === "ACTIVE" && !project.pic && role === "HEAD_SA") {
    return translateI18n("projectsList.waitingAssignment");
  }
  if (project.status === "ACTIVE") return translateI18n("projectsList.deliveryProgress");
  return translateProjectStatus(project.status);
}

export function getProgressPresentation(project: Project): {
  label: string;
  detail: string | null;
  showDeliveryProgress: boolean;
} {
  if (project.status === "DRAFT") {
    return project.currentRole === "HEAD_SA"
      ? {
          label: translateI18n("projectsList.awaitingPlan"),
          detail: translateI18n("projectsList.headReviewing"),
          showDeliveryProgress: false,
        }
      : {
          label: translateI18n("projectsList.projectPlanning"),
          detail: translateI18n("projectsList.afterApproval"),
          showDeliveryProgress: false,
        };
  }
  if (project.status === "POSTPONED" || project.status === "ON_HOLD") {
    return {
      label: translateI18n("projectsList.deliveryPaused"),
      detail: translateI18n("projectsList.resumeHelp"),
      showDeliveryProgress: false,
    };
  }
  if (project.status === "ACTIVE" || isProjectDeliveryCompleted(project.status)) {
    return {
      label: translateI18n(project.status === "ACTIVE" ? "projectsList.deliveryProgress" : "projectsList.deliveryComplete"),
      detail: null,
      showDeliveryProgress: true,
    };
  }
  return {
    label: translateI18n("projectsList.projectProgress"),
    detail: translateI18n("projectsList.progressUnavailable"),
    showDeliveryProgress: false,
  };
}

export function getProjectPriority(project: Project, role: string): number {
  const priorityFrom = (values: Partial<Record<ProjectStatus, number>>, fallback: number) =>
    values[project.status] ?? fallback;

  if (role === "SALES") {
    return priorityFrom(
      { WAITING_RESULT: 0, DRAFT: 1, ACTIVE: 2, POSTPONED: 3, WON: 4, LOST: 4, COMPLETED: 4, CANCELLED: 5 },
      6
    );
  }
  if (role === "HEAD_SA") {
    if (project.status === "ACTIVE" && !project.pic) return 0;
    return priorityFrom(
      { DRAFT: 1, ACTIVE: 2, POSTPONED: 3, WAITING_RESULT: 4, WON: 5, LOST: 5, COMPLETED: 5, CANCELLED: 6 },
      7
    );
  }
  if (role === "SA") {
    return priorityFrom(
      { ACTIVE: 0, POSTPONED: 1, DRAFT: 2, WAITING_RESULT: 3, WON: 4, LOST: 4, COMPLETED: 4, CANCELLED: 5 },
      6
    );
  }
  if (project.status === "POSTPONED") return 0;
  if (project.status === "ACTIVE" && !project.pic) return 1;
  return priorityFrom({ ACTIVE: 2, DRAFT: 3, WAITING_RESULT: 4, WON: 5, LOST: 5, COMPLETED: 5, CANCELLED: 6 }, 7);
}

export function getResponsibleLabel(project: Project): { role: string; name: string } {
  if (project.pic) {
    return {
      role: translateRole(project.pic.role || "SA"),
      name: project.pic.fullName || project.pic.full_name || translateI18n("projectsList.assignedArchitect"),
    };
  }

  if (project.sales) {
    return {
      role: translateRole(project.sales.role || "SALES"),
      name: project.sales.fullName || project.sales.full_name || translateI18n("projectsList.projectOwner"),
    };
  }

  return { role: translateI18n("copy.responsible"), name: translateI18n("ui.noOwner") };
}
