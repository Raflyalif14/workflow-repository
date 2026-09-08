import type { ProjectActivityPage, ProjectActivityTimelineItem } from "@/types/project";

const actionLabels: Record<string, string> = {
  PROJECT_CREATED: "Project Created",
  PROJECT_UPDATED: "Project Updated",
  UPDATE: "Project Updated",
  PROJECT_POSTPONED: "Project Postponed",
  PROJECT_RESUMED: "Project Resumed",
  PROJECT_TIMELINE_UPDATED: "Project Timeline Updated",
  PROJECT_PLAN_SUBMITTED: "Project Plan Submitted",
  PROJECT_PLAN_APPROVED: "Project Plan Approved",
  PROJECT_PLAN_REJECTED: "Project Plan Rejected",
  PIC_ASSIGNED: "PIC Assigned",
  PIC_REASSIGNED: "PIC Reassigned",
  MILESTONE_STARTED: "Milestone Started",
  MILESTONE_SUBMITTED: "Work Submitted",
  MILESTONE_APPROVED: "Milestone Approved",
  MILESTONE_REJECTED: "Milestone Rejected",
  MILESTONE_COMPLETED: "Milestone Completed",
  DEADLINE_CHANGE_REQUESTED: "Deadline Change Requested",
  DEADLINE_APPROVED: "Deadline Approved",
  DEADLINE_REJECTED: "Deadline Rejected",
  PROJECT_COMPLETED: "Project Completed",
};

export const formatActivityAction = (action: string): string => {
  if (action.startsWith("MILESTONE_REVISION")) return "Revision Requested";
  return actionLabels[action] || action.toLowerCase().split("_").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
};

export const flattenActivityPages = (pages?: ProjectActivityPage[]): ProjectActivityTimelineItem[] =>
  (pages || []).flatMap((page) => page.items);
