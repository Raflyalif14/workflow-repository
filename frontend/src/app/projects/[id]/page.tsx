"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  Play,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { AssignmentHistoryCard } from "@/components/projects/assignment-history-card";
import { PicAssignmentCard } from "@/components/projects/pic-assignment-card";
import { PostponeProjectDialog } from "@/components/projects/postpone-project-dialog";
import { ProjectTimelineEditor } from "@/components/projects/project-timeline-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    return <p className="container py-12 text-center text-muted-foreground">Loading project...</p>;
  }
  if (isError || !project) {
    return <p className="container py-12 text-center text-destructive">Project not found.</p>;
  }

  const isSalesOwner = user?.role === "SALES" && project.sales_id === user.id;
  const isHeadSa = user?.role === "HEAD_SA";
  const isDraft = project.status === "DRAFT";
  const isActive = project.status === "ACTIVE";
  const assignPicIsCurrent = milestones.some(
    (milestone) =>
      milestone.status === "IN_PROGRESS" &&
      milestone.name.trim().toLocaleLowerCase() === "assign pic"
  );

  const submitPlan = async () => {
    setError("");
    setMessage("");
    try {
      await submitProjectPlan.mutateAsync();
      setMessage("Project plan submitted for review.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit project plan.");
    }
  };

  const resume = async () => {
    setError("");
    setMessage("");
    try {
      await resumeProject.mutateAsync(project.id);
      setMessage("Project resumed.");
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Failed to resume project.");
    }
  };

  return (
    <div className="container space-y-6 py-8">
      <Button variant="ghost" className="gap-2" onClick={() => router.push("/projects")}>
        <ArrowLeft className="h-4 w-4" />
        Projects
      </Button>

      <div className="flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.customer} | {project.scenario?.name || "No scenario"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} />
          {isActive && isSalesOwner && (
            <Button size="sm" variant="outline" onClick={() => setPostponeOpen(true)}>
              Postpone Project
            </Button>
          )}
          {project.status === "POSTPONED" && isSalesOwner && (
            <Button size="sm" onClick={() => void resume()} disabled={resumeProject.isPending}>
              {resumeProject.isPending ? "Resuming..." : "Resume Project"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Info label="Scenario" value={project.scenario?.name || "-"} />
        <Info label="Sales Owner" value={project.sales?.full_name || project.sales?.fullName || "-"} />
        <Info label="Project Status" value={project.status} badge />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-500">{message}</p>}

      {isDraft && (
        <>
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
        </>
      )}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <PicAssignmentCard project={project} canAssign={isHeadSa && isActive && assignPicIsCurrent} />
        <AssignmentHistoryCard projectId={id} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold">
              {progress?.completed || 0} / {progress?.total || milestones.length} Steps
            </span>
            <span className="font-mono text-primary">{progress?.percentage || 0}%</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: String(progress?.percentage || 0) + "%" }} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Workflow Milestones</CardTitle>
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
                  approvalState={approvalByMilestone.get(milestone.id)}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Activity Log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {project.activity_logs?.length ? (
              project.activity_logs.map((log) => (
                <div key={log.id} className="border-b border-border/40 pb-2 text-sm">
                  <p>{log.description || log.details || log.action}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No activity logs recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <PostponeProjectDialog open={postponeOpen} onOpenChange={setPostponeOpen} project={project} />
    </div>
  );
}

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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Project Plan Approval</CardTitle>
          {approval ? <PlanApprovalBadge status={approval.status} /> : <Badge variant="outline">NOT SUBMITTED</Badge>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm">
            {approval ? (
              <>
                <p>Submitted by <strong>{approval.requested_by?.full_name || "-"}</strong> on {formatDateTime(approval.submitted_at)}</p>
                {approval.request_note && <p className="text-muted-foreground">Note: {approval.request_note}</p>}
                {approval.review_note && <p className="text-muted-foreground">Review: {approval.review_note}</p>}
              </>
            ) : (
              <p className="text-muted-foreground">The project timeline is ready for one project-plan review.</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {canSubmit && (
              <Button size="sm" className="gap-1.5" onClick={onSubmit} disabled={isSubmitting}>
                <Send className="h-3.5 w-3.5" />
                {isSubmitting ? "Submitting..." : "Submit Project Plan"}
              </Button>
            )}
            {canReview && (
              <>
                <Button size="sm" variant="outline" className="border-destructive/30 text-destructive" onClick={() => setDecision("REJECT")}>
                  <X className="h-3.5 w-3.5" />
                  Reject
                </Button>
                <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-600" onClick={() => setDecision("APPROVE")}>
                  <Check className="h-3.5 w-3.5" />
                  Approve
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

function MilestoneRow({
  project,
  milestone,
  approvalState,
}: {
  project: Project;
  milestone: ProjectMilestonePhase4;
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
  const projectIsActive = project.status === "ACTIVE";
  const isAssignPic = milestone.name.trim().toLocaleLowerCase() === "assign pic";
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
    !isMilestoneCompleted(milestone) &&
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
    <div className="rounded-lg border border-border/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {String(milestone.step_order).padStart(2, "0")}
            </span>
            <StatusBadge status={milestoneStatus} />
            <Badge variant="outline">{stageRole || "-"}</Badge>
          </div>
          <p className="font-medium">{milestone.name}</p>
          <p className="text-xs text-muted-foreground">{milestone.description || "No description"}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canRequestDeadlineChange && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDeadlineOpen(true)}>
              <CalendarClock className="h-3.5 w-3.5" />
              Request Deadline Change
            </Button>
          )}
          {hasPendingDeadline && <Badge variant="warning">Deadline change pending</Badge>}
          {canStart && (
            <Button size="sm" className="gap-1.5" disabled={start.isPending} onClick={() => void perform(() => start.mutateAsync(), "Stage started.", "Failed to start stage.")}>
              <Play className="h-3.5 w-3.5" />
              {start.isPending ? "Starting..." : "Start Stage"}
            </Button>
          )}
          {canComplete && (
            <Button size="sm" className="gap-1.5" disabled={complete.isPending} onClick={() => void perform(() => complete.mutateAsync(), "Milestone completed.", "Failed to complete milestone.")}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {complete.isPending ? "Completing..." : "Mark Complete"}
            </Button>
          )}
          {canSubmit && (
            <Button size="sm" className="gap-1.5" onClick={() => setSubmitOpen(true)}>
              <FileCheck2 className="h-3.5 w-3.5" />
              Submit
            </Button>
          )}
          {canRevise && (
            <Button size="sm" variant="outline" className="gap-1.5" disabled={startRevision.isPending} onClick={() => void perform(() => startRevision.mutateAsync(), "Revision started.", "Failed to start revision.")}>
              <RotateCcw className="h-3.5 w-3.5" />
              {startRevision.isPending ? "Starting..." : "Start Revision"}
            </Button>
          )}
          {canReviewDeadline && (
            <>
              <Button size="sm" variant="outline" className="border-destructive/30 text-destructive" onClick={() => setReview({ type: "DEADLINE", decision: "REJECT" })}>Reject Deadline</Button>
              <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-600" onClick={() => setReview({ type: "DEADLINE", decision: "APPROVE" })}>Approve Deadline</Button>
            </>
          )}
          {canReviewSubmission && (
            <>
              <Button size="sm" variant="outline" className="border-destructive/30 text-destructive" onClick={() => setReview({ type: "SUBMISSION", decision: "REJECT" })}>Reject Submission</Button>
              <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-600" onClick={() => setReview({ type: "SUBMISSION", decision: "APPROVE" })}>Approve Submission</Button>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <DeadlinePanel title="Effective Deadline" deadline={effectiveDeadline} />
        <DeadlinePanel
          title={deadlineApproval?.status === "PENDING" ? "Pending Deadline Change" : "Latest Deadline Proposal"}
          deadline={deadlineApproval?.deadline}
          status={deadlineApproval?.status}
        />
      </div>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <WorkflowDetail label="Responsible Role" detail={stageRole || "-"} ok />
        <WorkflowDetail label="PIC" detail={requiresPic ? milestone.pic?.full_name || milestone.pic?.fullName || "Unassigned" : "Not Required"} ok={!requiresPic || hasPic} />
        <WorkflowDetail
          label="Deadline Change"
          detail={deadlineApproval?.status || (hasEffectiveDeadline(milestone) ? project.status === "DRAFT" ? "DRAFT TIMELINE" : "APPROVED PLAN" : "NOT SET")}
          ok={!hasPendingDeadline}
        />
      </div>

      {isAssignPic && milestoneStatus === "IN_PROGRESS" && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          Assigning an eligible SA PIC completes this stage.
        </div>
      )}
      {milestoneStatus === "SUBMITTED" && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          Waiting for HEAD_SA review.
        </div>
      )}
      {milestoneStatus === "REJECTED" && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs">
          Revision required. {submissionHistory.find((approval) => approval.status === "REJECTED")?.review_note || "-"}
        </div>
      )}
      {isMilestoneCompleted(milestone) && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
          Completed at {formatDateTime(milestone.completed_at)}
        </div>
      )}
      <SubmissionHistoryPanel history={submissionHistory} />
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      {message && <p className="mt-3 text-xs text-emerald-500">{message}</p>}

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

function DeadlineDialog({ open, onOpenChange, projectId, milestone }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  milestone: ProjectMilestonePhase4;
}) {
  const saveDeadline = useSaveMilestoneDeadline(projectId, milestone.id);
  const [startDate, setStartDate] = useState(milestone.start_date || "");
  const [duration, setDuration] = useState(milestone.duration_working_days ? String(milestone.duration_working_days) : "");
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
      setError("Reason is required for a deadline change.");
      return;
    }
    setError("");
    try {
      await saveDeadline.mutateAsync({ start_date: startDate, duration_working_days: days, ...(reason.trim() ? { reason: reason.trim() } : {}) });
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
        <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        <Input type="number" min="1" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="Working days" />
        <textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saveDeadline.isPending}>{saveDeadline.isPending ? "Submitting..." : "Request Change"}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function SubmitDialog({ open, onOpenChange, projectId, milestone }: {
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
      setError(submitError instanceof Error ? submitError.message : "Failed to submit milestone.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Submit Milestone</DialogTitle>
        <DialogDescription>{milestone.name}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Submission note" className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={submitMilestone.isPending}>{submitMilestone.isPending ? "Submitting..." : "Submit"}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function ReviewDialog({ open, onOpenChange, projectId, milestoneId, approvalId, type, decision }: {
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
      setError("A rejection reason is required.");
      return;
    }
    setError("");
    try {
      const input = { approvalId, decision, note };
      if (type === "DEADLINE") await reviewDeadline.mutateAsync(input);
      else await reviewSubmission.mutateAsync(input);
      setNote("");
      onOpenChange(false);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Failed to review approval.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{decision === "APPROVE" ? "Approve" : "Reject"} {type === "DEADLINE" ? "Deadline Change" : "Submission"}</DialogTitle>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Review note" className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={!approvalId || pending} variant={decision === "REJECT" ? "destructive" : "default"}>
            {pending ? "Saving..." : "Confirm " + decision}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function PlanReviewDialog({ open, onOpenChange, decision, projectName, onSubmit, isPending }: {
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
      setError("A rejection reason is required.");
      return;
    }
    setError("");
    try {
      await onSubmit(note);
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
        <textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Review note" className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={isPending} variant={decision === "REJECT" ? "destructive" : "default"}>
            {isPending ? "Saving..." : "Confirm " + decision}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function SubmissionHistoryPanel({ history }: { history: MilestoneSubmissionApproval[] }) {
  if (!history.length) return null;
  return (
    <div className="mt-4 border-t border-border/40 pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Submission History</p>
      <div className="space-y-2">
        {history.map((approval) => (
          <div key={approval.id} className="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <SubmissionBadge status={approval.status} />
              <span>Submitted by {approval.submitted_by?.full_name || "-"}</span>
              <span className="text-muted-foreground">{formatDateTime(approval.submitted_at)}</span>
            </div>
            {approval.submission_note && <p className="mt-1 text-muted-foreground">Note: {approval.submission_note}</p>}
            {approval.review_note && <p className="mt-1 text-muted-foreground">Review: {approval.review_note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DeadlinePanel({ title, deadline, status }: {
  title: string;
  deadline?: { start_date?: string | null; duration_working_days?: number | null; due_date?: string | null; change_reason?: string | null } | null;
  status?: DeadlineApprovalStatus;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-semibold text-foreground">{title}</p>
        {status && <DeadlineBadge status={status} />}
      </div>
      <p>Start: <strong className="text-foreground">{formatDate(deadline?.start_date)}</strong></p>
      <p>Duration: <strong className="text-foreground">{deadline?.duration_working_days || "-"} working days</strong></p>
      <p>Due: <strong className="text-foreground">{formatDate(deadline?.due_date)}</strong></p>
      {deadline?.change_reason && <p className="mt-1 text-muted-foreground">Reason: {deadline.change_reason}</p>}
    </div>
  );
}

function WorkflowDetail({ label, detail, ok }: { label: string; detail: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-2">
      <div className="flex items-center gap-1.5">
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="font-medium text-foreground">{label}</span>
      </div>
      <p className="mt-1 truncate text-muted-foreground">{detail}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED" || status === "APPROVED") return <Badge variant="success">{status}</Badge>;
  if (status === "IN_PROGRESS") return <Badge variant="warning">IN_PROGRESS</Badge>;
  if (status === "SUBMITTED") return <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-300">SUBMITTED</Badge>;
  if (status === "REJECTED" || status === "CANCELLED") return <Badge variant="destructive">{status}</Badge>;
  if (status === "POSTPONED") return <Badge variant="warning">POSTPONED</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function DeadlineBadge({ status }: { status: DeadlineApprovalStatus }) {
  if (status === "APPROVED") return <Badge variant="success">APPROVED</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">REJECTED</Badge>;
  if (status === "SUPERSEDED") return <Badge variant="outline">SUPERSEDED</Badge>;
  return <Badge variant="warning">PENDING</Badge>;
}

function SubmissionBadge({ status }: { status: string }) {
  if (status === "APPROVED") return <Badge variant="success">APPROVED</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">REJECTED</Badge>;
  return <Badge variant="warning">PENDING</Badge>;
}

function PlanApprovalBadge({ status }: { status: string }) {
  if (status === "APPROVED") return <Badge variant="success">APPROVED</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">REJECTED</Badge>;
  return <Badge variant="warning">PENDING</Badge>;
}

function Info({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        {badge ? <div className="mt-2"><StatusBadge status={value} /></div> : <p className="mt-2 text-lg font-semibold">{value}</p>}
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
