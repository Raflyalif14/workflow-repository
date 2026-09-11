import {
  DeadlineApprovalStatus,
  MilestoneDeadlineApproval,
  MilestoneStatus,
  MilestoneSubmissionApproval,
  Project,
  ProjectMilestonePhase4,
  ProjectPlanApproval,
  ProjectStatus,
} from "@/types/project";
import { isMilestoneCompleted } from "./milestone-ui-state";

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
    | "START_REVISION"
    | "REVIEW_SUBMISSION"
    | "REVIEW_DEADLINE"
    | "RESUME_PROJECT"
    | "SETUP_TIMELINE"
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
  switch (role) {
    case "SALES":
      return "Sales";
    case "HEAD_SA":
      return "Head SA";
    case "SA":
      return "Solution Architect";
    case "SUPER_ADMIN":
      return "Super Admin";
    case "GUEST":
      return "Guest";
    default:
      return role ? formatHumanReadableLabel(role) : "Guest";
  }
}

/**
 * Maps an actionable workflow state to an existing Project Detail surface.
 */
export function resolveNextActionTargetId(nextAction: NextActionInfo): string | null {
  switch (nextAction.actionType) {
    case "SETUP_TIMELINE":
      return "project-timeline";
    case "REVIEW_PLAN":
      return "project-plan-review";
    case "ASSIGN_PIC":
      return "project-pic-assignment";
    case "MARK_COMPLETE":
    case "SUBMIT_WORK":
    case "START_REVISION":
    case "REVIEW_SUBMISSION":
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
  switch (status) {
    case "DRAFT":
      return "Planning";
    case "ACTIVE":
      return "Active";
    case "POSTPONED":
      return "Postponed";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return formatHumanReadableLabel(status);
  }
}

/**
 * Maps milestone status to human-friendly label.
 */
export function formatMilestoneStatusLabel(status: MilestoneStatus | string): string {
  switch (status) {
    case "CREATED":
      return "Not Started";
    case "IN_PROGRESS":
      return "In Progress";
    case "SUBMITTED":
      return "Under Review";
    case "REJECTED":
      return "Revision Required";
    case "COMPLETED":
    case "APPROVED":
      return "Completed";
    default:
      return formatHumanReadableLabel(status);
  }
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
    case "SUBMISSION":
    case "MILESTONE_SUBMISSION":
      return "Work Submission";
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
  actor?: CurrentActor
): NextActionInfo {
  const role = actor?.role || "GUEST";
  const isSalesOwner = role === "SALES" && project.sales_id === actor?.id;
  const isHeadSa = role === "HEAD_SA";

  // ─── 1. POSTPONED Project ───
  if (project.status === "POSTPONED" || project.is_postponed) {
    if (isSalesOwner) {
      return {
        title: "Project Postponed",
        description: "Workflow actions are paused. You can resume this project when ready.",
        actionLabel: "Resume Project",
        actionType: "RESUME_PROJECT",
        isWaiting: false,
        canPerformAction: true,
      };
    }
      return {
        title: "Project is paused",
        description: "Sales can resume the project when work is ready to continue.",
      isWaiting: true,
      waitingForRole: "SALES",
      canPerformAction: false,
    };
  }

  // ─── 2. COMPLETED Project ───
  if (project.status === "COMPLETED") {
    return {
      title: "Workflow Completed",
      description: "All project milestones and stages have been successfully finished.",
      actionType: "NONE",
      isWaiting: false,
      canPerformAction: false,
    };
  }

  // ─── 3. CANCELLED Project ───
  if (project.status === "CANCELLED") {
    return {
      title: "Project Cancelled",
      description: "This project has been cancelled.",
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
          title: isComplete ? "Submit the plan for review" : "Set up the project plan",
          description: isComplete
            ? "Timeline setup is complete. Submit the project plan for Head SA review."
            : `Add a start date and duration for each required stage, beginning with ${incompleteMilestoneNames.slice(0, 2).join(", ")}${incompleteMilestoneNames.length > 2 ? "..." : ""}.`,
          actionLabel: isComplete ? "Submit Project Plan" : "Set up timeline",
          actionType: isComplete ? "SUBMIT_PLAN" : "SETUP_TIMELINE",
          isWaiting: false,
          canPerformAction: true,
        };
      }
      return {
        title: "Project plan is being prepared",
        description: "Sales is setting up the timeline before submitting it for review.",
        isWaiting: true,
        waitingForRole: "SALES",
        canPerformAction: false,
      };
    }

    if (planStatus === "PENDING") {
      if (isHeadSa) {
        return {
          title: "Review the project plan",
          description: `Review the proposed timeline submitted by ${planApproval.requested_by?.full_name || "Sales"}.`,
          actionLabel: "Approve / Reject Plan",
          actionType: "REVIEW_PLAN",
          isWaiting: false,
          canPerformAction: true,
        };
      }
      return {
        title: "Plan under review",
        description: "Head SA is reviewing the proposed timeline and will share the next decision.",
        isWaiting: true,
        waitingForRole: "HEAD_SA",
        canPerformAction: false,
      };
    }

    if (planStatus === "REJECTED") {
      if (isSalesOwner) {
        return {
          title: "Revise the project plan",
          description: planApproval.review_note
            ? `Head SA Feedback: "${planApproval.review_note}". Please update timeline and resubmit.`
            : "Project plan was rejected. Please adjust the timeline and resubmit.",
          actionLabel: "Resubmit Project Plan",
          actionType: "RESUBMIT_PLAN",
          isWaiting: false,
          canPerformAction: true,
        };
      }
      return {
        title: "Plan revision in progress",
        description: "Sales is updating the timeline before resubmitting the project plan.",
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
        title: "Project completed",
        description: "All milestones completed.",
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
          title: "Assign the project lead",
          description: `Assign an eligible Solution Architect to project '${project.name}'.`,
          actionLabel: "Assign PIC",
          actionType: "ASSIGN_PIC",
          isWaiting: false,
          canPerformAction: true,
          targetMilestoneId: currentMilestone.id,
          targetMilestoneName: currentMilestone.name,
        };
      }
      return {
        title: "Project lead assignment is pending",
        description: "Head SA needs to assign a Solution Architect before work can begin.",
        isWaiting: true,
        waitingForRole: "HEAD_SA",
        canPerformAction: false,
        targetMilestoneId: currentMilestone.id,
        targetMilestoneName: currentMilestone.name,
      };
    }

    // Case 5b: Stage in SUBMITTED state (Awaiting Head SA review)
    if (currentMilestone.status === "SUBMITTED") {
      if (isHeadSa) {
        return {
          title: `Review work submission: ${currentMilestone.name}`,
          description: "Review the submitted work and decide whether it can move forward.",
          actionLabel: "Review Submission",
          actionType: "REVIEW_SUBMISSION",
          isWaiting: false,
          canPerformAction: true,
          targetMilestoneId: currentMilestone.id,
          targetMilestoneName: currentMilestone.name,
        };
      }
      return {
        title: `Work submission under review: ${currentMilestone.name}`,
        description: "Head SA is reviewing the submitted work.",
        isWaiting: true,
        waitingForRole: "HEAD_SA",
        canPerformAction: false,
        targetMilestoneId: currentMilestone.id,
        targetMilestoneName: currentMilestone.name,
      };
    }

    // Case 5c: Stage in REJECTED state (Needs SA revision)
    if (currentMilestone.status === "REJECTED") {
      if (stageRole === "SA" && isAssignedPic) {
        return {
          title: `Revise your submission: ${currentMilestone.name}`,
          description: "Submission was rejected by Head SA. Start revision and make necessary updates.",
          actionLabel: "Start Revision",
          actionType: "START_REVISION",
          isWaiting: false,
          canPerformAction: true,
          targetMilestoneId: currentMilestone.id,
          targetMilestoneName: currentMilestone.name,
        };
      }
      return {
        title: `Work revision in progress: ${currentMilestone.name}`,
        description: `The assigned Solution Architect (${currentMilestone.pic?.full_name || currentMilestone.pic?.fullName || "Solution Architect"}) is revising the work.`,
        isWaiting: true,
        waitingForRole: "SA",
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
            title: `Complete this stage: ${currentMilestone.name}`,
            description: `Complete the requirements for '${currentMilestone.name}' and mark as complete.`,
            actionLabel: "Mark Complete",
            actionType: "MARK_COMPLETE",
            isWaiting: false,
            canPerformAction: true,
            targetMilestoneId: currentMilestone.id,
            targetMilestoneName: currentMilestone.name,
          };
        }
        return {
          title: `Current work: ${currentMilestone.name}`,
          description: "Sales is completing the current stage.",
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
            title: `Complete this stage: ${currentMilestone.name}`,
            description: `Perform required actions for '${currentMilestone.name}'.`,
            actionLabel: "Mark Complete",
            actionType: "MARK_COMPLETE",
            isWaiting: false,
            canPerformAction: true,
            targetMilestoneId: currentMilestone.id,
            targetMilestoneName: currentMilestone.name,
          };
        }
        return {
          title: `Current work: ${currentMilestone.name}`,
          description: "Head SA is completing the current stage.",
          isWaiting: true,
          waitingForRole: "HEAD_SA",
          canPerformAction: false,
          targetMilestoneId: currentMilestone.id,
          targetMilestoneName: currentMilestone.name,
        };
      }

      if (stageRole === "SA") {
        if (isAssignedPic) {
          return {
            title: `Submit work: ${currentMilestone.name}`,
            description: `Complete your deliverables for '${currentMilestone.name}' and submit for Head SA review.`,
            actionLabel: "Submit Work",
            actionType: "SUBMIT_WORK",
            isWaiting: false,
            canPerformAction: true,
            targetMilestoneId: currentMilestone.id,
            targetMilestoneName: currentMilestone.name,
          };
        }
      return {
        title: `Current work: ${currentMilestone.name}`,
        description: `The assigned Solution Architect (${currentMilestone.pic?.full_name || currentMilestone.pic?.fullName || "Solution Architect"}) is preparing the work submission.`,
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
        title: `Waiting for the previous milestone: ${currentMilestone.name}`,
        description: "This stage starts automatically after the previous work is completed.",
        isWaiting: true,
        waitingForRole: stageRole || "responsible role",
        canPerformAction: false,
        targetMilestoneId: currentMilestone.id,
        targetMilestoneName: currentMilestone.name,
      };
    }
  }

  return {
    title: "Workflow Overview",
    description: "Review project milestones and documents.",
    actionType: "NONE",
    isWaiting: false,
    canPerformAction: false,
  };
}
