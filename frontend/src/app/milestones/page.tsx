"use client";
import { useLanguage } from "@/components/i18n/language-provider";

import { translate as translateI18n, type TranslationKey } from "@/i18n";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, Clock3, FolderKanban, List } from "lucide-react";
import { ListSummary } from '@/components/list-summary';
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { useMyAssignedMilestones } from "@/hooks/use-projects";
import { useOutputRepository } from "@/hooks/use-output-documents";
import { getAssignedMilestoneState, getAssignedMilestonesNeedingAction } from "@/lib/assigned-milestone-ux";

import { AssignedMilestoneQueue, HeadSaReviewQueue } from "@/components/milestones/milestone-queues";
import { PageDataFeedback } from "@/components/navigation-feedback";
import { DeadlineCalendar } from "@/components/milestones/deadline-calendar";

type QueueTab = "ACTION" | "REVIEW" | "PENDING_REVIEW" | "COMPLETED" | "ALL";

const rolePageCopy: Record<string, { eyebrow: TranslationKey; title: TranslationKey; description: TranslationKey }> = {
  SA: {
    eyebrow: "milestonePage.deliveryWorkspace",
    title: "milestonePage.assignedWork",
    description: "milestonePage.saDescription",
  },
  HEAD_SA: {
    eyebrow: "milestonePage.reviewWorkspace",
    title: "milestonePage.oversight",
    description: "milestonePage.headDescription",
  },
  SALES: {
    eyebrow: "milestonePage.projectDelivery",
    title: "milestonePage.projectMilestones",
    description: "milestonePage.salesDescription",
  },
  SUPER_ADMIN: {
    eyebrow: "milestonePage.workflowOversight",
    title: "milestonePage.operations",
    description: "milestonePage.adminDescription",
  },
};

export default function MilestonesPage() {
  useLanguage();
  const { user } = useAuth();
  const userRole = user?.role || "GUEST";
  const pageCopy = rolePageCopy[userRole] || rolePageCopy.SUPER_ADMIN;
  const isSaOrHeadSa = userRole === "SA" || userRole === "HEAD_SA";
  const isHeadSa = userRole === "HEAD_SA";
  const { data: milestones = [], isLoading, isError, isFetching } = useMyAssignedMilestones(isSaOrHeadSa);
  const { data: outputFiles = [], isLoading: pendingReviewsLoading, isError: pendingReviewsError,
    isFetching: pendingReviewsFetching } = useOutputRepository(isHeadSa);
  const reviewableOutputs = isHeadSa ? outputFiles.filter((item) => item.status === "IN_REVIEW") : [];

  const [activeTab, setActiveTab] = useState<QueueTab>("ACTION");
  const [view, setView] = useState<"LIST" | "CALENDAR">("LIST");
  const needsAction = useMemo(
    () => getAssignedMilestonesNeedingAction(milestones),
    [milestones]
  );
  const underReview = useMemo(
    () => milestones.filter((item) => getAssignedMilestoneState(item) === "WAITING_REVIEW"),
    [milestones]
  );
  const completed = useMemo(
    () => milestones.filter((item) => getAssignedMilestoneState(item) === "COMPLETED"),
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
        { label: translateI18n("milestonePage.assignedActions"), value: needsAction.length, scope: translateI18n('listSummary.assigned'), icon: ClipboardList, primary: true },
        { label: translateI18n("listSummary.outputReview"), value: reviewableOutputs.length, scope: translateI18n('listSummary.teamOutputs'), icon: FolderKanban },
        { label: translateI18n("listSummary.milestoneOwnReview"), value: underReview.length, scope: translateI18n('listSummary.assigned'), icon: Clock3 },
        { label: translateI18n("listSummary.milestoneComplete"), value: completed.length, scope: translateI18n('listSummary.assigned'), icon: CheckCircle2 },
      ]
    : [
        { label: translateI18n("milestonePage.needsAction"), value: needsAction.length, scope: translateI18n('listSummary.assigned'), icon: ClipboardList, primary: true },
        { label: translateI18n("milestonePage.underReview"), value: underReview.length, scope: translateI18n('listSummary.assigned'), icon: Clock3 },
        { label: translateI18n("listSummary.milestoneComplete"), value: completed.length, scope: translateI18n('listSummary.assigned'), icon: CheckCircle2 },
        { label: translateI18n("milestonePage.totalAssigned"), value: milestones.length, scope: translateI18n('listSummary.assigned'), icon: FolderKanban },
      ];

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 xl:px-8">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase text-primary">{translateI18n(pageCopy.eyebrow)}</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{translateI18n(pageCopy.title)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{translateI18n(pageCopy.description)}</p>
          <PageDataFeedback refreshing={isFetching && !isLoading || pendingReviewsFetching && !pendingReviewsLoading} />
        </div>
        <Link href="/projects" className="self-start sm:self-auto">
          <Button variant="outline" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            {translateI18n("nav.projects")}
          </Button>
        </Link>
      </header>

      {user && ["SA", "HEAD_SA", "SALES", "SUPER_ADMIN"].includes(userRole) && (
        <div className="inline-flex gap-1 rounded-xl border border-border/60 bg-card p-1" role="group" aria-label={translateI18n("deadlineCalendar.view")}>
          <Button size="sm" variant={view === "LIST" ? "secondary" : "ghost"} aria-pressed={view === "LIST"} onClick={() => setView("LIST")} className="gap-2"><List className="h-4 w-4" />{translateI18n("deadlineCalendar.list")}</Button>
          <Button size="sm" variant={view === "CALENDAR" ? "secondary" : "ghost"} aria-pressed={view === "CALENDAR"} onClick={() => setView("CALENDAR")} className="gap-2"><CalendarDays className="h-4 w-4" />{translateI18n("deadlineCalendar.calendar")}</Button>
        </div>
      )}

      {view === "CALENDAR" && user && ["SA", "HEAD_SA", "SALES", "SUPER_ADMIN"].includes(userRole) ? <DeadlineCalendar /> : !isSaOrHeadSa ? (
        <section className="page-surface px-5 py-14 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold text-foreground">{translateI18n("copy.milestoneLocation")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {translateI18n("milestonePage.openProjectHelp")}
          </p>
          <Link href="/projects" className="mt-4 inline-block">
            <Button size="sm">{translateI18n("copy.openProjects")}</Button>
          </Link>
        </section>
      ) : (
        <>
          <ListSummary aria-label={translateI18n('milestonePage.snapshot')} description={translateI18n(isHeadSa ? 'listSummary.milestoneHeadHelp' : 'listSummary.milestoneHelp')}
            items={snapshot} loading={isLoading || isHeadSa && pendingReviewsLoading} hasError={isError || isHeadSa && pendingReviewsError}
            refreshing={isFetching || isHeadSa && pendingReviewsFetching} />

          <section className="overflow-hidden page-surface">
            <div className="border-b border-border/60 p-4 sm:px-5">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <QueueTabButton
                  active={activeTab === "ACTION"}
                  label={translateI18n("milestonePage.needsAction")}
                  count={needsAction.length}
                  onClick={() => setActiveTab("ACTION")}
                />
                {isHeadSa && (
                  <QueueTabButton
                    active={activeTab === "PENDING_REVIEW"}
                    label={translateI18n("milestonePage.pendingReview")}
                    count={reviewableOutputs.length}
                    onClick={() => setActiveTab("PENDING_REVIEW")}
                  />
                )}
                <QueueTabButton
                  active={activeTab === "REVIEW"}
                  label={translateI18n("milestonePage.underReview")}
                  count={underReview.length}
                  onClick={() => setActiveTab("REVIEW")}
                />
                <QueueTabButton
                  active={activeTab === "COMPLETED"}
                  label={translateI18n("projectStatus.COMPLETED")}
                  count={completed.length}
                  onClick={() => setActiveTab("COMPLETED")}
                />
                <QueueTabButton
                  active={activeTab === "ALL"}
                  label={translateI18n("milestonePage.allAssigned")}
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
            ) : (
              <AssignedMilestoneQueue
                milestones={filteredMilestones}
                isLoading={isLoading}
                isError={isError}
                actionQueue={activeTab === "ACTION"}
              />
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
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
      <span className="text-[11px] text-muted-foreground">{count}</span>
    </Button>
  );
}
