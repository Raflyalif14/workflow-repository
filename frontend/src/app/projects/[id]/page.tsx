"use client";

import { FormEvent, useMemo, useState } from "react";
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
  FileCheck2,
  PauseCircle,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { AssignmentHistoryCard } from "@/components/projects/assignment-history-card";
import { PicAssignmentCard } from "@/components/projects/pic-assignment-card";
import { PostponeProjectDialog } from "@/components/projects/postpone-project-dialog";
import { ProjectTimelineEditor } from "@/components/projects/project-timeline-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getEffectiveDeadline,
  getLatestSubmissionApproval,
  getMilestoneDisplayStatus,
  hasEffectiveDeadline,
  isMilestoneCompleted,
} from "@/lib/milestone-ui-state";
import {
  formatMilestoneStatusLabel,
  formatProjectStatusLabel,
  resolveCurrentStage,
  resolveNextAction,
} from "@/lib/workflow-ux-helpers";
import {
  useProject,
  useProjectMilestones,
  useProjectPlanApproval,
  useProjectProgress,
  useResumeProject,
  useReviewProjectPlan,
  useSubmitProjectPlan,
} from "@/hooks/use-projects";
import {
  MilestoneApprovalState,
  useCompleteMilestone,
  useMilestoneApprovalStates,
  useReviewDeadlineApproval,
  useReviewSubmissionApproval,
  useSaveMilestoneDeadline,
  useStartMilestone,
  useStartMilestoneRevision,
  useSubmitMilestone,
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

  const currentStageMilestone = resolveCurrentStage(milestones);
  const assignPicIsCurrent = milestones.some(
    (m) => m.status === "IN_PROGRESS" && m.name.trim().toLowerCase() === "assign pic"
  );

  const nextAction = resolveNextAction(project, milestones, planApproval, {
    id: user?.id,
    role: user?.role,
    fullName: user?.fullName,
  });

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

  return (
    <div className="container space-y-6 py-8">
      {/* Back Button */}
      <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => router.push("/projects")}>
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Projects</span>
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground font-semibold">
              {project.id.slice(0, 8)}
            </span>
            <StatusBadge status={project.status} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            Customer: <strong className="text-foreground">{project.customer}</strong> • Scenario:{" "}
            <strong className="text-foreground">{project.scenario?.name || "No scenario"}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isActive && isSalesOwner && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPostponeOpen(true)}>
              <PauseCircle className="h-4 w-4 text-amber-400" />
              <span>Postpone Project</span>
            </Button>
          )}
          {isPostponed && isSalesOwner && (
            <Button size="sm" onClick={() => void resume()} disabled={resumeProject.isPending} className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold">
              <Play className="h-4 w-4" />
              <span>{resumeProject.isPending ? "Resuming..." : "Resume Project"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* ─── Next Action Card ─── */}
      <NextActionCard
        nextAction={nextAction}
        project={project}
        planApproval={planApproval}
        onSubmitPlan={() => void submitPlan()}
        isSubmittingPlan={submitProjectPlan.isPending}
        onResumeProject={() => void resume()}
        isResuming={resumeProject.isPending}
      />

      {/* ─── Postponed Banner ─── */}
      {isPostponed && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
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
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:p-5 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>Project Completed — 100%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              All workflow milestones have been fulfilled and approved. No further actions are required.
            </p>
          </div>
          <Badge variant="success" className="px-3 py-1 text-xs">
            COMPLETED
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

      {/* Project Meta Summary Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Info label="Scenario" value={project.scenario?.name || "-"} />
        <Info label="Sales Owner" value={project.sales?.full_name || project.sales?.fullName || "-"} />
        <Info label="Project Status" value={project.status} badge />
      </div>

      {/* ─── Timeline & Plan Review (Draft Stage) ─── */}
      {isDraft && (
        <div className="space-y-4">
          <ProjectTimelineEditor
            projectId={id}
            milestones={milestones}
            canEdit={isSalesOwner && planApproval?.status !== "PENDING"}
          />
          <ProjectPlanCard
            project={project}
            approval={planApproval}
            canSubmit={isSalesOwner && planApproval?.status !== "PENDING"}
            canReview={isHeadSa && planApproval?.status === "PENDING"}
            onSubmit={() => void submitPlan()}
            isSubmitting={submitProjectPlan.isPending}
          />
        </div>
      )}

      {/* ─── Project Plan Card for Non-Draft (Read-only reference) ─── */}
      {!isDraft && planApproval && (
        <ProjectPlanCard
          project={project}
          approval={planApproval}
          canSubmit={false}
          canReview={false}
          onSubmit={() => undefined}
          isSubmitting={false}
        />
      )}

      {/* ─── PIC Assignment & History ─── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PicAssignmentCard project={project} canAssign={isHeadSa && isActive && assignPicIsCurrent && !isPostponed} />
        <AssignmentHistoryCard projectId={id} />
      </div>

      {/* ─── Workflow Progress Bar ─── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold">Workflow Progress</CardTitle>
            <span className="font-mono text-xs font-bold text-primary">
              {progress?.percentage || 0}% Complete
            </span>
          </div>
          <CardDescription className="text-xs">
            Overall progression through configured workflow scenario stages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-end justify-between text-xs">
              <span className="font-medium text-foreground">
                <strong className="text-base text-foreground">{progress?.completed || 0}</strong> / {progress?.total || milestones.length} Stages Completed
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/80">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progress?.percentage || 0}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Milestones Execution List & Activity Log ─── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold">Workflow Stages & Execution</CardTitle>
              <Badge variant="outline" className="text-xs">
                {milestones.length} Stages
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Sequential milestones. Completed stages recede, and current active stage is highlighted.
            </CardDescription>
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

        {/* Activity Log */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-bold">Activity Log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {project.activity_logs?.length ? (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {project.activity_logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-border/40 bg-muted/20 p-2.5 text-xs space-y-1">
                    <p className="text-foreground leading-relaxed">
                      {log.description || log.details || log.action}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {formatDateTime(log.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">No activity logs recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <PostponeProjectDialog open={postponeOpen} onOpenChange={setPostponeOpen} project={project} />
    </div>
  );
}

// ─── Next Action Card Component ───
function NextActionCard({
  nextAction,
  project,
  planApproval,
  onSubmitPlan,
  isSubmittingPlan,
  onResumeProject,
  isResuming,
}: {
  nextAction: ReturnType<typeof resolveNextAction>;
  project: Project;
  planApproval?: ProjectPlanApproval | null;
  onSubmitPlan: () => void;
  isSubmittingPlan: boolean;
  onResumeProject: () => void;
  isResuming: boolean;
}) {
  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-card p-4 sm:p-5 shadow-sm space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Next Action</span>
            {nextAction.isWaiting && (
              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                Waiting on {nextAction.waitingForRole}
              </Badge>
            )}
          </div>
          <h3 className="text-base font-bold text-foreground">{nextAction.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            {nextAction.description}
          </p>
        </div>

        {/* Primary Action Button */}
        {nextAction.canPerformAction && nextAction.actionLabel && (
          <div className="shrink-0 self-start sm:self-center">
            {nextAction.actionType === "SUBMIT_PLAN" && (
              <Button size="sm" onClick={onSubmitPlan} disabled={isSubmittingPlan} className="gap-1.5 shadow-md">
                <Send className="h-3.5 w-3.5" />
                <span>{isSubmittingPlan ? "Submitting..." : nextAction.actionLabel}</span>
              </Button>
            )}
            {nextAction.actionType === "RESUBMIT_PLAN" && (
              <Button size="sm" onClick={onSubmitPlan} disabled={isSubmittingPlan} className="gap-1.5 shadow-md">
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{isSubmittingPlan ? "Resubmitting..." : nextAction.actionLabel}</span>
              </Button>
            )}
            {nextAction.actionType === "RESUME_PROJECT" && (
              <Button size="sm" onClick={onResumeProject} disabled={isResuming} className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold shadow-md">
                <Play className="h-3.5 w-3.5" />
                <span>{isResuming ? "Resuming..." : nextAction.actionLabel}</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
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
    { number: 1, label: "Timeline Setup", status: isPlanSubmitted ? "COMPLETED" : "CURRENT" },
    {
      number: 2,
      label: "Submit Plan",
      status: isPlanApproved ? "COMPLETED" : isPlanPending ? "COMPLETED" : isPlanRejected ? "CURRENT" : "UPCOMING",
    },
    {
      number: 3,
      label: "Head SA Review",
      status: isPlanApproved ? "COMPLETED" : isPlanPending ? "CURRENT" : isPlanRejected ? "REJECTED" : "UPCOMING",
    },
    { number: 4, label: "Project Active", status: isPlanApproved ? "COMPLETED" : "UPCOMING" },
  ];

  return (
    <Card className="bg-card/60">
      <CardContent className="py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {steps.map((step) => (
            <div key={step.number} className="flex items-center gap-2.5">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.status === "COMPLETED"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    : step.status === "CURRENT"
                    ? "bg-primary text-primary-foreground font-bold"
                    : step.status === "REJECTED"
                    ? "bg-destructive/20 text-destructive border border-destructive/40"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step.status === "COMPLETED" ? <Check className="h-3.5 w-3.5" /> : step.number}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{step.label}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{step.status.toLowerCase().replace(/_/g, " ")}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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
}: {
  project: Project;
  approval: ProjectPlanApproval | null | undefined;
  canSubmit: boolean;
  canReview: boolean;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const [decision, setDecision] = useState<"APPROVE" | "REJECT" | null>(null);
  const reviewProjectPlan = useReviewProjectPlan(project.id);

  const review = async (note?: string) => {
    if (!decision) return;
    await reviewProjectPlan.mutateAsync({ decision, note });
    setDecision(null);
  };

  return (
    <>
      <Card className={approval?.status === "REJECTED" ? "border-destructive/40 bg-destructive/5" : ""}>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div className="space-y-0.5">
            <CardTitle className="text-base font-bold">Project Plan Sign-Off</CardTitle>
            <CardDescription className="text-xs">
              Single gatekeeper approval by Head SA before project execution starts
            </CardDescription>
          </div>
          {approval ? <PlanApprovalBadge status={approval.status} /> : <Badge variant="outline">Not Submitted</Badge>}
        </CardHeader>
        <CardContent className="space-y-3">
          {approval ? (
            <div className="space-y-2 text-xs">
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

          <div className="flex shrink-0 flex-wrap gap-2 pt-1 border-t border-border/40">
            {canSubmit && (
              <Button size="sm" className="gap-1.5 shadow-sm" onClick={onSubmit} disabled={isSubmitting}>
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
                  className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold gap-1.5 shadow-sm"
                  onClick={() => setDecision("APPROVE")}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Approve & Activate Project</span>
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
  const [review, setReview] = useState<null | { type: "DEADLINE" | "SUBMISSION"; decision: "APPROVE" | "REJECT" }>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const deadlineApproval = approvalState?.deadlineApproval || null;
  const submissionHistory = approvalState?.submissionApprovalHistory || [];
  const submissionApproval = getLatestSubmissionApproval(submissionHistory);
  const milestoneStatus = getMilestoneDisplayStatus(milestone);
  const effectiveDeadline = getEffectiveDeadline(milestone);
  const stageRole = milestone.workflow_stage?.default_role;
  const requiresPic = stageRole === "SA";
  const hasPic = Boolean(milestone.pic_id || milestone.pic?.id);
  const isSalesOwner = user?.role === "SALES" && project.sales_id === user.id;
  const isHeadSa = user?.role === "HEAD_SA";
  const isAssignedSa = user?.role === "SA" && milestone.pic_id === user.id;
  const projectIsActive = project.status === "ACTIVE" && !project.is_postponed;
  const isAssignPic = milestone.name.trim().toLowerCase() === "assign pic";
  const isCompleted = isMilestoneCompleted(milestone);

  const hasPendingDeadline = deadlineApproval?.status === "PENDING";
  const hasPendingSubmission = submissionApproval?.status === "PENDING";

  const canStart =
    projectIsActive &&
    milestoneStatus === "CREATED" &&
    ((stageRole === "SALES" && isSalesOwner) ||
      (stageRole === "HEAD_SA" && isHeadSa) ||
      (stageRole === "SA" && isAssignedSa));

  const canComplete =
    projectIsActive &&
    milestoneStatus === "IN_PROGRESS" &&
    !isAssignPic &&
    ((stageRole === "SALES" && isSalesOwner) || (stageRole === "HEAD_SA" && isHeadSa));

  const canSubmit = projectIsActive && stageRole === "SA" && isAssignedSa && milestoneStatus === "IN_PROGRESS";
  const canRevise = projectIsActive && stageRole === "SA" && isAssignedSa && milestoneStatus === "REJECTED";
  const canReviewSubmission = projectIsActive && isHeadSa && milestoneStatus === "SUBMITTED" && hasPendingSubmission;
  const canReviewDeadline = projectIsActive && isHeadSa && hasPendingDeadline;
  const canRequestDeadlineChange =
    projectIsActive &&
    isSalesOwner &&
    milestone.step_order > 2 &&
    !isCompleted &&
    !hasPendingDeadline;

  const start = useStartMilestone(project.id, milestone.id);
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
      className={`rounded-xl border transition duration-200 p-4 ${
        isCurrentStage
          ? "border-primary/60 bg-gradient-to-r from-primary/10 via-card to-card shadow-sm"
          : isCompleted
          ? "border-border/40 bg-muted/10 opacity-85"
          : "border-border/50 bg-card/60"
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
            <Badge variant="outline" className="text-[11px]">
              {stageRole || "-"}
            </Badge>
            {isCurrentStage && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/30">
                CURRENT STAGE
              </span>
            )}
          </div>
          <p className="font-bold text-foreground text-sm">{milestone.name}</p>
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
          {canStart && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs shadow-sm"
              disabled={start.isPending}
              onClick={() => void perform(() => start.mutateAsync(), "Stage started.", "Failed to start stage.")}
            >
              <Play className="h-3.5 w-3.5" />
              <span>{start.isPending ? "Starting..." : "Start Stage"}</span>
            </Button>
          )}
          {canComplete && (
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs shadow-sm"
              disabled={complete.isPending}
              onClick={() => void perform(() => complete.mutateAsync(), "Stage marked complete.", "Failed to complete milestone.")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{complete.isPending ? "Completing..." : "Mark Complete"}</span>
            </Button>
          )}
          {canSubmit && (
            <Button size="sm" className="h-8 gap-1.5 text-xs shadow-sm" onClick={() => setSubmitOpen(true)}>
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
              <Button size="sm" className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-black font-semibold" onClick={() => setReview({ type: "DEADLINE", decision: "APPROVE" })}>
                Approve Deadline
              </Button>
            </>
          )}
          {canReviewSubmission && (
            <>
              <Button size="sm" variant="outline" className="h-8 text-xs border-destructive/30 text-destructive" onClick={() => setReview({ type: "SUBMISSION", decision: "REJECT" })}>
                Reject Work
              </Button>
              <Button size="sm" className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-black font-semibold" onClick={() => setReview({ type: "SUBMISSION", decision: "APPROVE" })}>
                Approve Work
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── Timeline Panels (Effective vs Proposed) ─── */}
      <div className="mt-3.5 grid gap-3 lg:grid-cols-2">
        <DeadlinePanel title="Effective Deadline" deadline={effectiveDeadline} />
        <DeadlinePanel
          title={deadlineApproval?.status === "PENDING" ? "Pending Deadline Change Request" : "Latest Deadline Change History"}
          deadline={deadlineApproval?.deadline}
          status={deadlineApproval?.status}
        />
      </div>

      {/* ─── Details Strip ─── */}
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <WorkflowDetail label="Responsible Role" detail={stageRole || "-"} ok />
        <WorkflowDetail
          label="PIC Assignment"
          detail={requiresPic ? milestone.pic?.full_name || milestone.pic?.fullName || "Unassigned" : "Not Required"}
          ok={!requiresPic || hasPic}
        />
        <WorkflowDetail
          label="Deadline State"
          detail={deadlineApproval?.status || (hasEffectiveDeadline(milestone) ? project.status === "DRAFT" ? "Draft Timeline" : "Approved Plan" : "Not Set")}
          ok={!hasPendingDeadline}
        />
      </div>

      {/* ─── Informative Waiting State Alerts ─── */}
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

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      {message && <p className="mt-3 text-xs text-emerald-400">{message}</p>}

      {/* Dialogs */}
      <DeadlineDialog open={deadlineOpen} onOpenChange={setDeadlineOpen} projectId={project.id} milestone={milestone} />
      <SubmitDialog open={submitOpen} onOpenChange={setSubmitOpen} projectId={project.id} milestone={milestone} />
      <ReviewDialog
        open={Boolean(review)}
        onOpenChange={(open) => !open && setReview(null)}
        projectId={project.id}
        milestoneId={milestone.id}
        approvalId={review?.type === "DEADLINE" ? deadlineApproval?.id : submissionApproval?.id}
        type={review?.type || "DEADLINE"}
        decision={review?.decision || "APPROVE"}
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

// ─── Submit Work Dialog ───
function SubmitDialog({
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
  const submitMilestone = useSubmitMilestone(projectId, milestone.id);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      await submitMilestone.mutateAsync(note);
      setNote("");
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit work.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Submit Work for Review</DialogTitle>
        <DialogDescription>{milestone.name}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Submission Notes (Optional)</label>
          <textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Summarize deliverables completed, documents uploaded, or notes for Head SA..."
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitMilestone.isPending} className="gap-1.5">
            <FileCheck2 className="h-4 w-4" />
            <span>{submitMilestone.isPending ? "Submitting..." : "Submit to Head SA"}</span>
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
          {decision === "APPROVE" ? "Approve" : "Reject"} {type === "DEADLINE" ? "Deadline Change" : "SA Submission"}
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
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: "APPROVE" | "REJECT";
  projectName: string;
  onSubmit: (note?: string) => Promise<void>;
  isPending: boolean;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (decision === "REJECT" && !note.trim()) {
      setError("A rejection reason is strictly required so Sales can adjust the timeline.");
      return;
    }
    setError("");
    try {
      await onSubmit(note.trim() || undefined);
      setNote("");
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            variant={decision === "REJECT" ? "destructive" : "default"}
            className={decision === "APPROVE" ? "bg-emerald-500 hover:bg-emerald-600 text-black font-semibold" : ""}
          >
            {isPending ? "Saving..." : `Confirm ${decision === "APPROVE" ? "Approval & Activate" : "Rejection"}`}
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
}: {
  title: string;
  deadline?: { start_date?: string | null; duration_working_days?: number | null; due_date?: string | null; change_reason?: string | null } | null;
  status?: DeadlineApprovalStatus;
}) {
  const hasData = Boolean(deadline?.start_date || deadline?.due_date);

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs space-y-1">
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/30">
        <p className="font-semibold text-foreground">{title}</p>
        {status && <DeadlineBadge status={status} />}
      </div>
      {hasData ? (
        <>
          <p className="text-muted-foreground">Start: <strong className="text-foreground">{formatDate(deadline?.start_date)}</strong></p>
          <p className="text-muted-foreground">Duration: <strong className="text-foreground">{deadline?.duration_working_days || "-"} working days</strong></p>
          <p className="text-muted-foreground">Due: <strong className="text-foreground">{formatDate(deadline?.due_date)}</strong></p>
          {deadline?.change_reason && <p className="text-muted-foreground italic pt-0.5">Reason: &quot;{deadline.change_reason}&quot;</p>}
        </>
      ) : (
        <p className="text-muted-foreground italic py-1">No separate change request recorded.</p>
      )}
    </div>
  );
}

function WorkflowDetail({ label, detail, ok }: { label: string; detail: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-2 text-xs">
      <div className="flex items-center gap-1.5">
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="font-medium text-foreground">{label}</span>
      </div>
      <p className="mt-1 truncate text-muted-foreground font-mono">{detail}</p>
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
    case "CREATED":
      return <Badge variant="outline">{formatMilestoneStatusLabel(status)}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
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

function Info({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {badge ? (
          <div className="mt-1.5"><StatusBadge status={value} /></div>
        ) : (
          <p className="mt-1 text-base font-bold text-foreground truncate">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}
