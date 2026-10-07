import {
  DeadlineApprovalStatus,
  MilestoneDeadlineApproval,
  MilestoneStatus,
  Project,
  ProjectMilestonePhase4,
  ProjectPlanApproval,
  ProjectStatus,
} from "@/types/project";
import { translate } from "@/i18n";
import { isPraTenderDecisionPending, isProjectClosedAtPraTender } from "./phase-review";
import { isMilestoneCompleted } from "./milestone-ui-state";
import { formatMilestoneDate, isInitialSubmissionBeforeEffectiveStart } from "./dates";
import { translateMilestoneStatus, translateProjectStatus, translateRole } from "@/i18n";

export { formatMilestoneDate, isInitialSubmissionBeforeEffectiveStart } from "./dates";

export type ActorRole = "SALES" | "HEAD_SA" | "SA" | "SUPER_ADMIN" | "GUEST" | string;

export interface CurrentActor {
  id?: string;
  role?: ActorRole;
  fullName?: string;
}

export type TimelineWorkflowMode = "LEGACY" | "OPERATIONAL_V2";

export function resolveTimelineWorkflowMode(
  workflowModel?: string | null,
  workflowVersion?: number | null
): TimelineWorkflowMode | null {
  if (workflowModel === "LEGACY" && workflowVersion === 1) return "LEGACY";
  if (workflowModel === "OPERATIONAL_V2" && workflowVersion === 2) return "OPERATIONAL_V2";
  return null;
}

export function getTimelinePlanningMilestones(
  milestones: ProjectMilestonePhase4[] = [],
  workflowModel?: string | null,
  workflowVersion?: number | null
): ProjectMilestonePhase4[] {
  const workflowMode = resolveTimelineWorkflowMode(workflowModel, workflowVersion);
  if (!workflowMode) return [];

  return workflowMode === "OPERATIONAL_V2"
    ? milestones
    : milestones.filter((milestone) => milestone.step_order > 2);
}

export function isDeadlineChangeStepEligible(
  stepOrder: number,
  workflowModel?: string | null,
  workflowVersion?: number | null
): boolean {
  const workflowMode = resolveTimelineWorkflowMode(workflowModel, workflowVersion);
  return workflowMode === "OPERATIONAL_V2" || (workflowMode === "LEGACY" && stepOrder > 2);
}

export interface NextActionInfo {
  title: string;
  description: string;
  actionLabel?: string;
  actionType?:
    | "SUBMIT_PLAN"
    | "RESUBMIT_PLAN"
    | "REVIEW_PLAN"
    | "ASSIGN_PIC"
    | "MARK_COMPLETE"
    | "SUBMIT_WORK"
    | "REVIEW_DEADLINE"
    | "RESUME_PROJECT"
    | "SETUP_TIMELINE"
    | "CONTINUE_PHASE"
    | "NONE";
  isWaiting: boolean;
  waitingForRole?: string;
  canPerformAction: boolean;
  targetMilestoneId?: string;
  targetMilestoneName?: string;
}

export function formatHumanReadableLabel(value?: string | null): string {
  return (value || "Unknown")
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ") || "Unknown";
}

/**
 * Formats persisted role values for human-facing workflow guidance.
 */
export function formatActorRoleLabel(role?: string): string {
  return translateRole(role || "GUEST");
}

/**
 * Maps an actionable workflow state to an existing Project Detail surface.
 */
export function resolveNextActionTargetId(nextAction: NextActionInfo): string | null {
  switch (nextAction.actionType) {
    case "CONTINUE_PHASE":
      return "project-phase-panel";
    case "SETUP_TIMELINE":
      return "project-timeline";
    case "REVIEW_PLAN":
      return "project-plan-review";
    case "ASSIGN_PIC":
      return "project-pic-assignment";
    case "MARK_COMPLETE":
    case "SUBMIT_WORK":
    case "REVIEW_DEADLINE":
      return nextAction.targetMilestoneId
        ? `project-milestone-${nextAction.targetMilestoneId}`
        : null;
    default:
      return null;
  }
}

/**
 * Maps project status to human-friendly label.
 */
export function formatProjectStatusLabel(status: ProjectStatus | string): string {
  return translateProjectStatus(status);
}

/**
 * Maps milestone status to human-friendly label.
 */
export function formatMilestoneStatusLabel(status: MilestoneStatus | string): string {
  return translateMilestoneStatus(status);
}

/**
 * Maps approval category / type to human-friendly label.
 */
export function getApprovalTypeDisplay(category: string): string {
  switch (category) {
    case "PROJECT_PLAN":
      return "Project Plan";
    case "DEADLINE":
    case "DEADLINE_CHANGE":
      return "Deadline Change";
    default:
      return formatHumanReadableLabel(category);
  }
}

/**
 * Resolves the currently active / blocking milestone in the workflow progression.
 */
export function resolveCurrentStage(
  milestones: ProjectMilestonePhase4[] = []
): ProjectMilestonePhase4 | null {
  if (!milestones.length) return null;

  const sorted = [...milestones].sort((a, b) => a.step_order - b.step_order);

  // 1. Look for milestone currently in active progress / submitted / rejected
  const activeMilestone = sorted.find((m) =>
    ["IN_PROGRESS", "SUBMITTED", "REJECTED"].includes(m.status)
  );
  if (activeMilestone) return activeMilestone;

  // 2. Otherwise find the first uncompleted (CREATED) milestone
  const nextCreated = sorted.find((m) => !isMilestoneCompleted(m));
  if (nextCreated) return nextCreated;

  // 3. All milestones completed
  return null;
}

/**
 * Checks whether every model-required timeline milestone has start date and working days duration set.
 */
export function isTimelineComplete(
  milestones: ProjectMilestonePhase4[] = [],
  workflowModel?: string | null,
  workflowVersion?: number | null
): {
  isComplete: boolean;
  incompleteMilestoneNames: string[];
} {
  const workflowMode = resolveTimelineWorkflowMode(workflowModel, workflowVersion);
  if (!workflowMode) {
    return { isComplete: false, incompleteMilestoneNames: ["Unsupported scenario workflow model"] };
  }

  const executable = getTimelinePlanningMilestones(milestones, workflowModel, workflowVersion);
  if (!executable.length) {
    return { isComplete: false, incompleteMilestoneNames: ["No executable milestones found"] };
  }

  const incomplete = executable.filter((m) => {
    const hasStart = Boolean(m.start_date);
    const hasDuration =
      typeof m.duration_working_days === "number" &&
      Number.isInteger(m.duration_working_days) &&
      m.duration_working_days > 0;
    return !hasStart || !hasDuration;
  });

  return {
    isComplete: incomplete.length === 0,
    incompleteMilestoneNames: incomplete.map((m) => m.name),
  };
}

/**
 * Resolves the role-aware Next Action for a project.
 */
export function resolveNextAction(
  project: Project,
  milestones: ProjectMilestonePhase4[] = [],
  planApproval?: ProjectPlanApproval | null,
  actor?: CurrentActor,
  context?: { activeRevisionMilestoneId?: string | null }
): NextActionInfo {
  if (isPraTenderDecisionPending(project)) {
    return { title: translate('projectPhase.praCompleted'), description: translate('projectPhase.question'),
      actionLabel: translate('projectPhase.decisionTask'), actionType: 'CONTINUE_PHASE' as const, isWaiting: actor?.role !== 'SALES' || actor.id !== project.sales_id, canPerformAction: actor?.role === 'SALES' && actor.id === project.sales_id && !project.phases?.some(phase => phase.phase_key === 'ON_SUBMISSION_TENDER') };
  }
  const role = actor?.role || "GUEST";
  const isSalesOwner = role === "SALES" && project.sales_id === actor?.id;
  const isHeadSa = role === "HEAD_SA";

  // ─── 1. POSTPONED Project ───
  if (project.status === "POSTPONED" || project.is_postponed) {
    if (isSalesOwner) {
      return {
        title: translate("nextAction.postponed"),
        description: translate("nextAction.postponedHelp"),
        actionLabel: translate("nextAction.resume"),
        actionType: "RESUME_PROJECT",
        isWaiting: false,
        canPerformAction: true,
      };
    }
      return {
        title: translate("nextAction.paused"),
        description: translate("nextAction.pausedHelp"),
      isWaiting: true,
      waitingForRole: "SALES",
      canPerformAction: false,
    };
  }

  // ─── 2. COMPLETED Project ───
  if (project.status === "COMPLETED") {
    return {
      title: translate(isProjectClosedAtPraTender(project) ? "projectPhase.closed" : "nextAction.workflowComplete"),
      description: translate(isProjectClosedAtPraTender(project) ? "projectPhase.closedHelp" : "nextAction.workflowCompleteHelp"),
      actionType: "NONE",
      isWaiting: false,
      canPerformAction: false,
    };
  }

  // ─── 3. CANCELLED Project ───
  if (project.status === "CANCELLED") {
    return {
      title: translate("nextAction.cancelled"),
      description: translate("nextAction.cancelledHelp"),
      actionType: "NONE",
      isWaiting: false,
      canPerformAction: false,
    };
  }

  // ─── 4. DRAFT Project ───
  if (project.status === "DRAFT") {
    const planStatus = planApproval?.status;

    if (!planApproval || planStatus === undefined) {
      const { isComplete, incompleteMilestoneNames } = isTimelineComplete(
        milestones,
        project.scenario?.workflow_model,
        project.scenario?.workflow_version
      );
      if (isSalesOwner) {
        return {
          title: translate(isComplete ? "nextAction.submitPlan" : "nextAction.setupPlan"),
          description: isComplete
            ? translate("nextAction.timelineReady")
            : translate("nextAction.timelineIncomplete", { names: `${incompleteMilestoneNames.slice(0, 2).join(", ")}${incompleteMilestoneNames.length > 2 ? "..." : ""}` }),
          actionLabel: translate(isComplete ? "nextAction.submitPlanAction" : "nextAction.setupTimeline"),
          actionType: isComplete ? "SUBMIT_PLAN" : "SETUP_TIMELINE",
          isWaiting: false,
          canPerformAction: true,
        };
      }
      return {
        title: translate("nextAction.planPreparing"),
        description: translate("nextAction.planPreparingHelp"),
        isWaiting: true,
        waitingForRole: "SALES",
        canPerformAction: false,
      };
    }

    if (planStatus === "PENDING") {
      if (isHeadSa) {
        return {
          title: translate("nextAction.reviewPlan"),
          description: translate("nextAction.reviewPlanHelp", { name: planApproval.requested_by?.full_name || "Sales" }),
          actionLabel: translate("nextAction.reviewPlanAction"),
          actionType: "REVIEW_PLAN",
          isWaiting: false,
          canPerformAction: true,
        };
      }
      return {
        title: translate("nextAction.planUnderReview"),
        description: translate("nextAction.planUnderReviewHelp"),
        isWaiting: true,
        waitingForRole: "HEAD_SA",
        canPerformAction: false,
      };
    }

    if (planStatus === "REJECTED") {
      if (isSalesOwner) {
        return {
          title: translate("nextAction.revisePlan"),
          description: planApproval.review_note
            ? translate("nextAction.reviseFeedback", { feedback: planApproval.review_note })
            : translate("nextAction.reviseHelp"),
          actionLabel: translate("nextAction.resubmitPlan"),
          actionType: "RESUBMIT_PLAN",
          isWaiting: false,
          canPerformAction: true,
        };
      }
      return {
        title: translate("nextAction.revisionProgress"),
        description: translate("nextAction.revisionProgressHelp"),
        isWaiting: true,
        waitingForRole: "SALES",
        canPerformAction: false,
      };
    }
  }

  // ─── 5. ACTIVE Project ───
  if (project.status === "ACTIVE") {
    const currentMilestone = resolveCurrentStage(milestones);
    if (!currentMilestone) {
      return {
        title: translate("nextAction.projectComplete"),
        description: translate("nextAction.projectCompleteHelp"),
        actionType: "NONE",
        isWaiting: false,
        canPerformAction: false,
      };
    }

    const stageRole = currentMilestone.workflow_stage?.default_role;
    const isAssignPic = currentMilestone.name.trim().toLowerCase() === "assign pic";
    const isAssignedPic =
      (role === "SA" || role === "HEAD_SA") && currentMilestone.pic_id === actor?.id;

    // Case 5a: Assign PIC stage
    if (isAssignPic && currentMilestone.status === "IN_PROGRESS") {
      if (isHeadSa) {
        return {
          title: translate("nextAction.assignLead"),
          description: translate("nextAction.assignLeadHelp", { name: project.name }),
          actionLabel: translate("projectAction.assignPic"),
          actionType: "ASSIGN_PIC",
          isWaiting: false,
          canPerformAction: true,
          targetMilestoneId: currentMilestone.id,
          targetMilestoneName: currentMilestone.name,
        };
      }
      return {
        title: translate("nextAction.assignmentPending"),
        description: translate("nextAction.assignmentPendingHelp"),
        isWaiting: true,
        waitingForRole: "HEAD_SA",
        canPerformAction: false,
        targetMilestoneId: currentMilestone.id,
        targetMilestoneName: currentMilestone.name,
      };
    }

    // Case 5d: Stage in IN_PROGRESS state
    if (currentMilestone.status === "IN_PROGRESS") {
      if (stageRole === "SALES") {
        if (isSalesOwner) {
          return {
            title: translate("nextAction.completeStage", { name: currentMilestone.name }),
            description: translate("nextAction.completeSalesHelp", { name: currentMilestone.name }),
            actionLabel: translate("nextAction.markComplete"),
            actionType: "MARK_COMPLETE",
            isWaiting: false,
            canPerformAction: true,
            targetMilestoneId: currentMilestone.id,
            targetMilestoneName: currentMilestone.name,
          };
        }
        return {
          title: translate("nextAction.currentWork", { name: currentMilestone.name }),
          description: translate("nextAction.salesWorking"),
          isWaiting: true,
          waitingForRole: "SALES",
          canPerformAction: false,
          targetMilestoneId: currentMilestone.id,
          targetMilestoneName: currentMilestone.name,
        };
      }

      if (stageRole === "HEAD_SA") {
        if (isHeadSa) {
          return {
            title: translate("nextAction.completeStage", { name: currentMilestone.name }),
            description: translate("nextAction.completeHeadHelp", { name: currentMilestone.name }),
            actionLabel: translate("nextAction.markComplete"),
            actionType: "MARK_COMPLETE",
            isWaiting: false,
            canPerformAction: true,
            targetMilestoneId: currentMilestone.id,
            targetMilestoneName: currentMilestone.name,
          };
        }
        return {
          title: translate("nextAction.currentWork", { name: currentMilestone.name }),
          description: translate("nextAction.headWorking"),
          isWaiting: true,
          waitingForRole: "HEAD_SA",
          canPerformAction: false,
          targetMilestoneId: currentMilestone.id,
          targetMilestoneName: currentMilestone.name,
        };
      }

      if (stageRole === "SA") {
        if (isAssignedPic) {
          const isBeforeStart = isInitialSubmissionBeforeEffectiveStart(
            currentMilestone.start_date,
            context?.activeRevisionMilestoneId === currentMilestone.id
          );

          if (isBeforeStart) {
            return {
              title: translate("nextAction.upcomingStage", { name: currentMilestone.name }),
              description: translate("nextAction.startsOn", { date: formatMilestoneDate(currentMilestone.start_date) }),
              actionLabel: translate("nextAction.viewOutputs"),
              actionType: "SUBMIT_WORK",
              isWaiting: true,
              waitingForRole: "SA",
              canPerformAction: false,
              targetMilestoneId: currentMilestone.id,
              targetMilestoneName: currentMilestone.name,
            };
          }

          return {
            title: translate("nextAction.workOutputs", { name: currentMilestone.name }),
            description: translate("nextAction.workOutputsHelp"),
            actionLabel: translate("nextAction.openOutputs"),
            actionType: "SUBMIT_WORK",
            isWaiting: false,
            canPerformAction: true,
            targetMilestoneId: currentMilestone.id,
            targetMilestoneName: currentMilestone.name,
          };
        }
      return {
        title: translate("nextAction.currentWork", { name: currentMilestone.name }),
        description: translate("nextAction.picWorking", { name: currentMilestone.pic?.full_name || currentMilestone.pic?.fullName || translate("role.SA") }),
          isWaiting: true,
          waitingForRole: "SA",
          canPerformAction: false,
          targetMilestoneId: currentMilestone.id,
          targetMilestoneName: currentMilestone.name,
        };
      }
    }

    // Case 5e: Upcoming stage awaiting automatic progression.
    if (currentMilestone.status === "CREATED") {
      return {
        title: translate("nextAction.waitingPrevious", { name: currentMilestone.name }),
        description: translate("nextAction.waitingPreviousHelp"),
        isWaiting: true,
        waitingForRole: stageRole || "responsible role",
        canPerformAction: false,
        targetMilestoneId: currentMilestone.id,
        targetMilestoneName: currentMilestone.name,
      };
    }
  }

  return {
    title: translate("nextAction.overview"),
    description: translate("nextAction.overviewHelp"),
    actionType: "NONE",
    isWaiting: false,
    canPerformAction: false,
  };
}
