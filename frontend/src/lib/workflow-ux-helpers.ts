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

export interface NextActionInfo {
  title: string;
  description: string;
  actionLabel?: string;
  actionType?:
    | "SUBMIT_PLAN"
    | "RESUBMIT_PLAN"
    | "REVIEW_PLAN"
    | "ASSIGN_PIC"
    | "START_STAGE"
    | "MARK_COMPLETE"
    | "SUBMIT_WORK"
    | "START_REVISION"
    | "REVIEW_SUBMISSION"
    | "REVIEW_DEADLINE"
    | "RESUME_PROJECT"
    | "NONE";
  isWaiting: boolean;
  waitingForRole?: string;
  canPerformAction: boolean;
  targetMilestoneId?: string;
  targetMilestoneName?: string;
}

/**
 * Maps project status to human-friendly label.
 */
export function formatProjectStatusLabel(status: ProjectStatus | string): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "ACTIVE":
      return "Active";
    case "POSTPONED":
      return "Postponed";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
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
      return status;
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
      return "SA Submission";
    default:
      return category.replace(/_/g, " ");
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
 * Checks whether all executable milestones (step > 2) have start date and working days duration set.
 */
export function isTimelineComplete(milestones: ProjectMilestonePhase4[] = []): {
  isComplete: boolean;
  incompleteMilestoneNames: string[];
} {
  const executable = milestones.filter((m) => m.step_order > 2);
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
      title: "Project Postponed",
      description: "Workflow actions are paused by Sales owner.",
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
      const { isComplete, incompleteMilestoneNames } = isTimelineComplete(milestones);
      if (isSalesOwner) {
        return {
          title: "Submit Project Plan",
          description: isComplete
            ? "Timeline setup is complete. Submit the project plan for Head SA review."
            : `Set timeline start dates and durations for: ${incompleteMilestoneNames.slice(0, 2).join(", ")}${incompleteMilestoneNames.length > 2 ? "..." : ""}`,
          actionLabel: isComplete ? "Submit Project Plan" : "Complete Timeline First",
          actionType: isComplete ? "SUBMIT_PLAN" : "NONE",
          isWaiting: false,
          canPerformAction: isComplete,
        };
      }
      return {
        title: "Initial Plan Setup",
        description: "Waiting for Sales owner to configure timeline and submit project plan.",
        isWaiting: true,
        waitingForRole: "SALES",
        canPerformAction: false,
      };
    }

    if (planStatus === "PENDING") {
      if (isHeadSa) {
        return {
          title: "Review Project Plan",
          description: `Review the proposed timeline submitted by ${planApproval.requested_by?.full_name || "Sales"}.`,
          actionLabel: "Approve / Reject Plan",
          actionType: "REVIEW_PLAN",
          isWaiting: false,
          canPerformAction: true,
        };
      }
      return {
        title: "Under Review",
        description: "Waiting for Head SA to review and approve the project plan.",
        isWaiting: true,
        waitingForRole: "HEAD_SA",
        canPerformAction: false,
      };
    }

    if (planStatus === "REJECTED") {
      if (isSalesOwner) {
        return {
          title: "Revise & Resubmit Project Plan",
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
        title: "Plan Revision Required",
        description: "Waiting for Sales owner to revise and resubmit the project plan.",
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
        title: "Workflow Completed",
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
          title: "Assign Solution Architect (PIC)",
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
        title: "PIC Assignment",
        description: "Waiting for Head SA to assign a Solution Architect to this project.",
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
          title: `Review Submission: ${currentMilestone.name}`,
          description: `Solution Architect has submitted work for step ${currentMilestone.step_order}. Review and sign off.`,
          actionLabel: "Review Submission",
          actionType: "REVIEW_SUBMISSION",
          isWaiting: false,
          canPerformAction: true,
          targetMilestoneId: currentMilestone.id,
          targetMilestoneName: currentMilestone.name,
        };
      }
      return {
        title: `Under Review: ${currentMilestone.name}`,
        description: "Waiting for Head SA approval on submitted work.",
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
          title: `Revision Required: ${currentMilestone.name}`,
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
        title: `Revision in Progress: ${currentMilestone.name}`,
        description: `Waiting for assigned Solution Architect (${currentMilestone.pic?.full_name || currentMilestone.pic?.fullName || "SA"}) to revise work.`,
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
            title: `Execute Stage: ${currentMilestone.name}`,
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
          title: `In Progress: ${currentMilestone.name}`,
          description: "Waiting for Sales owner to complete current stage.",
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
            title: `Execute Stage: ${currentMilestone.name}`,
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
          title: `In Progress: ${currentMilestone.name}`,
          description: "Waiting for Head SA to fulfill current stage.",
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
            title: `Submit Work: ${currentMilestone.name}`,
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
          title: `In Progress: ${currentMilestone.name}`,
          description: `Waiting for assigned Solution Architect (${currentMilestone.pic?.full_name || currentMilestone.pic?.fullName || "SA"}) to submit work.`,
          isWaiting: true,
          waitingForRole: "SA",
          canPerformAction: false,
          targetMilestoneId: currentMilestone.id,
          targetMilestoneName: currentMilestone.name,
        };
      }
    }

    // Case 5e: Stage in CREATED state (Needs manual start)
    if (currentMilestone.status === "CREATED") {
      const canStart =
        (stageRole === "SALES" && isSalesOwner) ||
        (stageRole === "HEAD_SA" && isHeadSa) ||
        (stageRole === "SA" && isAssignedPic);

      if (canStart) {
        return {
          title: `Start Stage: ${currentMilestone.name}`,
          description: `Begin execution of step ${currentMilestone.step_order}: ${currentMilestone.name}.`,
          actionLabel: "Start Stage",
          actionType: "START_STAGE",
          isWaiting: false,
          canPerformAction: true,
          targetMilestoneId: currentMilestone.id,
          targetMilestoneName: currentMilestone.name,
        };
      }
      return {
        title: `Upcoming: ${currentMilestone.name}`,
        description: `Waiting for ${stageRole || "responsible role"} to start stage.`,
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
