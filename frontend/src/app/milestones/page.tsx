"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FolderKanban,
  Milestone,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { MilestoneSubmissionReviewDialog } from "@/components/milestones/milestone-submission-review-dialog";
import { MilestoneSubmissionDialog } from "@/components/projects/milestone-submission-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApprovals } from "@/hooks/use-approvals";
import { useStartMilestoneRevision, useSubmissionPackageHistory } from "@/hooks/use-milestone-workflow";
import { AssignedMilestone, useMyAssignedMilestones } from "@/hooks/use-projects";
import { formatMilestoneStatusLabel } from "@/lib/workflow-ux-helpers";
import { getAssignedMilestonesNeedingAction, isAssignedProjectActive, isAssignedProjectPaused } from "@/lib/assigned-milestone-ux";
import { formatMilestoneDate, isInitialSubmissionBeforeEffectiveStart } from "@/lib/dates";
import { ApprovalItem } from "@/types/approval";

type QueueTab = "ACTION" | "REVIEW" | "PENDING_REVIEW" | "COMPLETED" | "ALL";

const rolePageCopy: Record<string, { eyebrow: string; title: string; description: string }> = {
  SA: {
    eyebrow: "Delivery workspace",
    title: "Assigned work",
    description: "Continue assigned work, submit deliverables, and respond to review feedback.",
  },
  HEAD_SA: {
    eyebrow: "Review workspace",
    title: "Milestone oversight",
    description: "Review submitted work while keeping your own assigned delivery work visible.",
  },
  SALES: {
    eyebrow: "Project delivery",
    title: "Project milestones",
    description: "Open a project to manage its customer-facing delivery stages.",
  },
  SUPER_ADMIN: {
    eyebrow: "Workflow oversight",
    title: "Milestone operations",
    description: "Open a project to inspect its complete delivery workflow.",
  },
};

function getMilestoneStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
    case "APPROVED":
      return <Badge variant="success">Completed</Badge>;
    case "IN_PROGRESS":
      return <Badge variant="default">In progress</Badge>;
    case "SUBMITTED":
      return <Badge variant="warning">Under review</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">Revision required</Badge>;
    default:
      return <Badge variant="outline">{formatMilestoneStatusLabel(status)}</Badge>;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "Date unavailable";
  return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

export default function MilestonesPage() {
  const { user } = useAuth();
  const userRole = user?.role || "GUEST";
  const pageCopy = rolePageCopy[userRole] || rolePageCopy.SUPER_ADMIN;
  const isSaOrHeadSa = userRole === "SA" || userRole === "HEAD_SA";
  const isHeadSa = userRole === "HEAD_SA";
  const { data: milestones = [], isLoading, isError } = useMyAssignedMilestones(isSaOrHeadSa);
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

  const reviewableSubmissions = useMemo(() => {
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

    return [...currentByMilestone.values()].sort(
      (left, right) =>
        new Date(left.requestedAt || left.submittedAt).getTime() -
        new Date(right.requestedAt || right.submittedAt).getTime()
    );
  }, [isHeadSa, pendingSubmissions]);

  const [activeTab, setActiveTab] = useState<QueueTab>("ACTION");
  const needsAction = useMemo(
    () => getAssignedMilestonesNeedingAction(milestones),
    [milestones]
  );
  const underReview = useMemo(
    () => milestones.filter((item) => item.status === "SUBMITTED"),
    [milestones]
  );
  const completed = useMemo(
    () => milestones.filter((item) => item.status === "COMPLETED" || item.status === "APPROVED"),
    [milestones]
  );
  const filteredMilestones = useMemo(() => {
    switch (activeTab) {
      case "ACTION":
        return needsAction;
      case "REVIEW":
        return underReview;
      case "COMPLETED":
        return completed;
      default:
        return milestones;
    }
  }, [activeTab, completed, milestones, needsAction, underReview]);
  const snapshot = isHeadSa
    ? [
        { label: "Assigned actions", value: needsAction.length },
        { label: "Pending reviews", value: reviewableSubmissions.length },
        { label: "Own work in review", value: underReview.length },
        { label: "Completed assignments", value: completed.length },
      ]
    : [
        { label: "Needs action", value: needsAction.length },
        { label: "Under review", value: underReview.length },
        { label: "Completed", value: completed.length },
        { label: "Total assigned", value: milestones.length },
      ];

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase text-primary">{pageCopy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{pageCopy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{pageCopy.description}</p>
        </div>
        <Link href="/projects" className="self-start sm:self-auto">
          <Button variant="outline" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            Projects
          </Button>
        </Link>
      </header>

      {!isSaOrHeadSa ? (
        <section className="rounded-lg border border-border/60 bg-card px-5 py-14 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold text-foreground">Milestones live inside each project</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Use the Projects workspace to open the delivery timeline available to your role.
          </p>
          <Link href="/projects" className="mt-4 inline-block">
            <Button size="sm">Open projects</Button>
          </Link>
        </section>
      ) : (
        <>
          <section
            aria-label="Milestone snapshot"
            className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/60 bg-card lg:grid-cols-4"
          >
            {snapshot.map((item, index) => (
              <div
                key={item.label}
                className={`border-border/60 px-4 py-3.5 sm:px-5 ${
                  index % 2 === 1 ? "border-l" : ""
                } ${index >= 2 ? "border-t" : ""} ${
                  index > 0 ? "lg:border-l" : ""
                } lg:border-t-0`}
              >
                <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
            <div className="border-b border-border/60 p-4 sm:px-5">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <QueueTabButton
                  active={activeTab === "ACTION"}
                  label="Needs action"
                  count={needsAction.length}
                  onClick={() => setActiveTab("ACTION")}
                />
                {isHeadSa && (
                  <QueueTabButton
                    active={activeTab === "PENDING_REVIEW"}
                    label="Pending review"
                    count={reviewableSubmissions.length}
                    onClick={() => setActiveTab("PENDING_REVIEW")}
                  />
                )}
                <QueueTabButton
                  active={activeTab === "REVIEW"}
                  label="Under review"
                  count={underReview.length}
                  onClick={() => setActiveTab("REVIEW")}
                />
                <QueueTabButton
                  active={activeTab === "COMPLETED"}
                  label="Completed"
                  count={completed.length}
                  onClick={() => setActiveTab("COMPLETED")}
                />
                <QueueTabButton
                  active={activeTab === "ALL"}
                  label="All assigned"
                  count={milestones.length}
                  onClick={() => setActiveTab("ALL")}
                />
              </div>
            </div>

            {activeTab === "PENDING_REVIEW" && isHeadSa ? (
              <HeadSaReviewQueue
                reviewableSubmissions={reviewableSubmissions}
                isLoading={pendingReviewsLoading}
                isError={pendingReviewsError}
              />
            ) : isLoading ? (
              <LoadingRows />
            ) : isError ? (
              <ErrorState message="Unable to load assigned milestones." />
            ) : filteredMilestones.length === 0 ? (
              <EmptyState
                actionQueue={activeTab === "ACTION"}
                message={
                  activeTab === "ACTION"
                    ? "Nothing needs your action right now."
                    : "No milestones match this queue."
                }
              />
            ) : (
              <div>
                {filteredMilestones.map((milestone) => (
                  <AssignedMilestoneRow
                    key={milestone.id}
                    milestone={milestone}
                    isHeadSa={isHeadSa}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function QueueTabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="sm"
      className="shrink-0 gap-2"
      onClick={onClick}
    >
      {label}
      <span className="text-[11px] text-muted-foreground">{count}</span>
    </Button>
  );
}

function LoadingRows() {
  return (
    <div>
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-24 animate-pulse border-t border-border/60 bg-muted/20 first:border-t-0" />
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="font-medium text-destructive">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">Refresh the page and try again.</p>
    </div>
  );
}

function EmptyState({ actionQueue, message }: { actionQueue: boolean; message: string }) {
  const Icon = actionQueue ? CheckCircle2 : Milestone;
  return (
    <div className="px-5 py-14 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 font-medium text-foreground">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        New work appears here when the project workflow reaches your role.
      </p>
    </div>
  );
}

function HeadSaReviewQueue({
  reviewableSubmissions,
  isLoading,
  isError,
}: {
  reviewableSubmissions: ApprovalItem[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <LoadingRows />;
  if (isError) return <ErrorState message="Unable to load pending milestone submissions." />;
  if (reviewableSubmissions.length === 0) {
    return <EmptyState actionQueue message="No submissions are waiting for review." />;
  }

  return (
    <div>
      {reviewableSubmissions.map((item) => (
        <ReviewableSubmissionRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function ReviewableSubmissionRow({ item }: { item: ApprovalItem }) {
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-4 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-semibold text-foreground">
            {item.stepOrder != null ? String(item.stepOrder).padStart(2, "0") : "--"}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">
                {item.milestoneName || "Milestone submission"}
              </p>
              <Badge variant="warning">Pending review</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.projectName || "Project"} | {item.clientName || "Customer unavailable"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Submitted by {item.submittedBy || "Unknown submitter"} |{" "}
              {formatDate(item.requestedAt || item.submittedAt)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:pl-11 lg:pl-0">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setReviewOpen(true)}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Review submission
          </Button>
          {item.projectId && (
            <Link href={`/projects/${item.projectId}#project-milestone-${item.milestoneId || ""}`}>
              <Button size="sm" variant="ghost" className="gap-1.5">
                Open project
                <ArrowRight className="h-3.5 w-3.5" />
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
          submittedBy={item.submittedBy}
          submittedAt={item.submittedAt}
          dueDate={item.deadline}
          stepOrder={item.stepOrder}
          status={item.status}
        />
      )}
    </>
  );
}

function AssignedMilestoneRow({
  milestone,
  isHeadSa,
}: {
  milestone: AssignedMilestone;
  isHeadSa?: boolean;
}) {
  const { user } = useAuth();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const projectId = milestone.project?.id || milestone.project_id;
  const isAssignedPic =
    (user?.role === "SA" || user?.role === "HEAD_SA") && milestone.pic_id === user?.id;
  const projectIsActive = isAssignedProjectActive(milestone);
  const projectIsPaused = isAssignedProjectPaused(milestone);
  const submissionHistory = useSubmissionPackageHistory(
    milestone.id,
    isAssignedPic && milestone.status === "IN_PROGRESS"
  );
  const isActiveRevision =
    milestone.status === "IN_PROGRESS" && submissionHistory.data?.items[0]?.status === "REJECTED";
  const isBeforeStartDate = isInitialSubmissionBeforeEffectiveStart(
    milestone.start_date,
    isActiveRevision
  );
  const startRevision = useStartMilestoneRevision(projectId, milestone.id);

  const handleStartRevision = async () => {
    setMessage("");
    setError("");
    try {
      await startRevision.mutateAsync();
      setMessage("Revision started. You can update the work and resubmit.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start revision.");
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-semibold text-foreground">
            {String(milestone.step_order).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">{milestone.name}</p>
              {getMilestoneStatusBadge(milestone.status)}
              {projectIsPaused && <Badge variant="outline">Project paused</Badge>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {milestone.project?.name || "Project"} | {milestone.project?.customer || "Customer unavailable"}
            </p>
            {milestone.status === "SUBMITTED" && !isHeadSa && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-400">
                <Clock3 className="h-3.5 w-3.5" />
                Waiting for Head SA review
              </p>
            )}
            {message && <p className="mt-1 text-xs text-emerald-400">{message}</p>}
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:pl-11 lg:pl-0">
          {projectIsActive && isAssignedPic && milestone.status === "IN_PROGRESS" && (
            isBeforeStartDate ? (
              <Badge variant="outline" className="gap-1.5 py-1 text-xs text-muted-foreground font-normal border-border/70">
                <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                Upcoming — Starts {formatMilestoneDate(milestone.start_date)}
              </Badge>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSubmitOpen(true)}>
                <FileCheck2 className="h-3.5 w-3.5" />
                Submit work
              </Button>
            )
          )}
          {projectIsActive && isHeadSa && milestone.status === "SUBMITTED" && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setReviewOpen(true)}>
              <ShieldCheck className="h-3.5 w-3.5" />
              Review submission
            </Button>
          )}
          {projectIsActive && isAssignedPic && milestone.status === "REJECTED" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-destructive"
              onClick={() => void handleStartRevision()}
              disabled={startRevision.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {startRevision.isPending ? "Starting..." : "Start revision"}
            </Button>
          )}
          {projectId && (
            <Link href={`/projects/${projectId}#project-milestone-${milestone.id}`}>
              <Button size="sm" variant="ghost" className="gap-1.5">
                Open project
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      <MilestoneSubmissionDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        projectId={projectId}
        projectName={milestone.project?.name}
        milestoneId={milestone.id}
        milestoneName={milestone.name}
        milestoneStatus={milestone.status}
        stepOrder={milestone.step_order}
        startDate={milestone.start_date}
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
        stepOrder={milestone.step_order}
        status={milestone.status}
      />
    </>
  );
}
