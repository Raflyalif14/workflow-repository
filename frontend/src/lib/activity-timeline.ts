import type { ProjectActivityPage, ProjectActivityTimelineItem } from "@/types/project";
import { translate, type TranslationKey } from "@/i18n";

const actionLabels: Record<string, TranslationKey> = {
  PROJECT_CREATED: "activity.projectCreated",
  PROJECT_UPDATED: "activity.projectUpdated",
  UPDATE: "activity.projectUpdated",
  PROJECT_POSTPONED: "activity.projectPostponed",
  PROJECT_RESUMED: "activity.projectResumed",
  PROJECT_TIMELINE_UPDATED: "activity.timelineUpdated",
  PROJECT_PLAN_SUBMITTED: "activity.planSubmitted",
  PROJECT_PLAN_APPROVED: "activity.planApproved",
  PROJECT_PLAN_REJECTED: "activity.planRejected",
  PIC_ASSIGNED: "activity.picAssigned",
  PIC_REASSIGNED: "activity.picReassigned",
  MILESTONE_STARTED: "activity.milestoneStarted",
  MILESTONE_COMPLETED: "activity.milestoneCompleted",
  DEADLINE_CHANGE_REQUESTED: "activity.deadlineRequested",
  DEADLINE_APPROVED: "activity.deadlineApproved",
  DEADLINE_REJECTED: "activity.deadlineRejected",
  PROJECT_COMPLETED: "activity.projectCompleted",
};

export const formatActivityAction = (action: string): string => {
  return actionLabels[action] ? translate(actionLabels[action]) : translate("activity.other");
};

export const flattenActivityPages = (pages?: ProjectActivityPage[]): ProjectActivityTimelineItem[] =>
  (pages || []).flatMap((page) => page.items);
