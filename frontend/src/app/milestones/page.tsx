"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileCheck2,
  FolderKanban,
  Milestone,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { MilestoneSubmissionDialog } from "@/components/projects/milestone-submission-dialog";
import { MilestoneSubmissionReviewDialog } from "@/components/milestones/milestone-submission-review-dialog";
import { AssignedMilestone, useMyAssignedMilestones } from "@/hooks/use-projects";
import { useApprovals } from "@/hooks/use-approvals";
import { useStartMilestoneRevision } from "@/hooks/use-milestone-workflow";
import { formatMilestoneStatusLabel } from "@/lib/workflow-ux-helpers";
import { ApprovalItem } from "@/types/approval";

export default function MilestonesPage() {
  const { user } = useAuth();
  const isSaOrHeadSa = user?.role === "SA" || user?.role === "HEAD_SA";
  const isHeadSa = user?.role === "HEAD_SA";
  const { data: milestones = [], isLoading, isError } = useMyAssignedMilestones(isSaOrHeadSa);

  // HEAD_SA: fetch all pending submission approvals from approval overview
  const {
    data: pendingSubmissions = [],
    isLoading: pendingReviewsLoading,
    isError: pendingReviewsError,
  } = useApprovals(
    {
      type: "SUBMISSION",
      status: "PENDING",
    },
    isHeadSa
  );

  // Approval Overview is the canonical source for current, global HEAD_SA reviews.
  const reviewableSubmissions = useMemo(
    () => {
      if (!isHeadSa) return [];

      const currentByMilestone = new Map<string, ApprovalItem>();
      pendingSubmissions.forEach((item) => {
        if (
          item.category === "SUBMISSION" &&
          item.status === "PENDING" &&
          item.isCurrentApproval !== false &&
          item.milestoneId
        ) {
          currentByMilestone.set(item.milestoneId, item);
        }
      });
      return [...currentByMilestone.values()];
    },
    [isHeadSa, pendingSubmissions]
  );

  const [activeTab, setActiveTab] = useState<"ACTION" | "REVIEW" | "PENDING_REVIEW" | "COMPLETED" | "ALL">("ACTION");

  const needsAction = useMemo(
    () => milestones.filter((m) => m.status === "IN_PROGRESS" || m.status === "REJECTED"),
    [milestones]
  );
  const underReview = useMemo(
    () => milestones.filter((m) => m.status === "SUBMITTED"),
    [milestones]
  );
  const completed = useMemo(
    () => milestones.filter((m) => m.status === "COMPLETED" || m.status === "APPROVED"),
    [milestones]
  );

  const headSaReviewCount = useMemo(() => {
    if (!isHeadSa) return 0;
    return reviewableSubmissions.length;
  }, [isHeadSa, reviewableSubmissions]);

  return (
    <div className="container space-y-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-5 border-b border-border/60 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
              <Milestone className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Personal Work Queue</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Assigned Milestones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSaOrHeadSa
              ? "Track your assigned Solution Architect deliverables, start revisions, and submit completed work."
              : "Open a project to review its full milestone execution timeline."}
          </p>
        </div>
        <Link href="/projects" className="self-start sm:self-auto">
          <Button variant="outline" className="h-9 gap-2 rounded-lg">
            <FolderKanban className="h-4 w-4" />
            <span>Projects</span>
          </Button>
        </Link>
      </div>

      {!isSaOrHeadSa ? (
        <Card className="border-dashed border-border/60 bg-card/70 shadow-sm">
          <CardContent className="py-16 text-center space-y-3">
            <FolderKanban className="h-10 w-10 text-muted-foreground mx-auto" />
            <div>
              <h3 className="font-semibold text-foreground text-base">Project Milestone Management</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Assigned milestone work queues are designed for Solution Architects. As Sales, navigate directly to your projects to manage timelines.
              </p>
            </div>
            <Link href="/projects" className="inline-block pt-2">
              <Button size="sm">Go to Projects</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Queue Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm sm:p-4">
            <Button
              variant={activeTab === "ACTION" ? "default" : "ghost"}
              size="sm"
              className="h-9 shrink-0 gap-2 rounded-lg text-xs font-semibold"
              onClick={() => setActiveTab("ACTION")}
            >
              <span>Needs Action</span>
              {needsAction.length > 0 && (
                <span className="rounded-full bg-primary-foreground text-primary px-1.5 py-0.2 text-[10px] font-bold">
                  {needsAction.length}
                </span>
              )}
            </Button>

            {isHeadSa && (
              <Button
                variant={activeTab === "PENDING_REVIEW" ? "default" : "ghost"}
                size="sm"
                className="h-9 shrink-0 gap-2 rounded-lg text-xs font-semibold"
                onClick={() => setActiveTab("PENDING_REVIEW")}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Pending Review</span>
                {headSaReviewCount > 0 && (
                  <span className="rounded-full bg-amber-500/20 text-amber-400 px-1.5 py-0.2 text-[10px] font-bold">
                    {headSaReviewCount}
                  </span>
                )}
              </Button>
            )}

            <Button
              variant={activeTab === "REVIEW" ? "default" : "ghost"}
              size="sm"
              className="h-9 shrink-0 gap-2 rounded-lg text-xs font-semibold"
              onClick={() => setActiveTab("REVIEW")}
            >
              <span>Under Review</span>
              {underReview.length > 0 && (
                <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.2 text-[10px] font-bold">
                  {underReview.length}
                </span>
              )}
            </Button>

            <Button
              variant={activeTab === "COMPLETED" ? "default" : "ghost"}
              size="sm"
              className="h-9 shrink-0 gap-2 rounded-lg text-xs font-semibold"
              onClick={() => setActiveTab("COMPLETED")}
            >
              <span>Completed</span>
              {completed.length > 0 && (
                <span className="rounded-full bg-muted text-muted-foreground px-1.5 py-0.2 text-[10px] font-bold">
                  {completed.length}
                </span>
              )}
            </Button>

            <Button
              variant={activeTab === "ALL" ? "default" : "ghost"}
              size="sm"
              className="h-9 shrink-0 gap-2 rounded-lg text-xs font-semibold"
              onClick={() => setActiveTab("ALL")}
            >
              <span>All ({milestones.length})</span>
            </Button>
          </div>

          {/* List Content */}
          {activeTab === "PENDING_REVIEW" && isHeadSa ? (
            <HeadSaReviewQueue
              reviewableSubmissions={reviewableSubmissions}
              isLoading={pendingReviewsLoading}
              isError={pendingReviewsError}
            />
          ) : (
            <>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 animate-pulse rounded-xl border border-border/60 bg-card/70 shadow-sm" />
                  ))}
                </div>
              ) : isError ? (
                <Card className="border-border/60 bg-card/70 shadow-sm">
                  <CardContent className="py-16 text-center text-destructive">
                    <p className="mx-auto max-w-sm font-semibold">Unable to load assigned milestones. Please try again.</p>
                  </CardContent>
                </Card>
              ) : (() => {
                const filtered = (() => {
                  switch (activeTab) {
                    case "ACTION": return needsAction;
                    case "REVIEW": return underReview;
                    case "COMPLETED": return completed;
                    default: return milestones;
                  }
                })();
                return filtered.length === 0 ? (
                  <Card className="border-dashed border-border/60 bg-card/70 shadow-sm">
                    <CardContent className="space-y-3 py-16 text-center">
                    {activeTab === "ACTION" ? (
                      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
                    ) : (
                      <Milestone className="mx-auto h-10 w-10 text-muted-foreground" />
                    )}
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-foreground">
                        {activeTab === "ACTION"
                          ? "No Milestones Need Action"
                          : activeTab === "REVIEW"
                          ? "No Milestones Under Review"
                          : "No Milestones Found"}
                      </h3>
                      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                        {activeTab === "ACTION"
                          ? "You are all caught up! When a project advances to your stage, it will appear here."
                          : "No milestones matching the selected queue."}
                      </p>
                    </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {filtered.map((milestone) => (
                      <AssignedMilestoneRow key={milestone.id} milestone={milestone} isHeadSa={isHeadSa} />
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── HEAD_SA Review Queue ───
function HeadSaReviewQueue({
  reviewableSubmissions,
  isLoading,
  isError,
}: {
  reviewableSubmissions: ApprovalItem[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return <div className="h-28 animate-pulse rounded-xl border border-border/60 bg-card/70 shadow-sm" />;
  }

  if (isError) {
    return (
      <Card className="border-border/60 bg-card/70 shadow-sm">
        <CardContent className="py-16 text-center text-destructive">
          <p className="mx-auto max-w-sm font-semibold">Unable to load pending milestone submissions.</p>
        </CardContent>
      </Card>
    );
  }

  if (reviewableSubmissions.length === 0) {
    return (
      <Card className="border-dashed border-border/60 bg-card/70 shadow-sm">
        <CardContent className="space-y-3 py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              No Submissions Pending Review
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              All milestone submissions have been reviewed. New submissions will appear here automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {reviewableSubmissions.map((item) => (
        <ReviewableSubmissionRow key={item.id} item={item} />
      ))}
    </div>
  );
}

// ─── Reviewable Submission Row (from Approval Overview, not PIC-assigned) ───
function ReviewableSubmissionRow({ item }: { item: ApprovalItem }) {
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <Card className="border-amber-500/30 bg-amber-500/5 p-4 shadow-sm transition-colors duration-200 hover:border-primary/25">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 font-mono text-xs font-bold text-amber-400">
              {item.stepOrder != null ? String(item.stepOrder).padStart(2, "0") : "—"}
            </span>
            <p className="text-sm font-semibold tracking-tight text-foreground">
              {item.milestoneName || "Milestone Submission"}
            </p>
            <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-300">Under Review</Badge>
          </div>
          <p className="border-t border-border/40 pt-2 text-xs text-muted-foreground sm:pl-10">
            Project: <strong className="text-foreground">{item.projectName || "Project"}</strong> • Customer:{" "}
            <strong className="text-foreground">{item.clientName || "-"}</strong>
            {item.submittedBy && (
              <>
                {" "}• Submitted by: <strong className="text-foreground">{item.submittedBy}</strong>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-center">
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-lg text-xs bg-primary hover:bg-primary/90 shadow-sm"
            onClick={() => setReviewOpen(true)}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Review Submission</span>
          </Button>
          {item.projectId && (
            <Link href={`/projects/${item.projectId}`}>
              <Button size="sm" variant="ghost" className="h-8 gap-1 rounded-lg text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground">
                <span>View Project</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {item.milestoneId && (
        <MilestoneSubmissionReviewDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          milestoneId={item.milestoneId}
          milestoneName={item.milestoneName || "Milestone"}
          projectId={item.projectId}
          projectName={item.projectName}
          approvalId={item.id}
          submissionNote={item.submissionNote}
        />
      )}
    </Card>
  );
}

// ─── Assigned Milestone Row ───
function AssignedMilestoneRow({ milestone, isHeadSa }: { milestone: AssignedMilestone; isHeadSa?: boolean }) {
  const { user } = useAuth();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const projectId = milestone.project?.id || milestone.project_id;
  const isAssignedPic =
    (user?.role === "SA" || user?.role === "HEAD_SA") && milestone.pic_id === user?.id;
  const startRevision = useStartMilestoneRevision(projectId, milestone.id);

  const handleStartRevision = async () => {
    setMessage("");
    setError("");
    try {
      await startRevision.mutateAsync();
      setMessage("Revision started. You can now revise deliverables and resubmit.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start revision.");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
      case "APPROVED":
        return <Badge variant="success">Completed</Badge>;
      case "IN_PROGRESS":
        return <Badge variant="default">In Progress</Badge>;
      case "SUBMITTED":
        return <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-300">Under Review</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">Revision Required</Badge>;
      default:
        return <Badge variant="outline">{formatMilestoneStatusLabel(status)}</Badge>;
    }
  };

  return (
    <Card
      className={`border-border/60 bg-card/70 p-4 shadow-sm transition-colors duration-200 hover:border-primary/25 ${
        milestone.status === "IN_PROGRESS"
          ? "border-primary/40 bg-primary/5"
          : milestone.status === "REJECTED"
          ? "border-destructive/40 bg-destructive/5"
          : milestone.status === "SUBMITTED"
          ? "border-amber-500/30 bg-amber-500/5"
          : milestone.status === "COMPLETED" || milestone.status === "APPROVED"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : ""
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 font-mono text-xs font-bold text-primary">
              {String(milestone.step_order).padStart(2, "0")}
            </span>
            <p className="text-sm font-semibold tracking-tight text-foreground">{milestone.name}</p>
            {getStatusBadge(milestone.status)}
          </div>
          <p className="border-t border-border/40 pt-2 text-xs text-muted-foreground sm:pl-10">
            Project: <strong className="text-foreground">{milestone.project?.name || "Project"}</strong> • Customer:{" "}
            <strong className="text-foreground">{milestone.project?.customer || "-"}</strong>
          </p>

          {message && <p className="text-xs text-emerald-400 sm:pl-10">{message}</p>}
          {error && <p className="text-xs text-destructive sm:pl-10">{error}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-center">
          {isAssignedPic && milestone.status === "IN_PROGRESS" && (
            <Button size="sm" className="h-8 gap-1.5 rounded-lg text-xs shadow-sm" onClick={() => setSubmitOpen(true)}>
              <FileCheck2 className="h-3.5 w-3.5" />
              <span>Submit Work</span>
            </Button>
          )}
          {isHeadSa && milestone.status === "SUBMITTED" && (
            <Button
              size="sm"
              className="h-8 gap-1.5 rounded-lg text-xs bg-primary hover:bg-primary/90 shadow-sm"
              onClick={() => setReviewOpen(true)}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Review Submission</span>
            </Button>
          )}
          {!isHeadSa && isAssignedPic && milestone.status === "SUBMITTED" && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400">
              <Clock className="h-3.5 w-3.5" />
              <span>Waiting for Head SA</span>
            </span>
          )}
          {isAssignedPic && milestone.status === "REJECTED" && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-lg border-destructive/40 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => void handleStartRevision()}
              disabled={startRevision.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{startRevision.isPending ? "Starting..." : "Start Revision"}</span>
            </Button>
          )}
          {projectId && (
            <Link href={`/projects/${projectId}`}>
              <Button size="sm" variant="ghost" className="h-8 gap-1 rounded-lg text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground">
                <span>View Project</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      <MilestoneSubmissionDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        projectId={projectId}
        milestoneId={milestone.id}
        milestoneName={milestone.name}
        onSuccess={() => setMessage("Milestone submitted successfully for Head SA review.")}
      />
      <MilestoneSubmissionReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        milestoneId={milestone.id}
        milestoneName={milestone.name}
        projectId={projectId}
        projectName={milestone.project?.name}
        approvalId={undefined}
        submissionNote={undefined}
      />
    </Card>
  );
}
