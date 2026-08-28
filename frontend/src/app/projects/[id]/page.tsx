"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  CirclePlay,
  FileCheck2,
  RotateCcw,
  Send,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { AssignmentHistoryCard } from "@/components/projects/assignment-history-card";
import { PicAssignmentCard } from "@/components/projects/pic-assignment-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getDeadlinePrerequisiteStatus,
  getEffectiveDeadline,
  getLatestSubmissionApproval,
  getMilestoneDisplayStatus,
  hasEffectiveDeadline as hasMilestoneEffectiveDeadline,
  isMilestoneCompleted,
} from "@/lib/milestone-ui-state";
import {
  useProject,
  useProjectMilestones,
  useProjectProgress,
} from "@/hooks/use-projects";
import {
  MilestoneApprovalState,
  useInitiateMilestone,
  useMilestoneApprovalStates,
  useRequestInitiationApproval,
  useReviewSubmissionApproval,
  useReviewDeadlineApproval,
  useReviewInitiationApproval,
  useSaveMilestoneDeadline,
  useStartMilestoneRevision,
  useSubmitMilestone,
} from "@/hooks/use-milestone-workflow";
import { DeadlineApprovalStatus, MilestoneSubmissionApproval, ProjectMilestonePhase4, ProjectStatus } from "@/types/project";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: project, isLoading: projectLoading, isError } = useProject(id);
  const { data: milestones = [], isLoading: milestonesLoading } = useProjectMilestones(id);
  const { data: progress } = useProjectProgress(id);
  const approvalQueries = useMilestoneApprovalStates(milestones, Boolean(milestones.length));

  useEffect(() => {
    warnIfAssessmentReportCanonicalMismatch(milestones);
  }, [milestones]);

  const approvalByMilestone = useMemo(() => {
    const map = new Map<string, MilestoneApprovalState>();
    milestones.forEach((milestone, index) => {
      const data = approvalQueries[index]?.data;
      if (data) map.set(milestone.id, data);
    });
    return map;
  }, [approvalQueries, milestones]);

  if (projectLoading) return <p className="container py-12 text-center text-muted-foreground">Loading project...</p>;
  if (isError || !project) return <p className="container py-12 text-center text-destructive">Project not found.</p>;

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
        <StatusBadge status={project.status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Info label="Scenario" value={project.scenario?.name || "-"} />
        <Info label="Sales Owner" value={project.sales?.full_name || project.sales?.fullName || "-"} />
        <Info label="Project Status" value={project.status} badge />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PicAssignmentCard project={project} canAssign={user?.role === "HEAD_SA"} />
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
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress?.percentage || 0}%` }} />
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
                  projectId={id}
                  projectSalesId={project.sales_id}
                  projectStatus={project.status}
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
    </div>
  );
}

function warnIfAssessmentReportCanonicalMismatch(milestones: ProjectMilestonePhase4[]) {
  if (process.env.NODE_ENV !== "development") return;

  const assessmentReport = milestones.find(
    (milestone) => milestone.id === "1b90d4a5-0245-43e4-ab30-78b985972f8a"
  );

  if (!assessmentReport) return;

  const matchesExpectedCanonical =
    assessmentReport.status === "COMPLETED" &&
    assessmentReport.start_date === "2026-08-28" &&
    assessmentReport.duration_working_days === 3 &&
    assessmentReport.due_date === "2026-09-02";

  if (!matchesExpectedCanonical) {
    console.warn("[Phase 9C Hotfix] Canonical milestone query mismatch", {
      milestone_id: assessmentReport.id,
      status: assessmentReport.status,
      start_date: assessmentReport.start_date,
      duration_working_days: assessmentReport.duration_working_days,
      due_date: assessmentReport.due_date,
      source: "GET /api/projects/:projectId/milestones",
    });
  }
}

function MilestoneRow({
  projectId,
  projectSalesId,
  projectStatus,
  milestone,
  approvalState,
}: {
  projectId: string;
  projectSalesId?: string;
  projectStatus: ProjectStatus;
  milestone: ProjectMilestonePhase4;
  approvalState?: MilestoneApprovalState;
}) {
  const { user } = useAuth();
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [initiationOpen, setInitiationOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [review, setReview] = useState<null | { type: "DEADLINE" | "INITIATION" | "SUBMISSION"; decision: "APPROVE" | "REJECT" }>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [emailMessage, setEmailMessage] = useState("");

  const deadlineApproval = approvalState?.deadlineApproval || null;
  const deadlineApprovalHistory = approvalState?.deadlineApprovalHistory || [];
  const initiationApproval = approvalState?.initiationApproval || null;
  const submissionHistory = approvalState?.submissionApprovalHistory || [];
  const submissionApproval = getLatestSubmissionApproval(submissionHistory);
  const latestRejectedSubmission = submissionHistory.find((approval) => approval.status === "REJECTED");
  const milestoneStatus = getMilestoneDisplayStatus(milestone);
  const effectiveDeadline = getEffectiveDeadline(milestone);
  const hasEffectiveDeadline = hasMilestoneEffectiveDeadline(milestone);
  const deadlinePrerequisiteStatus = getDeadlinePrerequisiteStatus(milestone, deadlineApproval, deadlineApprovalHistory);
  const deadlinePrerequisiteApproved = deadlinePrerequisiteStatus === "APPROVED";
  const hasPendingDeadline = deadlineApproval?.status === "PENDING";
  const hasPendingInitiation = initiationApproval?.status === "PENDING";
  const hasPendingSubmission = submissionApproval?.status === "PENDING";
  const stageRole = milestone.workflow_stage?.default_role;
  const requiresPic = stageRole === "SA";
  const hasPic = Boolean(milestone.pic_id || milestone.pic?.id);
  const isProjectCompleted = projectStatus === "COMPLETED";
  const isSalesOwner = user?.role === "SALES" && projectSalesId === user.id;
  const isHeadSa = user?.role === "HEAD_SA";
  const isAssignedSa = user?.role === "SA" && milestone.pic_id === user.id;
  const canProposeDeadline = !isProjectCompleted && isSalesOwner && milestoneStatus === "CREATED" && !hasPendingDeadline;
  const canRequestInitiation =
    !isProjectCompleted &&
    isSalesOwner &&
    milestoneStatus === "CREATED" &&
    (!requiresPic || hasPic) &&
    hasEffectiveDeadline &&
    deadlinePrerequisiteApproved &&
    !hasPendingInitiation;
  const canInitiate = !isProjectCompleted && isSalesOwner && milestoneStatus === "CREATED" && initiationApproval?.status === "APPROVED";
  const canSubmit = !isProjectCompleted && isAssignedSa && milestoneStatus === "IN_PROGRESS";
  const canStartRevision = !isProjectCompleted && isAssignedSa && milestoneStatus === "REJECTED";
  const canReviewSubmission = !isProjectCompleted && isHeadSa && milestoneStatus === "SUBMITTED" && hasPendingSubmission;
  const initiate = useInitiateMilestone(projectId, milestone.id);
  const startRevision = useStartMilestoneRevision(projectId, milestone.id);

  const handleInitiate = async () => {
    setError("");
    setActionMessage("");
    setEmailMessage("");
    try {
      const result = await initiate.mutateAsync();
      setEmailMessage(result.notification?.email_sent === false ? "Milestone initiated. Email notification failed." : "Milestone initiated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate milestone.");
    }
  };

  const handleStartRevision = async () => {
    setError("");
    setActionMessage("");
    try {
      await startRevision.mutateAsync();
      setActionMessage("Revision started. Milestone is back in progress.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start revision.");
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
          </div>
          <p className="font-medium">{milestone.name}</p>
          <p className="text-xs text-muted-foreground">{milestone.description || "No description"}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canProposeDeadline && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDeadlineOpen(true)}>
              <CalendarClock className="h-3.5 w-3.5" />
              {hasEffectiveDeadline ? "Change Deadline" : "Set Deadline"}
            </Button>
          )}
          {hasPendingDeadline && isSalesOwner && (
            <Badge variant="warning">Waiting for HEAD_SA approval</Badge>
          )}
          {canRequestInitiation && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setInitiationOpen(true)}>
              <Send className="h-3.5 w-3.5" />
              Request Initiation Approval
            </Button>
          )}
          {hasPendingInitiation && isSalesOwner && <Badge variant="warning">Initiation approval pending</Badge>}
          {canInitiate && (
            <Button size="sm" className="gap-1.5" onClick={() => void handleInitiate()} disabled={initiate.isPending}>
              <CirclePlay className="h-3.5 w-3.5" />
              {initiate.isPending ? "Initiating..." : "Initiate Milestone"}
            </Button>
          )}
          {canSubmit && (
            <Button size="sm" className="gap-1.5" onClick={() => setSubmitOpen(true)}>
              <FileCheck2 className="h-3.5 w-3.5" />
              Submit Milestone
            </Button>
          )}
          {isAssignedSa && milestoneStatus === "SUBMITTED" && <Badge variant="warning">Waiting for HEAD_SA approval</Badge>}
          {canStartRevision && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void handleStartRevision()} disabled={startRevision.isPending}>
              <RotateCcw className="h-3.5 w-3.5" />
              {startRevision.isPending ? "Starting..." : "Start Revision"}
            </Button>
          )}
          {isMilestoneCompleted(milestone) && <Badge variant="success">Completed {formatDate(milestone.completed_at)}</Badge>}
          {isHeadSa && !isProjectCompleted && hasPendingDeadline && (
            <>
              <Button size="sm" variant="outline" className="border-destructive/30 text-destructive" onClick={() => setReview({ type: "DEADLINE", decision: "REJECT" })}>Reject Deadline</Button>
              <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-600" onClick={() => setReview({ type: "DEADLINE", decision: "APPROVE" })}>Approve Deadline</Button>
            </>
          )}
          {isHeadSa && !isProjectCompleted && hasPendingInitiation && (
            <>
              <Button size="sm" variant="outline" className="border-destructive/30 text-destructive" onClick={() => setReview({ type: "INITIATION", decision: "REJECT" })}>Reject Initiation</Button>
              <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-600" onClick={() => setReview({ type: "INITIATION", decision: "APPROVE" })}>Approve Initiation</Button>
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
        <DeadlinePanel title="Effective Deadline" deadline={{
          start_date: effectiveDeadline.start_date,
          duration_working_days: effectiveDeadline.duration_working_days,
          due_date: effectiveDeadline.due_date,
        }} />
        <DeadlinePanel
          title={deadlineApproval?.status === "PENDING" ? "Pending Change" : "Latest Deadline Proposal"}
          deadline={deadlineApproval?.deadline}
          status={deadlineApproval?.status}
        />
      </div>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
        <Prerequisite
          label="PIC"
          ok={!requiresPic || hasPic}
          detail={requiresPic ? milestone.pic?.full_name || milestone.pic?.fullName || "Unassigned" : "Not Required"}
        />
        <Prerequisite label="Deadline" ok={deadlinePrerequisiteApproved} detail={deadlinePrerequisiteStatus} />
        <Prerequisite label="Initiation Approval" ok={initiationApproval?.status === "APPROVED"} detail={initiationApproval?.status || "NOT_REQUESTED"} />
        <Prerequisite label="Sales Initiation" ok={milestoneStatus === "IN_PROGRESS" || milestoneStatus === "SUBMITTED" || isMilestoneCompleted(milestone)} detail={milestoneStatus === "CREATED" ? "Not Started" : milestoneStatus} />
      </div>

      {milestoneStatus === "REJECTED" && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs">
          <p className="font-semibold text-destructive">Revision Required</p>
          <p className="mt-1 text-muted-foreground">
            Review Note: <strong className="text-foreground">{latestRejectedSubmission?.review_note || "-"}</strong>
          </p>
        </div>
      )}

      {isMilestoneCompleted(milestone) && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
          <p className="font-semibold text-emerald-400">Milestone Completed</p>
          <p className="mt-1 text-muted-foreground">Completed at: <strong className="text-foreground">{formatDateTime(milestone.completed_at)}</strong></p>
        </div>
      )}

      <SubmissionHistoryPanel history={submissionHistory} />

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      {actionMessage && <p className="mt-3 text-xs text-emerald-400">{actionMessage}</p>}
      {emailMessage && <p className="mt-3 text-xs text-emerald-400">{emailMessage}</p>}

      <DeadlineDialog
        open={deadlineOpen}
        onOpenChange={setDeadlineOpen}
        projectId={projectId}
        milestone={milestone}
        hasEffectiveDeadline={hasEffectiveDeadline}
      />
      <InitiationRequestDialog
        open={initiationOpen}
        onOpenChange={setInitiationOpen}
        projectId={projectId}
        milestone={milestone}
      />
      <SubmitMilestoneDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        projectId={projectId}
        milestone={milestone}
      />
      <ReviewDialog
        open={Boolean(review)}
        onOpenChange={(open) => !open && setReview(null)}
        projectId={projectId}
        milestoneId={milestone.id}
        approvalId={
          review?.type === "DEADLINE"
            ? deadlineApproval?.id
            : review?.type === "INITIATION"
              ? initiationApproval?.id
              : submissionApproval?.id
        }
        type={review?.type || "DEADLINE"}
        decision={review?.decision || "APPROVE"}
      />
    </div>
  );
}

function DeadlineDialog({
  open,
  onOpenChange,
  projectId,
  milestone,
  hasEffectiveDeadline,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  milestone: ProjectMilestonePhase4;
  hasEffectiveDeadline: boolean;
}) {
  const save = useSaveMilestoneDeadline(projectId, milestone.id);
  const [startDate, setStartDate] = useState("");
  const [duration, setDuration] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const parsedDuration = Number(duration);
    if (!startDate) return setError("Start date is required.");
    if (!Number.isInteger(parsedDuration) || parsedDuration <= 0) return setError("Duration must be a positive integer.");
    if (hasEffectiveDeadline && !reason.trim()) return setError("Reason is required when changing an existing deadline.");

    try {
      await save.mutateAsync({
        start_date: startDate,
        duration_working_days: parsedDuration,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onOpenChange(false);
      setStartDate("");
      setDuration("");
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit deadline proposal.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{hasEffectiveDeadline ? "Change Deadline" : "Set Deadline"}</DialogTitle>
        <DialogDescription>{milestone.name}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Start Date</label>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Duration Working Days</label>
            <Input type="number" min={1} step={1} value={duration} onChange={(event) => setDuration(event.target.value)} required />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Reason {hasEffectiveDeadline ? "(Required)" : "(Optional)"}
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? "Submitting..." : "Submit Proposal"}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function InitiationRequestDialog({
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
  const request = useRequestInitiationApproval(projectId, milestone.id);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      await request.mutateAsync(note);
      onOpenChange(false);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request initiation approval.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Request Initiation Approval</DialogTitle>
        <DialogDescription>{milestone.name}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <textarea
          rows={3}
          placeholder="Optional request note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={request.isPending}>{request.isPending ? "Submitting..." : "Request Approval"}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function SubmitMilestoneDialog({
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
      onOpenChange(false);
      setNote("");
      alert("Milestone submitted for HEAD_SA approval.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit milestone.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Submit Milestone</DialogTitle>
        <DialogDescription>{milestone.name}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <textarea
          rows={3}
          placeholder="Optional submission note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={submitMilestone.isPending}>
            {submitMilestone.isPending ? "Submitting..." : "Submit for Approval"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

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
  type: "DEADLINE" | "INITIATION" | "SUBMISSION";
  decision: "APPROVE" | "REJECT";
}) {
  const deadlineReview = useReviewDeadlineApproval(projectId, milestoneId);
  const initiationReview = useReviewInitiationApproval(projectId, milestoneId);
  const submissionReview = useReviewSubmissionApproval(projectId, milestoneId);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const mutation = type === "DEADLINE" ? deadlineReview : type === "INITIATION" ? initiationReview : submissionReview;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!approvalId) return setError("Approval record is missing.");
    if (decision === "REJECT" && !note.trim()) return setError("Rejection note is required.");
    try {
      await mutation.mutateAsync({ approvalId, decision, note });
      onOpenChange(false);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to review approval.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{decision === "APPROVE" ? "Approve" : "Reject"} {formatReviewType(type)} Request</DialogTitle>
        <DialogDescription>Review decision will be saved by backend.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <textarea
          rows={3}
          placeholder={decision === "REJECT" ? "Required rejection note" : "Optional note"}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending} variant={decision === "REJECT" ? "destructive" : "default"}>
            {mutation.isPending ? "Saving..." : decision === "APPROVE" ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function SubmissionHistoryPanel({ history }: { history: MilestoneSubmissionApproval[] }) {
  if (!history.length) return null;

  return (
    <div className="mt-4 rounded-lg border border-border/50 bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <FileCheck2 className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-foreground">Submission Approval History</p>
      </div>
      <div className="space-y-2">
        {history.map((approval) => (
          <div key={approval.id} className="rounded-md border border-border/40 bg-card/60 p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={approval.status} />
              <span className="text-muted-foreground">Submitted by <strong className="text-foreground">{approval.submitted_by?.full_name || approval.submitted_by?.fullName || "-"}</strong></span>
              <span className="text-muted-foreground">{formatDateTime(approval.submitted_at)}</span>
            </div>
            {approval.submission_note && <p className="mt-1 text-muted-foreground">Submission Note: <strong className="text-foreground">{approval.submission_note}</strong></p>}
            {approval.review_note && <p className="mt-1 text-muted-foreground">Review Note: <strong className="text-foreground">{approval.review_note}</strong></p>}
            {approval.reviewed_by && (
              <p className="mt-1 text-muted-foreground">
                Reviewed by <strong className="text-foreground">{approval.reviewed_by.full_name || approval.reviewed_by.fullName}</strong>
                {approval.reviewed_at ? ` at ${formatDateTime(approval.reviewed_at)}` : ""}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatReviewType(type: "DEADLINE" | "INITIATION" | "SUBMISSION") {
  if (type === "DEADLINE") return "Deadline";
  if (type === "SUBMISSION") return "Submission";
  return "Initiation";
}

function DeadlinePanel({
  title,
  deadline,
  status,
}: {
  title: string;
  deadline?: { start_date?: string | null; duration_working_days?: number | null; due_date?: string | null; change_reason?: string | null } | null;
  status?: DeadlineApprovalStatus;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-semibold text-foreground">{title}</p>
        {status && <DeadlineApprovalBadge status={status} />}
      </div>
      <p>Start: <strong className="text-foreground">{formatDate(deadline?.start_date)}</strong></p>
      <p>Duration: <strong className="text-foreground">{deadline?.duration_working_days || "-"} working days</strong></p>
      <p>Due: <strong className="text-foreground">{formatDate(deadline?.due_date)}</strong></p>
      {deadline?.change_reason && <p className="mt-1 text-muted-foreground">Reason: {deadline.change_reason}</p>}
    </div>
  );
}

function Prerequisite({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-2">
      <div className="flex items-center gap-1.5">
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />}
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
  if (status === "CREATED") return <Badge variant="outline">CREATED</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function DeadlineApprovalBadge({ status }: { status: DeadlineApprovalStatus }) {
  if (status === "APPROVED") return <Badge variant="success">APPROVED</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">REJECTED</Badge>;
  if (status === "SUPERSEDED") return <Badge variant="outline">SUPERSEDED</Badge>;
  return <Badge variant="warning">Pending HEAD_SA Approval</Badge>;
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
