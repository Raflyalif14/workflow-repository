"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock,
  Download,
  FileCheck2,
  PauseCircle,
  RotateCcw,
  Send,
  UploadCloud,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { AssignmentHistoryCard } from "@/components/projects/assignment-history-card";
import { PicAssignmentCard } from "@/components/projects/pic-assignment-card";
import { MilestoneSubmissionDialog } from "@/components/projects/milestone-submission-dialog";
import { MilestoneContributionsPanel } from "@/components/milestones/milestone-contributions-panel";
import { MilestoneSubmissionReviewDialog } from "@/components/milestones/milestone-submission-review-dialog";
import { MilestoneSubmissionHistoryPanel } from "@/components/milestones/milestone-submission-history-panel";
import { PostponeProjectDialog } from "@/components/projects/postpone-project-dialog";
import { ProjectDeletionDangerZone } from "@/components/projects/project-deletion-danger-zone";
import { ProjectTimelineEditor } from "@/components/projects/project-timeline-editor";
import { SalesMilestoneDocumentUploadDialog } from "@/components/projects/sales-milestone-document-upload-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DeadlineHealthPresentation,
  canReadSubmissionPackageHistory,
  getDeadlineHealthPresentation,
  getEffectiveDeadline,
  getLatestSubmissionApproval,
  getMilestoneDisplayStatus,
  hasEffectiveDeadline,
  isMilestoneCompleted,
} from "@/lib/milestone-ui-state";
import {
  formatActorRoleLabel,
  formatHumanReadableLabel,
  formatMilestoneStatusLabel,
  formatProjectStatusLabel,
  isDeadlineChangeStepEligible,
  resolveCurrentStage,
  resolveNextAction,
  resolveNextActionTargetId,
} from "@/lib/workflow-ux-helpers";
import {
  canAddMilestoneContribution,
  canPromoteMilestoneContributions,
  canViewMilestoneContributions,
} from "@/lib/milestone-contribution-access";
import {
  useProject,
  useProjectActivities,
  useProjectMilestones,
  useProjectPlanApproval,
  useProjectProgress,
  useResumeProject,
  useReviewProjectPlan,
  useSolutionArchitects,
  useSubmitProjectPlan,
} from "@/hooks/use-projects";
import { flattenActivityPages, formatActivityAction } from "@/lib/activity-timeline";
import { useDocumentDownloadUrl, useDocuments } from "@/hooks/use-documents";
import { useProjectIntake, useProjectIntakeDownloadUrl } from "@/hooks/use-project-intake";
import {
  MilestoneApprovalState,
  useCompleteMilestone,
  useMilestoneApprovalStates,
  useMilestoneDeadlineStatus,
  useReviewDeadlineApproval,
  useReviewSubmissionApproval,
  useSaveMilestoneDeadline,
  useStartMilestoneRevision,
} from "@/hooks/use-milestone-workflow";
import {
  DeadlineApprovalStatus,
  MilestoneSubmissionApproval,
  Project,
  ProjectMilestonePhase4,
  ProjectPlanApproval,
} from "@/types/project";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: project, isLoading: projectLoading, isError } = useProject(id);
  const { data: milestones = [], isLoading: milestonesLoading } = useProjectMilestones(id);
  const { data: progress } = useProjectProgress(id);
  const { data: planApproval } = useProjectPlanApproval(id);
  const approvalQueries = useMilestoneApprovalStates(milestones, Boolean(milestones.length));
  const submitProjectPlan = useSubmitProjectPlan(id);
  const resumeProject = useResumeProject();

  const [postponeOpen, setPostponeOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const approvalByMilestone = useMemo(() => {
    const states = new Map<string, MilestoneApprovalState>();
    milestones.forEach((milestone, index) => {
      const state = approvalQueries[index]?.data;
      if (state) states.set(milestone.id, state);
    });
    return states;
  }, [approvalQueries, milestones]);

  if (projectLoading) {
    return (
      <div className="container py-16 space-y-6">
        <div className="h-8 w-32 bg-muted/40 rounded animate-pulse" />
        <div className="h-28 rounded-xl bg-muted/30 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />
          <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />
          <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="container py-16 text-center space-y-3">
        <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
        <h2 className="text-lg font-bold text-foreground">Project Not Found</h2>
        <p className="text-xs text-muted-foreground">The requested project does not exist or you do not have permission.</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/projects")}>
          Back to Projects
        </Button>
      </div>
    );
  }

  const isSalesOwner = user?.role === "SALES" && project.sales_id === user.id;
  const isHeadSa = user?.role === "HEAD_SA";
  const isDraft = project.status === "DRAFT";
  const isActive = project.status === "ACTIVE";
  const isPostponed = project.status === "POSTPONED" || project.is_postponed;
  const isCompleted = project.status === "COMPLETED";
  const isHeadSaPlanReviewWorkspace =
    isHeadSa && isDraft && planApproval?.status === "PENDING";

  const currentStageMilestone = resolveCurrentStage(milestones);
  const assignPicIsCurrent = milestones.some(
    (m) => m.status === "IN_PROGRESS" && m.name.trim().toLowerCase() === "assign pic"
  );

  const nextAction = resolveNextAction(project, milestones, planApproval, {
    id: user?.id,
    role: user?.role,
    fullName: user?.fullName,
  });
  const showPlanCardSubmit =
    isSalesOwner &&
    planApproval?.status !== "PENDING" &&
    !["SETUP_TIMELINE", "SUBMIT_PLAN", "RESUBMIT_PLAN"].includes(nextAction.actionType || "");
  const isHeadSaWaitingForSalesPlan =
    isHeadSa &&
    isDraft &&
    !planApproval &&
    nextAction.isWaiting &&
    nextAction.waitingForRole === "SALES";
  const projectPicNotice =
    !project.pic && (isActive || isCompleted)
      ? isActive && assignPicIsCurrent
        ? { message: "Assign a delivery lead to begin the next stage.", tone: "neutral" as const }
        : { message: "A solution architect has not been assigned to this delivery project.", tone: "warning" as const }
      : undefined;
  const shouldShowProjectPic = Boolean(project.pic) || isActive || isCompleted;

  const submitPlan = async () => {
    setError("");
    setMessage("");
    try {
      await submitProjectPlan.mutateAsync();
      setMessage("Project plan submitted for Head SA review.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit project plan.");
    }
  };

  const resume = async () => {
    setError("");
    setMessage("");
    try {
      await resumeProject.mutateAsync(project.id);
      setMessage("Project resumed successfully.");
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Failed to resume project.");
    }
  };

  const handleNextAction = () => {
    switch (nextAction.actionType) {
      case "SUBMIT_PLAN":
      case "RESUBMIT_PLAN":
        void submitPlan();
        return;
      case "RESUME_PROJECT":
        void resume();
        return;
      default: {
        const targetId = resolveNextActionTargetId(nextAction);
        if (!targetId || typeof document === "undefined") return;

        const target = document.getElementById(targetId);
        if (!target) return;

        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.focus({ preventScroll: true });
      }
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Back Button */}
      <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => router.push("/projects")}>
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Projects</span>
      </Button>

      {/* Header */}
      <header className="flex flex-col gap-4 pb-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-4xl space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge status={project.status} />
          </div>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{project.name}</h1>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
            Customer: <strong className="text-foreground">{project.customer}</strong> • Scenario:{" "}
            <strong className="text-foreground">{project.scenario?.name || "No scenario"}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Sales owner: <strong className="text-foreground">{project.sales?.full_name || project.sales?.fullName || "Unassigned"}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {isActive && isSalesOwner && (
            <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg" onClick={() => setPostponeOpen(true)}>
              <PauseCircle className="h-4 w-4 text-amber-400" />
              <span>Postpone Project</span>
            </Button>
          )}
        </div>
      </header>

      {/* Global Alerts */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* ─── Next Action Card ─── */}
      <NextActionCard
        nextAction={nextAction}
        onAction={handleNextAction}
        isSubmittingPlan={submitProjectPlan.isPending}
        isResuming={resumeProject.isPending}
      />

      {/* ─── Postponed Banner ─── */}
      {isPostponed && (
        <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-amber-400">
            <PauseCircle className="h-5 w-5 shrink-0" />
            <span>Project Postponed</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {project.postpone_reason
              ? `Reason: "${project.postpone_reason}"`
              : "This project has been placed on hold by the Sales owner."}
            {" "}Workflow actions and milestone submissions are temporarily disabled while the project is postponed.
          </p>
          {project.postponed_at && (
            <p className="text-[11px] font-mono text-muted-foreground">
              Postponed on: {formatDateTime(project.postponed_at)}
            </p>
          )}
        </div>
      )}

      {/* ─── Completed Success Banner ─── */}
      {isCompleted && (
        <div className="flex flex-col gap-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-emerald-400">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>Project Completed — 100%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              All workflow milestones have been fulfilled and approved. No further actions are required.
            </p>
          </div>
          <Badge variant="success" className="self-start px-3 py-1 text-xs sm:self-auto">
            {formatProjectStatusLabel(project.status)}
          </Badge>
        </div>
      )}

      {/* ─── Draft Project Lifecycle Tracker ─── */}
      {isDraft && (
        <DraftProgressionTracker
          planApproval={planApproval}
          milestones={milestones}
        />
      )}

      {isHeadSaPlanReviewWorkspace && (
        <section
          id="project-plan-review"
          tabIndex={-1}
          className="scroll-mt-20 space-y-5 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background"
          aria-labelledby="project-plan-review-heading"
        >
          <div className="max-w-2xl space-y-1 border-b border-border/60 pb-4">
            <h2 id="project-plan-review-heading" className="text-xl font-semibold text-foreground">
              Review project plan
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Review the intake evidence and proposed schedule before making a decision.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-6">
              <ProjectIntakeSection projectId={project.id} />
              <ProjectTimelineEditor
                projectId={id}
                milestones={milestones}
                canEdit={false}
                workflowModel={project.scenario?.workflow_model}
                workflowVersion={project.scenario?.workflow_version}
              />
            </div>

            <div className="lg:sticky lg:top-20 lg:self-start">
              <ProjectPlanCard
                project={project}
                approval={planApproval}
                canSubmit={false}
                canReview
                onSubmit={() => undefined}
                isSubmitting={false}
                reviewWorkspace
              />
            </div>
          </div>
        </section>
      )}

      {/* ─── Timeline & Plan Review (Draft Stage) ─── */}
      {isDraft && !isHeadSaPlanReviewWorkspace && !isHeadSaWaitingForSalesPlan && (
        <div className="space-y-4">
          <div id="project-timeline" tabIndex={-1} className="scroll-mt-20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background">
            {isSalesOwner && planApproval?.status === "REJECTED" && planApproval.review_note && (
              <div className="mb-4 border-l-2 border-destructive pl-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Plan feedback</p>
                <p className="mt-1 leading-6">{planApproval.review_note}</p>
              </div>
            )}
            <ProjectTimelineEditor
              projectId={id}
              milestones={milestones}
              canEdit={isSalesOwner && planApproval?.status !== "PENDING"}
              workflowModel={project.scenario?.workflow_model}
              workflowVersion={project.scenario?.workflow_version}
            />
          </div>
          <div id="project-plan-review" tabIndex={-1} className="scroll-mt-24 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background">
            <ProjectPlanCard
              project={project}
              approval={planApproval}
              canSubmit={showPlanCardSubmit}
              canReview={isHeadSa && planApproval?.status === "PENDING"}
              onSubmit={() => void submitPlan()}
              isSubmitting={submitProjectPlan.isPending}
            />
          </div>
        </div>
      )}

      {/* ─── Project Plan Card for Non-Draft (Read-only reference) ─── */}
      {!isDraft && planApproval && (
        <div id="project-plan-review" tabIndex={-1} className="scroll-mt-24 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background">
          <ProjectPlanCard
            project={project}
            approval={planApproval}
            canSubmit={false}
            canReview={false}
            onSubmit={() => undefined}
            isSubmitting={false}
          />
        </div>
      )}

      {/* ─── PIC Assignment & History ─── */}
      {shouldShowProjectPic && (
        <div id="project-pic-assignment" tabIndex={-1} className="scroll-mt-20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background">
          <PicAssignmentCard
            project={project}
            canAssign={isHeadSa && isActive && !isPostponed && (Boolean(project.pic) || assignPicIsCurrent)}
            unassignedNotice={projectPicNotice}
          />
        </div>
      )}

      {/* ─── Workflow Progress Bar ─── */}
      {!isDraft && (
        <section className="border-b border-border/60 pb-4" aria-labelledby="delivery-progress-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 id="delivery-progress-heading" className="text-base font-semibold text-foreground">Delivery progress</h2>
              <p className="text-sm text-muted-foreground">{progress?.completed || 0} of {progress?.total || milestones.length} stages completed</p>
            </div>
            <span className="text-sm font-medium text-primary">{progress?.percentage || 0}% complete</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary/80">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress?.percentage || 0}%` }}
            />
          </div>
        </section>
      )}

      {!isHeadSaPlanReviewWorkspace && <ProjectIntakeSection projectId={project.id} />}
      <ProjectDocumentsSection projectId={project.id} />

      {/* ─── Milestones Execution List & Activity Log ─── */}
      {!isDraft && (
      <div>
        <Card className="border-border/60 bg-card/70 shadow-none hover:border-border/60">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold tracking-tight">Workflow stages</CardTitle>
                <CardDescription className="text-xs">
                  Completed stages recede while the current work remains available here.
                </CardDescription>
              </div>
              <Badge variant="outline" className="self-start text-xs sm:self-auto">
                {milestones.length} Stages
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {milestonesLoading ? (
              <p className="py-8 text-center text-muted-foreground">Loading milestones...</p>
            ) : milestones.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No workflow milestones found.</p>
            ) : (
              milestones.map((milestone) => (
                <MilestoneRow
                  key={milestone.id}
                  project={project}
                  milestone={milestone}
                  isCurrentStage={currentStageMilestone?.id === milestone.id}
                  approvalState={approvalByMilestone.get(milestone.id)}
                />
              ))
            )}
          </CardContent>
        </Card>

      </div>
      )}

      <ActivityTimeline projectId={project.id} />
      <AssignmentHistoryCard projectId={id} />

      {user?.role === "SUPER_ADMIN" && <ProjectDeletionDangerZone project={project} />}
      <PostponeProjectDialog open={postponeOpen} onOpenChange={setPostponeOpen} project={project} />
    </div>
  );
}

function ActivityTimeline({ projectId }: { projectId: string }) {
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useProjectActivities(projectId);
  const activities = flattenActivityPages(data?.pages);

  return (
    <Card className="border-border/60 bg-card/70 shadow-none hover:border-border/60">
      <CardHeader className="pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold tracking-tight">Activity</CardTitle>
          <CardDescription className="text-xs">Recent project events</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {isLoading ? (
          <div className="space-y-2 py-1" aria-label="Loading project activities">
            {[0, 1, 2].map((index) => <div key={index} className="h-12 rounded-lg bg-muted/30 animate-pulse" />)}
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Unable to load project activity.</p>
        ) : activities.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <>
            <div className="space-y-0">
              <ol className="space-y-0">
                {activities.map((activity, index) => (
                  <li key={activity.id} className="relative pl-7 pb-3 last:pb-0">
                    {index < activities.length - 1 && <span className="absolute bottom-[-0.75rem] left-[7px] top-4 w-px bg-border/70" aria-hidden="true" />}
                    <span className="absolute left-0 top-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                      <Activity className="h-2.5 w-2.5" aria-hidden="true" />
                    </span>
                    <div className="rounded-md border border-border/40 bg-muted/15 px-2.5 py-2">
                      <p className="text-xs font-semibold text-foreground">{formatActivityAction(activity.action)}</p>
                      {activity.description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{activity.description}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground/85">
                        {activity.actor ? (
                          <>
                            <span className="font-medium text-foreground/80">{activity.actor.name}</span>
                            <span aria-hidden="true">•</span>
                            <span>{formatActorRoleLabel(activity.actor.role)}</span>
                          </>
                        ) : (
                          <span>System / Unknown Actor</span>
                        )}
                        <span aria-hidden="true">•</span>
                        <time dateTime={activity.createdAt}>{formatDateTime(activity.createdAt)}</time>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            {hasNextPage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mx-auto"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading..." : "Load more"}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Project Documents
function ProjectIntakeSection({ projectId }: { projectId: string }) {
  const { data: attachments = [], isLoading, isError } = useProjectIntake(projectId);
  const intakeDownload = useProjectIntakeDownloadUrl(projectId);
  const [downloadError, setDownloadError] = useState("");

  const handleDownload = async (attachmentId: string) => {
    setDownloadError("");
    try {
      const { url } = await intakeDownload.mutateAsync(attachmentId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setDownloadError("Unable to create a project intake download link.");
    }
  };

  const sections: Array<{ kind: "MOM" | "PHOTO" | "DOCUMENT"; label: string }> = [
    { kind: "MOM", label: "MoM" },
    { kind: "PHOTO", label: "Project Photos" },
    { kind: "DOCUMENT", label: "Optional Documents" },
  ];

  return (
    <Card className="border-border/60 bg-card/70 shadow-none hover:border-border/60">
      <CardHeader className="pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold tracking-tight">Project Intake</CardTitle>
          <CardDescription className="text-xs">
            Initial MoM, photos, and supporting files. These are intake evidence, not official repository documents.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {downloadError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {downloadError}
          </p>
        )}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((item) => (
              <div key={item} className="h-14 animate-pulse rounded-xl border border-border/40 bg-muted/20" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-4 text-center text-xs text-destructive">Unable to load project intake evidence.</p>
        ) : attachments.length === 0 ? (
          <p className="py-5 text-center text-sm text-muted-foreground">No project intake evidence available.</p>
        ) : (
          <div className="space-y-3">
            {sections.map(({ kind, label }) => {
              const items = attachments.filter((attachment) => attachment.kind === kind);
              if (!items.length) return null;

              return (
                <div key={kind} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                  {items.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex flex-col gap-3 rounded-md border border-border/40 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{attachment.file_name}</p>
                          <Badge variant="secondary" className="text-[10px]">Intake Evidence</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {attachment.mime_type} - {formatFileSize(attachment.size_bytes)} - Added {formatDate(attachment.created_at)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 gap-1.5 self-start text-xs sm:self-auto"
                        onClick={() => void handleDownload(attachment.id)}
                        disabled={intakeDownload.isPending}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>View / Download</span>
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectDocumentsSection({ projectId }: { projectId: string }) {
  const { data: documents = [], isLoading, isError } = useDocuments({ projectId });
  const documentDownload = useDocumentDownloadUrl();
  const [downloadError, setDownloadError] = useState("");

  const handleDownload = async (versionId: string) => {
    setDownloadError("");
    try {
      const { url } = await documentDownload.mutateAsync(versionId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setDownloadError("Unable to create a document download link.");
    }
  };

  return (
    <Card className="border-border/60 bg-card/70 shadow-none hover:border-border/60">
      <CardHeader className="pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold tracking-tight">Official Documents</CardTitle>
          <CardDescription className="text-xs">
            Final project and milestone documents available in the repository.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {downloadError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {downloadError}
          </p>
        )}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((item) => (
              <div key={item} className="h-16 animate-pulse rounded-xl border border-border/40 bg-muted/20" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-4 text-center text-xs text-destructive">Unable to load project documents.</p>
        ) : documents.length === 0 ? (
          <p className="py-5 text-center text-sm text-muted-foreground">No project documents yet.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((document) => {
              const latestVersion = document.versions?.[0];
              const sourceLabel =
                document.category === "MOM"
                  ? "MoM"
                  : document.milestoneId
                  ? document.milestone?.name || "Milestone document"
                  : document.category === "OTHER"
                  ? "Project document"
                  : formatHumanReadableLabel(document.category);

              return (
                <div
                  key={document.id}
                  className="flex flex-col gap-3 rounded-md border border-border/40 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{document.title}</p>
                      <Badge variant="secondary" className="text-[10px] uppercase">{sourceLabel}</Badge>
                      {latestVersion && (
                        <Badge variant="outline" className="text-[10px]">Version {latestVersion.versionNumber}</Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {latestVersion?.fileName || "No file version available"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {latestVersion?.uploadedBy?.fullName && <>Uploaded by {latestVersion.uploadedBy.fullName} - </>}
                      {formatDate(latestVersion?.createdAt || document.createdAt)}
                    </p>
                  </div>
                  {latestVersion && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 gap-1.5 self-start text-xs sm:self-auto"
                      onClick={() => void handleDownload(latestVersion.id)}
                      disabled={documentDownload.isPending}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>View / Download</span>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Next Action Card Component ───
function NextActionCard({
  nextAction,
  onAction,
  isSubmittingPlan,
  isResuming,
}: {
  nextAction: ReturnType<typeof resolveNextAction>;
  onAction: () => void;
  isSubmittingPlan: boolean;
  isResuming: boolean;
}) {
  const isDirectAction = ["SUBMIT_PLAN", "RESUBMIT_PLAN", "RESUME_PROJECT"].includes(nextAction.actionType || "");
  const usesActionLabel = isDirectAction || nextAction.actionType === "SETUP_TIMELINE";
  const isPending =
    (nextAction.actionType === "SUBMIT_PLAN" || nextAction.actionType === "RESUBMIT_PLAN")
      ? isSubmittingPlan
      : nextAction.actionType === "RESUME_PROJECT" && isResuming;
  const actionLabel = usesActionLabel ? nextAction.actionLabel || "Open task" : "Open task";
  const pendingLabel =
    nextAction.actionType === "RESUBMIT_PLAN"
      ? "Resubmitting..."
      : nextAction.actionType === "RESUME_PROJECT"
      ? "Resuming..."
      : "Submitting...";

  return (
    <section aria-labelledby="next-step-title" className="border-b border-border/60 pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className={`flex items-center gap-2 text-sm font-medium ${nextAction.canPerformAction ? "text-primary" : "text-muted-foreground"}`}>
            {nextAction.isWaiting && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/70" aria-hidden="true" />}
            {nextAction.isWaiting && nextAction.waitingForRole
              ? `Waiting on ${formatActorRoleLabel(nextAction.waitingForRole)}`
              : nextAction.canPerformAction
              ? "Your next task"
              : "Project status"}
          </p>
          <h2 id="next-step-title" className="text-lg font-semibold text-foreground">{nextAction.title}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{nextAction.description}</p>
        </div>

        {nextAction.canPerformAction && nextAction.actionType !== "NONE" && (
          <Button
            size="sm"
            onClick={onAction}
            disabled={isPending}
            aria-label={usesActionLabel ? actionLabel : `Open task: ${nextAction.title}`}
            className="h-10 w-full shrink-0 shadow-none sm:w-auto"
          >
            {isPending ? pendingLabel : actionLabel}
          </Button>
        )}
      </div>
    </section>
  );
}

// ─── Draft Project 4-Step Lifecycle Tracker ───
function DraftProgressionTracker({
  planApproval,
  milestones,
}: {
  planApproval?: ProjectPlanApproval | null;
  milestones: ProjectMilestonePhase4[];
}) {
  const isPlanSubmitted = Boolean(planApproval);
  const isPlanApproved = planApproval?.status === "APPROVED";
  const isPlanPending = planApproval?.status === "PENDING";
  const isPlanRejected = planApproval?.status === "REJECTED";

  const steps = [
    { number: 1, label: "Timeline setup", status: isPlanSubmitted ? "COMPLETED" : "CURRENT" },
    {
      number: 2,
      label: "Plan submitted",
      status: isPlanApproved ? "COMPLETED" : isPlanPending ? "COMPLETED" : isPlanRejected ? "CURRENT" : "UPCOMING",
    },
    {
      number: 3,
      label: "Head SA Review",
      status: isPlanApproved ? "COMPLETED" : isPlanPending ? "CURRENT" : isPlanRejected ? "REJECTED" : "UPCOMING",
    },
    { number: 4, label: "Project active", status: isPlanApproved ? "COMPLETED" : "UPCOMING" },
  ];

  return (
    <section aria-labelledby="plan-progress-title" className="border-b border-border/60 pb-4">
      <p id="plan-progress-title" className="mb-3 text-sm font-medium text-foreground">Plan progress</p>
      <ol className="grid grid-cols-1 gap-y-3 sm:grid-cols-4 sm:gap-x-4">
        {steps.map((step, index) => {
          const stateLabel =
            step.status === "COMPLETED"
              ? "Complete"
              : step.status === "CURRENT"
              ? "In progress"
              : step.status === "REJECTED"
              ? "Needs revision"
              : "Waiting";

          return (
            <li key={step.number} className={`flex min-w-0 items-start gap-2.5 ${index > 0 ? "sm:border-l sm:border-border/60 sm:pl-4" : ""}`}>
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  step.status === "COMPLETED"
                    ? "bg-emerald-400"
                    : step.status === "CURRENT"
                    ? "bg-primary"
                    : step.status === "REJECTED"
                    ? "bg-destructive"
                    : "bg-muted-foreground/50"
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{step.label}</p>
                <p className={step.status === "CURRENT" ? "text-xs font-medium text-primary" : "text-xs text-muted-foreground"}>{stateLabel}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ─── Project Plan Card ───
function ProjectPlanCard({
  project,
  approval,
  canSubmit,
  canReview,
  onSubmit,
  isSubmitting,
  reviewWorkspace = false,
}: {
  project: Project;
  approval: ProjectPlanApproval | null | undefined;
  canSubmit: boolean;
  canReview: boolean;
  onSubmit: () => void;
  isSubmitting: boolean;
  reviewWorkspace?: boolean;
}) {
  const [decision, setDecision] = useState<"APPROVE" | "REJECT" | null>(null);
  const reviewProjectPlan = useReviewProjectPlan(project.id);

  const review = async (note?: string, picId?: string) => {
    if (!decision) return;
    await reviewProjectPlan.mutateAsync({ decision, note, picId });
    setDecision(null);
  };

  return (
    <>
      <Card className={reviewWorkspace ? "border-border/60 bg-card shadow-none hover:border-border/60" : approval?.status === "REJECTED" ? "border-destructive/40 bg-destructive/5 shadow-none hover:border-destructive/40" : "border-border/60 bg-card/70 shadow-none hover:border-border/60"}>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold tracking-tight">
              {reviewWorkspace ? "Review decision" : "Project Plan Sign-Off"}
            </CardTitle>
            <CardDescription className="text-xs">
              {reviewWorkspace
                ? "Approve the plan to assign a PIC and activate the project, or return it to Sales with feedback."
                : "Single gatekeeper approval by Head SA before project execution starts"}
            </CardDescription>
          </div>
          {approval ? <PlanApprovalBadge status={approval.status} /> : <Badge variant="outline" className="self-start sm:self-auto">Not Submitted</Badge>}
        </CardHeader>
        <CardContent className="space-y-3">
          {approval ? (
            <div className="space-y-2 border-y border-border/50 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span>Submitted by: <strong className="text-foreground">{approval.requested_by?.full_name || "-"}</strong></span>
                <span>•</span>
                <span>Submitted at: <strong className="text-foreground">{formatDateTime(approval.submitted_at)}</strong></span>
              </div>
              {approval.request_note && (
                <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 text-xs">
                  <p className="font-semibold text-foreground">Submission Note:</p>
                  <p className="text-muted-foreground">{approval.request_note}</p>
                </div>
              )}
              {approval.status === "REJECTED" && approval.review_note && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <XCircle className="h-4 w-4" />
                    <span>Head SA Rejection Reason:</span>
                  </p>
                  <p className="leading-relaxed pl-5 font-medium">{approval.review_note}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Once you have saved the project timeline start dates and working-day durations, submit the project plan for Head SA review.
            </p>
          )}

          <div className="flex shrink-0 flex-wrap gap-2 border-t border-border/40 pt-3">
            {canSubmit && (
              <Button size="sm" className="gap-1.5 shadow-none" onClick={onSubmit} disabled={isSubmitting}>
                <Send className="h-3.5 w-3.5" />
                <span>{isSubmitting ? "Submitting..." : approval?.status === "REJECTED" ? "Resubmit Project Plan" : "Submit Project Plan"}</span>
              </Button>
            )}
            {canReview && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 gap-1.5"
                  onClick={() => setDecision("REJECT")}
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Reject Plan</span>
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 shadow-none"
                  onClick={() => setDecision("APPROVE")}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Approve & activate</span>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <PlanReviewDialog
        open={Boolean(decision)}
        onOpenChange={(open) => !open && setDecision(null)}
        decision={decision || "APPROVE"}
        projectName={project.name}
        workflowModel={project.scenario?.workflow_model}
        workflowVersion={project.scenario?.workflow_version}
        isPending={reviewProjectPlan.isPending}
        onSubmit={review}
      />
    </>
  );
}

// ─── Milestone Row Component ───
function MilestoneRow({
  project,
  milestone,
  isCurrentStage,
  approvalState,
}: {
  project: Project;
  milestone: ProjectMilestonePhase4;
  isCurrentStage: boolean;
  approvalState?: MilestoneApprovalState;
}) {
  const { user } = useAuth();
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [salesDocumentUploadOpen, setSalesDocumentUploadOpen] = useState(false);
  const [review, setReview] = useState<null | { type: "DEADLINE" | "SUBMISSION"; decision: "APPROVE" | "REJECT" }>(null);
  const [submissionReviewOpen, setSubmissionReviewOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const deadlineApproval = approvalState?.deadlineApproval || null;
  const deadlineStatusQuery = useMilestoneDeadlineStatus(milestone.id);
  const submissionHistory = approvalState?.submissionApprovalHistory || [];
  const submissionApproval = getLatestSubmissionApproval(submissionHistory);
  const milestoneStatus = getMilestoneDisplayStatus(milestone);
  const effectiveDeadline = getEffectiveDeadline(milestone);
  const stageRole = milestone.workflow_stage?.default_role;
  const requiresPic = stageRole === "SA";
  const hasPic = Boolean(milestone.pic_id || milestone.pic?.id);
  const isSalesOwner = user?.role === "SALES" && project.sales_id === user.id;
  const isHeadSa = user?.role === "HEAD_SA";
  const isAssignedPic =
    (user?.role === "SA" || user?.role === "HEAD_SA") && milestone.pic_id === user.id;
  const canReadSubmissionHistory =
    submissionHistory.length > 0 && canReadSubmissionPackageHistory(user, milestone);
  const projectIsActive = project.status === "ACTIVE" && !project.is_postponed;
  const isAssignPic = milestone.name.trim().toLowerCase() === "assign pic";
  const isCompleted = isMilestoneCompleted(milestone);

  const hasPendingDeadline = deadlineApproval?.status === "PENDING";
  const hasPendingSubmission = submissionApproval?.status === "PENDING";
  const deadlineHealth: DeadlineHealthPresentation = deadlineStatusQuery.isLoading
    ? { label: "Checking...", tone: "neutral" }
    : deadlineStatusQuery.isError || !deadlineStatusQuery.data
    ? { label: "Unavailable", tone: "neutral" }
    : getDeadlineHealthPresentation(
        deadlineStatusQuery.data.deadline_status,
        deadlineStatusQuery.data.remaining_working_days
      );
  const isDeadlineOverdue = deadlineStatusQuery.data?.deadline_status === "OVERDUE";

  const canComplete =
    projectIsActive &&
    milestoneStatus === "IN_PROGRESS" &&
    !isAssignPic &&
    ((stageRole === "SALES" && isSalesOwner) || (stageRole === "HEAD_SA" && isHeadSa));

  const canSubmit = projectIsActive && stageRole === "SA" && isAssignedPic && milestoneStatus === "IN_PROGRESS";
  const canRevise = projectIsActive && stageRole === "SA" && isAssignedPic && milestoneStatus === "REJECTED";
  const canReviewSubmission = projectIsActive && isHeadSa && milestoneStatus === "SUBMITTED" && hasPendingSubmission;
  const canReviewDeadline = projectIsActive && isHeadSa && hasPendingDeadline;
  const canRequestDeadlineChange =
    projectIsActive &&
    isSalesOwner &&
    isDeadlineChangeStepEligible(
      milestone.step_order,
      project.scenario?.workflow_model,
      project.scenario?.workflow_version
    ) &&
    !isCompleted &&
    !hasPendingDeadline;
  const canUploadSalesMilestoneDocuments =
    stageRole === "SALES" && (isSalesOwner || user?.role === "SUPER_ADMIN");
  const contributionProject = {
    salesId: project.sales_id,
    status: project.status,
    isPostponed: project.is_postponed,
    workflowModel: project.scenario?.workflow_model,
    workflowVersion: project.scenario?.workflow_version,
  };
  const contributionMilestone = {
    stepOrder: milestone.step_order,
    status: milestone.status,
    picId: milestone.pic_id,
  };
  const canReadContributions = canViewMilestoneContributions(user, contributionProject, contributionMilestone);
  const canCreateContribution = canAddMilestoneContribution(user, contributionProject, contributionMilestone);
  const canPromoteContributions = canPromoteMilestoneContributions(user, contributionProject, contributionMilestone);

  const complete = useCompleteMilestone(project.id, milestone.id);
  const startRevision = useStartMilestoneRevision(project.id, milestone.id);

  const perform = async (action: () => Promise<unknown>, success: string, fallback: string) => {
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : fallback);
    }
  };

  return (
    <div
      id={`project-milestone-${milestone.id}`}
      tabIndex={-1}
      className={`scroll-mt-20 rounded-lg border p-4 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background ${
        isCurrentStage
          ? "border-primary/40 bg-card/70"
          : isCompleted
          ? "border-border/50 bg-muted/20"
          : "border-border/60 bg-card/50 hover:border-border/80"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                isCompleted
                  ? "bg-emerald-500/20 text-emerald-400"
                  : isCurrentStage
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : String(milestone.step_order).padStart(2, "0")}
            </span>
            <StatusBadge status={milestoneStatus} />
            <Badge variant="outline" className="rounded-md text-[11px]">
              {stageRole ? formatActorRoleLabel(stageRole) : "Not assigned"}
            </Badge>
            {isCurrentStage && (
              <span className="text-xs font-medium text-primary">
                Current work
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground">{milestone.name}</p>
          {milestone.description && (
            <p className="text-xs text-muted-foreground">{milestone.description}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 shrink-0">
          {canRequestDeadlineChange && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setDeadlineOpen(true)}>
              <CalendarClock className="h-3.5 w-3.5" />
              <span>Request Deadline Change</span>
            </Button>
          )}
          {hasPendingDeadline && <Badge variant="warning">Deadline change pending review</Badge>}
          {canUploadSalesMilestoneDocuments && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setSalesDocumentUploadOpen(true)}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>Upload Document</span>
            </Button>
          )}
          {canComplete && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={complete.isPending}
              onClick={() => void perform(() => complete.mutateAsync(), "Stage marked complete.", "Failed to complete milestone.")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{complete.isPending ? "Completing..." : "Mark Complete"}</span>
            </Button>
          )}
          {canSubmit && (
            <Button size="sm" className="h-8 gap-1.5 text-xs shadow-none" onClick={() => setSubmitOpen(true)}>
              <FileCheck2 className="h-3.5 w-3.5" />
              <span>Submit Work</span>
            </Button>
          )}
          {canRevise && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              disabled={startRevision.isPending}
              onClick={() => void perform(() => startRevision.mutateAsync(), "Revision started.", "Failed to start revision.")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{startRevision.isPending ? "Starting..." : "Start Revision"}</span>
            </Button>
          )}
          {canReviewDeadline && (
            <>
              <Button size="sm" variant="outline" className="h-8 text-xs border-destructive/30 text-destructive" onClick={() => setReview({ type: "DEADLINE", decision: "REJECT" })}>
                Reject Deadline
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={() => setReview({ type: "DEADLINE", decision: "APPROVE" })}>
                Approve Deadline
              </Button>
            </>
          )}
          {canReviewSubmission && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs shadow-none"
              onClick={() => setSubmissionReviewOpen(true)}
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              <span>Review Submission</span>
            </Button>
          )}
        </div>
      </div>

      {/* ─── Timeline Panels (Effective vs Proposed) ─── */}
      <div className="mt-3.5 grid gap-3 lg:grid-cols-2">
        <DeadlinePanel title="Effective Deadline" deadline={effectiveDeadline} health={deadlineHealth} />
        <DeadlinePanel
          title={deadlineApproval?.status === "PENDING" ? "Pending Deadline Change Request" : "Latest Deadline Change History"}
          deadline={deadlineApproval?.deadline}
          status={deadlineApproval?.status}
          reviewNote={deadlineApproval?.review_note}
          reviewedBy={deadlineApproval?.reviewed_by?.full_name}
          reviewedAt={deadlineApproval?.reviewed_at}
        />
      </div>

      {/* ─── Details Strip ─── */}
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <WorkflowDetail label="Responsible role" detail={stageRole ? formatActorRoleLabel(stageRole) : "Not assigned"} ok />
        <WorkflowDetail
          label="PIC Assignment"
          detail={requiresPic ? milestone.pic?.full_name || milestone.pic?.fullName || "Unassigned" : "Not Required"}
          ok={!requiresPic || hasPic}
        />
        <DeadlineHealthDetail presentation={deadlineHealth} />
      </div>

      <MilestoneContributionsPanel
        milestoneId={milestone.id}
        milestoneName={milestone.name}
        projectId={project.id}
        canRead={canReadContributions}
        canCreate={canCreateContribution}
        canPromote={canPromoteContributions}
      />

      {/* ─── Informative Waiting State Alerts ─── */}
      {isDeadlineOverdue && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold">Deadline Overdue</p>
            <p>{deadlineHealth.detail ? `This milestone is ${deadlineHealth.detail.toLowerCase()}.` : "This milestone is overdue."}</p>
          </div>
        </div>
      )}
      {isAssignPic && milestoneStatus === "IN_PROGRESS" && (
        <div className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-300 flex items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-blue-400" />
          <span>Waiting for Head SA to assign a Solution Architect PIC. Assigning PIC completes this milestone.</span>
        </div>
      )}
      {milestoneStatus === "SUBMITTED" && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-amber-400" />
          <span>Work submitted. Waiting for Head SA review and sign-off.</span>
        </div>
      )}
      {milestoneStatus === "REJECTED" && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <XCircle className="h-4 w-4" />
            <span>Revision Required by Head SA:</span>
          </p>
          <p className="pl-5">{submissionHistory.find((a) => a.status === "REJECTED")?.review_note || "Please revise and resubmit work."}</p>
        </div>
      )}
      {isCompleted && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Completed{milestone.completed_at ? ` on ${formatDateTime(milestone.completed_at)}` : ""}</span>
        </div>
      )}

      {/* Submission History */}
      <SubmissionHistoryPanel history={submissionHistory} />
      <MilestoneSubmissionHistoryPanel
        milestoneId={milestone.id}
        canRead={canReadSubmissionHistory}
      />

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      {message && <p className="mt-3 text-xs text-emerald-400">{message}</p>}

      {/* Dialogs */}
      <DeadlineDialog open={deadlineOpen} onOpenChange={setDeadlineOpen} projectId={project.id} milestone={milestone} />
      <MilestoneSubmissionDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        projectId={project.id}
        milestoneId={milestone.id}
        milestoneName={milestone.name}
        onSuccess={() => {
          setError("");
          setMessage("Work submitted for Head SA review.");
        }}
      />
      <SalesMilestoneDocumentUploadDialog
        open={salesDocumentUploadOpen}
        onOpenChange={setSalesDocumentUploadOpen}
        projectId={project.id}
        milestoneId={milestone.id}
        milestoneName={milestone.name}
        onSuccess={(uploadedCount) => {
          setError("");
          setMessage(`${uploadedCount} document${uploadedCount === 1 ? "" : "s"} uploaded.`);
        }}
      />
      <ReviewDialog
        open={Boolean(review) && review?.type === "DEADLINE"}
        onOpenChange={(open) => !open && setReview(null)}
        projectId={project.id}
        milestoneId={milestone.id}
        approvalId={deadlineApproval?.id}
        type="DEADLINE"
        decision={review?.decision || "APPROVE"}
      />
      <MilestoneSubmissionReviewDialog
        open={submissionReviewOpen}
        onOpenChange={setSubmissionReviewOpen}
        milestoneId={milestone.id}
        milestoneName={milestone.name}
        projectId={project.id}
        projectName={project.name}
        approvalId={submissionApproval?.id}
        submissionNote={submissionApproval?.submission_note}
      />
    </div>
  );
}

// ─── Deadline Dialog ───
function DeadlineDialog({
  open,
  onOpenChange,
  projectId,
  milestone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  milestone: ProjectMilestonePhase4;
}) {
  const saveDeadline = useSaveMilestoneDeadline(projectId, milestone.id);
  const [startDate, setStartDate] = useState(milestone.start_date || "");
  const [duration, setDuration] = useState(
    milestone.duration_working_days ? String(milestone.duration_working_days) : ""
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const days = Number(duration);
    if (!startDate || !Number.isInteger(days) || days <= 0) {
      setError("A valid start date and working-day duration are required.");
      return;
    }
    if (hasEffectiveDeadline(milestone) && !reason.trim()) {
      setError("Reason is required for a deadline change request.");
      return;
    }
    setError("");
    try {
      await saveDeadline.mutateAsync({
        start_date: startDate,
        duration_working_days: days,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setReason("");
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to request deadline change.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Request Deadline Change</DialogTitle>
        <DialogDescription>{milestone.name}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">New Start Date</label>
          <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Working Days Duration</label>
          <Input
            type="number"
            min="1"
            step="1"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            placeholder="Working days"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Reason for Deadline Change *</label>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why the timeline needs to be modified..."
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveDeadline.isPending}>
            {saveDeadline.isPending ? "Submitting..." : "Submit Change Request"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

// ─── Review Dialog (Submission & Deadline Change) ───
function ReviewDialog({
  open,
  onOpenChange,
  projectId,
  milestoneId,
  approvalId,
  type,
  decision,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  milestoneId: string;
  approvalId?: string;
  type: "DEADLINE" | "SUBMISSION";
  decision: "APPROVE" | "REJECT";
}) {
  const reviewDeadline = useReviewDeadlineApproval(projectId, milestoneId);
  const reviewSubmission = useReviewSubmissionApproval(projectId, milestoneId);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const pending = type === "DEADLINE" ? reviewDeadline.isPending : reviewSubmission.isPending;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!approvalId) return;
    if (decision === "REJECT" && !note.trim()) {
      setError("A rejection reason is strictly required so the requester knows what to revise.");
      return;
    }
    setError("");
    try {
      const input = { approvalId, decision, note: note.trim() || undefined };
      if (type === "DEADLINE") await reviewDeadline.mutateAsync(input);
      else await reviewSubmission.mutateAsync(input);
      setNote("");
      onOpenChange(false);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Failed to process review.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>
          {decision === "APPROVE" ? "Approve" : "Reject"} {type === "DEADLINE" ? "Deadline Change" : "Work Submission"}
        </DialogTitle>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">
            {decision === "REJECT" ? "Rejection Reason / Required Corrections *" : "Review Remarks (Optional)"}
          </label>
          <textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              decision === "REJECT"
                ? "Specify exact feedback and what needs to be revised..."
                : "Add optional approval remarks..."
            }
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            required={decision === "REJECT"}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!approvalId || pending}
            variant={decision === "REJECT" ? "destructive" : "default"}
            className={decision === "APPROVE" ? "bg-emerald-500 hover:bg-emerald-600 text-black font-semibold" : ""}
          >
            {pending ? "Saving..." : `Confirm ${decision === "APPROVE" ? "Approval" : "Rejection"}`}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

// ─── Plan Review Dialog ───
function PlanReviewDialog({
  open,
  onOpenChange,
  decision,
  projectName,
  workflowModel,
  workflowVersion,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: "APPROVE" | "REJECT";
  projectName: string;
  workflowModel?: string | null;
  workflowVersion?: number | null;
  onSubmit: (note?: string, picId?: string) => Promise<void>;
  isPending: boolean;
}) {
  const [note, setNote] = useState("");
  const [picId, setPicId] = useState("");
  const [error, setError] = useState("");
  const requiresPic = decision === "APPROVE" && workflowModel === "OPERATIONAL_V2" && workflowVersion === 2;
  const { data: pics = [], isLoading: picsLoading, isError: picsError } = useSolutionArchitects(open && requiresPic);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setPicId("");
    setError("");
  }, [decision, open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (decision === "REJECT" && !note.trim()) {
      setError("A rejection reason is strictly required so Sales can adjust the timeline.");
      return;
    }
    if (requiresPic && !picId) {
      setError("Select a Solution Architect PIC before approving this project plan.");
      return;
    }
    setError("");
    try {
      await onSubmit(note.trim() || undefined, requiresPic ? picId : undefined);
      setNote("");
      setPicId("");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Failed to review project plan.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{decision === "APPROVE" ? "Approve" : "Reject"} Project Plan</DialogTitle>
        <DialogDescription>{projectName}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">
            {decision === "REJECT" ? "Rejection Reason / Timeline Feedback *" : "Approval Remarks (Optional)"}
          </label>
          <textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              decision === "REJECT"
                ? "Specify timeline issues or required changes before plan can be approved..."
                : "Add optional sign-off remarks..."
            }
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            required={decision === "REJECT"}
          />
        </div>
        {requiresPic && (
          <div className="space-y-2">
            <label htmlFor="project-plan-pic" className="block text-xs font-semibold text-muted-foreground">
              Solution Architect PIC *
            </label>
            {picsLoading ? (
              <p className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                Loading eligible Solution Architects...
              </p>
            ) : picsError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Unable to load eligible Solution Architects.
              </p>
            ) : (
              <select
                id="project-plan-pic"
                value={picId}
                onChange={(event) => setPicId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                required
              >
                <option value="">Select Solution Architect</option>
                {pics.map((pic) => (
                  <option key={pic.id} value={pic.id}>
                    {pic.full_name} ({formatActorRoleLabel(pic.role)}) - {pic.email}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isPending || (requiresPic && (picsLoading || picsError || !picId))}
            variant={decision === "REJECT" ? "destructive" : "default"}
          >
            {isPending
              ? "Saving..."
              : decision === "APPROVE" && requiresPic
              ? "Confirm Approval, Assign PIC & Activate"
              : `Confirm ${decision === "APPROVE" ? "Approval & Activate" : "Rejection"}`}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

// ─── Submission History Panel ───
function SubmissionHistoryPanel({ history }: { history: MilestoneSubmissionApproval[] }) {
  if (!history.length) return null;
  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Submission History</p>
      <div className="space-y-2">
        {history.map((approval) => (
          <div key={approval.id} className="rounded-lg border border-border/40 bg-muted/20 p-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <SubmissionBadge status={approval.status} />
              <span>Submitted by <strong className="text-foreground">{approval.submitted_by?.full_name || "-"}</strong></span>
              <span className="text-muted-foreground font-mono text-[10px]">{formatDateTime(approval.submitted_at)}</span>
            </div>
            {approval.submission_note && <p className="mt-1 text-muted-foreground">Note: &quot;{approval.submission_note}&quot;</p>}
            {approval.review_note && (
              <p className="mt-1 text-foreground font-medium">
                Review Feedback: &quot;{approval.review_note}&quot;
                {approval.reviewed_by?.full_name && <span className="text-muted-foreground font-normal"> — {approval.reviewed_by.full_name}</span>}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Deadline Panel (Effective vs Proposed) ───
function DeadlinePanel({
  title,
  deadline,
  status,
  health,
  reviewNote,
  reviewedBy,
  reviewedAt,
}: {
  title: string;
  deadline?: { start_date?: string | null; duration_working_days?: number | null; due_date?: string | null; change_reason?: string | null } | null;
  status?: DeadlineApprovalStatus;
  health?: DeadlineHealthPresentation;
  reviewNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}) {
  const hasData = Boolean(deadline?.start_date || deadline?.due_date);

  return (
    <div className="space-y-1 rounded-xl border border-border/60 bg-muted/15 p-3 text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-border/30 pb-1">
        <p className="font-semibold text-foreground">{title}</p>
        {health ? <DeadlineHealthBadge presentation={health} /> : status && <DeadlineBadge status={status} />}
      </div>
      {hasData ? (
        <>
          <p className="text-muted-foreground">Start: <strong className="text-foreground">{formatDate(deadline?.start_date)}</strong></p>
          <p className="text-muted-foreground">Duration: <strong className="text-foreground">{deadline?.duration_working_days || "-"} working days</strong></p>
          <p className="text-muted-foreground">Due: <strong className="text-foreground">{formatDate(deadline?.due_date)}</strong></p>
          {deadline?.change_reason && <p className="text-muted-foreground italic pt-0.5">Reason: &quot;{deadline.change_reason}&quot;</p>}
          {status && status !== "PENDING" && (reviewNote || reviewedBy || reviewedAt) && (
            <div className="mt-2 space-y-1 border-t border-border/30 pt-2">
              {reviewedBy && (
                <p className="text-muted-foreground">
                  Reviewed by: <strong className="text-foreground">{reviewedBy}</strong>
                </p>
              )}
              {reviewedAt && (
                <p className="text-muted-foreground">
                  Reviewed at:{" "}
                  <strong className="text-foreground">{formatDateTime(reviewedAt)}</strong>
                </p>
              )}
              {reviewNote && (
                <p className="text-muted-foreground">
                  {status === "REJECTED" ? "Rejection reason" : "Review note"}:{" "}
                   <span className="text-muted-foreground italic pt-0.5">&quot;{reviewNote}&quot;</span>
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-muted-foreground italic py-1">No separate change request recorded.</p>
      )}
    </div>
  );
}

function formatDeadlineHealthLabel(label: string) {
  const labels: Record<string, string> = {
    "ON TRACK": "On track",
    "DUE SOON": "Due soon",
    OVERDUE: "Overdue",
    COMPLETED: "Completed",
    "NOT SET": "Not set",
  };

  return labels[label] || formatHumanReadableLabel(label);
}

function DeadlineHealthDetail({ presentation }: { presentation: DeadlineHealthPresentation }) {
  const toneClasses = {
    destructive: "border-destructive/40 bg-destructive/10 text-destructive",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    neutral: "border-border/40 bg-card/70 text-muted-foreground",
  };

  return (
    <div className={`rounded-xl border p-2.5 text-xs ${toneClasses[presentation.tone]}`}>
      <div className="flex items-center gap-1.5">
        {presentation.tone === "destructive" ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : presentation.tone === "success" ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <CalendarClock className="h-3.5 w-3.5" />
        )}
        <span className="font-medium text-foreground">Deadline State</span>
      </div>
      <p className="mt-1 font-semibold">{formatDeadlineHealthLabel(presentation.label)}</p>
      {presentation.detail && <p className="mt-1 text-[11px] text-muted-foreground">{presentation.detail}</p>}
    </div>
  );
}

function DeadlineHealthBadge({ presentation }: { presentation: DeadlineHealthPresentation }) {
  const toneClasses = {
    destructive: "border-destructive/40 bg-destructive/10 text-destructive",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    neutral: "border-border/50 bg-muted/40 text-muted-foreground",
  };

  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${toneClasses[presentation.tone]}`}>
      {formatDeadlineHealthLabel(presentation.label)}
    </span>
  );
}

function WorkflowDetail({ label, detail, ok }: { label: string; detail: string; ok: boolean }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/70 p-2.5 text-xs">
      <div className="flex items-center gap-1.5">
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="font-medium text-foreground">{label}</span>
      </div>
      <p className="mt-1 truncate text-muted-foreground">{detail}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "COMPLETED":
    case "APPROVED":
      return <Badge variant="success">Completed</Badge>;
    case "ACTIVE":
      return <Badge variant="default">Active</Badge>;
    case "IN_PROGRESS":
      return <Badge variant="default">In Progress</Badge>;
    case "SUBMITTED":
      return <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-300">Under Review</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">Revision Required</Badge>;
    case "CANCELLED":
      return <Badge variant="destructive">Cancelled</Badge>;
    case "POSTPONED":
      return <Badge variant="warning">Postponed</Badge>;
    case "DRAFT":
      return <Badge variant="outline">{formatProjectStatusLabel(status)}</Badge>;
    case "CREATED":
      return <Badge variant="outline">{formatMilestoneStatusLabel(status)}</Badge>;
    default:
      return <Badge variant="outline">{formatMilestoneStatusLabel(status)}</Badge>;
  }
}

function DeadlineBadge({ status }: { status: DeadlineApprovalStatus }) {
  if (status === "APPROVED") return <Badge variant="success">Approved</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">Rejected</Badge>;
  if (status === "SUPERSEDED") return <Badge variant="outline">Superseded</Badge>;
  return <Badge variant="warning">Pending Review</Badge>;
}

function SubmissionBadge({ status }: { status: string }) {
  if (status === "APPROVED") return <Badge variant="success">Approved</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="warning">Under Review</Badge>;
}

function PlanApprovalBadge({ status }: { status: string }) {
  if (status === "APPROVED") return <Badge variant="success">Approved</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="warning">Pending Review</Badge>;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

function formatFileSize(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "-";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}
