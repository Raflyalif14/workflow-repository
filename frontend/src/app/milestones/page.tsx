"use client";

import { translate as translateI18n, getIntlLocale } from "@/i18n";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  Milestone,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssignedMilestone, useMyAssignedMilestones } from "@/hooks/use-projects";
import { useOutputRepository, OutputRepositoryItem } from "@/hooks/use-output-documents";
import { formatMilestoneStatusLabel } from "@/lib/workflow-ux-helpers";
import { getAssignedMilestonesNeedingAction, isAssignedProjectPaused } from "@/lib/assigned-milestone-ux";

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
      return <Badge variant="success">{translateI18n("projectStatus.COMPLETED")}</Badge>;
    case "IN_PROGRESS":
      return <Badge variant="default">{translateI18n("milestoneStatus.IN_PROGRESS")}</Badge>;
    case "SUBMITTED":
      return <Badge variant="warning">{translateI18n("milestoneStatus.SUBMITTED")}</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">{translateI18n("milestoneStatus.REVISION_REQUIRED")}</Badge>;
    default:
      return <Badge variant="outline">{formatMilestoneStatusLabel(status)}</Badge>;
  }
}

export default function MilestonesPage() {
  const { user } = useAuth();
  const userRole = user?.role || "GUEST";
  const pageCopy = rolePageCopy[userRole] || rolePageCopy.SUPER_ADMIN;
  const isSaOrHeadSa = userRole === "SA" || userRole === "HEAD_SA";
  const isHeadSa = userRole === "HEAD_SA";
  const { data: milestones = [], isLoading, isError } = useMyAssignedMilestones(isSaOrHeadSa);
  const { data: outputFiles = [], isLoading: pendingReviewsLoading, isError: pendingReviewsError } = useOutputRepository(isSaOrHeadSa);
  const reviewableOutputs = isHeadSa ? outputFiles.filter((item) => item.status === "IN_REVIEW") : [];

  const [activeTab, setActiveTab] = useState<QueueTab>("ACTION");
  const needsAction = useMemo(
    () => getAssignedMilestonesNeedingAction(milestones),
    [milestones]
  );
  const underReview = useMemo(
    () => milestones.filter((item) => outputFiles.some((output) => output.milestoneId === item.id && output.status === "IN_REVIEW")),
    [milestones, outputFiles]
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
        { label: "Pending reviews", value: reviewableOutputs.length },
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
            {translateI18n("nav.projects")}
          </Button>
        </Link>
      </header>

      {!isSaOrHeadSa ? (
        <section className="rounded-lg border border-border/60 bg-card px-5 py-14 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold text-foreground">{translateI18n("copy.milestoneLocation")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Use the Projects workspace to open the delivery timeline available to your role.
          </p>
          <Link href="/projects" className="mt-4 inline-block">
            <Button size="sm">{translateI18n("copy.openProjects")}</Button>
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
                    count={reviewableOutputs.length}
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
                reviewableOutputs={reviewableOutputs}
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
      <p className="mt-1 text-xs text-muted-foreground">{translateI18n("copy.refreshTryAgain")}</p>
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

function HeadSaReviewQueue({ reviewableOutputs, isLoading, isError }: {
  reviewableOutputs: OutputRepositoryItem[]; isLoading: boolean; isError: boolean;
}) {
  if (isLoading) return <LoadingRows />;
  if (isError) return <ErrorState message="Unable to load outputs awaiting review." />;
  if (!reviewableOutputs.length) return <EmptyState actionQueue message="No outputs are waiting for review." />;
  return <div>{reviewableOutputs.map((item) =>
    <div key={`${item.projectId}:${item.documentKey}`} className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5">
      <div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.projectName}</p></div>
      <Link href={`/projects/${item.projectId}#milestone-outputs-${item.milestoneId}`}><Button size="sm" variant="outline">Review output <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></Link>
    </div>
  )}</div>;
}

function AssignedMilestoneRow({ milestone }: { milestone: AssignedMilestone; isHeadSa?: boolean }) {
  const projectId = milestone.project?.id || milestone.project_id;
  return <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5">
    <div className="min-w-0"><div className="flex items-center gap-2"><p className="font-medium">{milestone.name}</p>{getMilestoneStatusBadge(milestone.status)}</div>
      <p className="text-xs text-muted-foreground">{milestone.project?.name || "Project"}{isAssignedProjectPaused(milestone) ? " ? Paused" : ""}</p>
    </div>
    {projectId && <Link href={`/projects/${projectId}#project-milestone-${milestone.id}`}><Button size="sm" variant="outline">Open milestone <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></Link>}
  </div>;
}
