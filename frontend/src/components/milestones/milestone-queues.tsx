"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Milestone } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AssignedMilestone } from "@/hooks/use-projects";
import type { OutputRepositoryItem } from "@/hooks/use-output-documents";
import { translate as translateI18n, translateMilestoneStatus, translateOutputName } from "@/i18n";
import {
  countAssignedOutputsWaitingReview,
  getAssignedMilestoneState,
  isAssignedProjectPaused,
} from "@/lib/assigned-milestone-ux";

type QueueLoadState = { isLoading: boolean; isError: boolean };

export function AssignedMilestoneQueue({ milestones, isLoading, isError, actionQueue }: QueueLoadState & {
  milestones: AssignedMilestone[];
  actionQueue: boolean;
}) {
  if (isLoading) return <LoadingRows />;
  if (isError) return <ErrorState message={translateI18n("milestonePage.loadFailed")} />;
  if (!milestones.length) {
    return (
      <EmptyState
        actionQueue={actionQueue}
        message={translateI18n(actionQueue ? "milestonePage.noAction" : "milestonePage.noMatches")}
      />
    );
  }
  return <div>{milestones.map((milestone) => <AssignedMilestoneRow key={milestone.id} milestone={milestone} />)}</div>;
}

export function HeadSaReviewQueue({ reviewableOutputs, isLoading, isError }: QueueLoadState & {
  reviewableOutputs: OutputRepositoryItem[];
}) {
  if (isLoading) return <LoadingRows />;
  if (isError) return <ErrorState message={translateI18n("milestonePage.reviewLoadFailed")} />;
  if (!reviewableOutputs.length) return <EmptyState actionQueue message={translateI18n("milestonePage.noReviewOutputs")} />;
  return (
    <div>
      {reviewableOutputs.map((item) => (
        <div
          key={`${item.projectId}:${item.documentKey}`}
          className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5"
        >
          <div>
            <p className="font-medium">{translateOutputName(item.documentKey, item.name)}</p>
            <p className="text-xs text-muted-foreground">{item.projectName}</p>
          </div>
          <Link href={`/projects/${item.projectId}#milestone-outputs-${item.milestoneId}`}>
            <Button size="sm" variant="outline">
              {translateI18n("milestonePage.reviewOutput")} <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      ))}
    </div>
  );
}

function AssignedMilestoneRow({ milestone }: { milestone: AssignedMilestone }) {
  const projectId = milestone.project?.id || milestone.project_id;
  const state = getAssignedMilestoneState(milestone);
  const waitingOutputs = countAssignedOutputsWaitingReview(milestone);
  const statusBadge = state === "WAITING_REVIEW"
    ? <Badge variant="warning">{translateI18n("milestonePage.underReview")}</Badge>
    : state === "ACTION" ? <Badge variant="default">{translateI18n("milestonePage.needsAction")}</Badge>
    : getMilestoneStatusBadge(milestone.status);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{milestone.name}</p>
          {statusBadge}
        </div>
        <p className="text-xs text-muted-foreground">
          {milestone.project?.name || translateI18n("copy.projectLabel")}
          {isAssignedProjectPaused(milestone) ? ` · ${translateI18n("projectStatus.POSTPONED")}` : ""}
        </p>
        {state === "ACTION" && waitingOutputs > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {translateI18n("milestonePage.waitingOutputs", { count: waitingOutputs })}
          </p>
        )}
      </div>
      {projectId && (
        <Link href={`/projects/${projectId}#project-milestone-${milestone.id}`}>
          <Button size="sm" variant="outline">
            {translateI18n("milestonePage.openMilestone")} <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </Link>
      )}
    </div>
  );
}

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
      return <Badge variant="outline">{translateMilestoneStatus(status)}</Badge>;
  }
}

function LoadingRows() {
  const { t } = useLanguage();
  return (
    <div role="status" aria-live="polite">
      <p className="px-5 py-3 text-sm text-muted-foreground">{t("common.loading")}</p>
      {[1, 2, 3].map((item) => (
        <div key={item} aria-hidden="true" className="h-24 motion-safe:animate-pulse border-t border-border/60 bg-muted/20" />
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
        {translateI18n("milestonePage.newWorkHelp")}
      </p>
    </div>
  );
}
