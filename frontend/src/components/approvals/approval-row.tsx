"use client";

import { CalendarClock, Check, ClipboardCheck, Eye, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { translate as translateI18n, getIntlLocale, translateOutputName } from "@/i18n";
import type { ApprovalItem, ApprovalStatus } from "@/types/approval";

export function ApprovalRow({
  item,
  canReview,
  onOpenProject,
  onOpenAction,
}: {
  item: ApprovalItem;
  canReview: boolean;
  onOpenProject: () => void;
  onOpenAction: (item: ApprovalItem, action: "APPROVE" | "REJECT") => void;
}) {
  const isClickable = Boolean(item.projectId);

  return (
    <div
      className={`border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5 ${isClickable ? "cursor-pointer transition-colors hover:bg-muted/15" : ""}`}
      role={isClickable ? "link" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? translateI18n("approvalUi.openProject", { name: item.projectName }) : undefined}
      onClick={() => {
        if (isClickable) onOpenProject();
      }}
      onKeyDown={(event) => {
        if (
          !isClickable ||
          event.target !== event.currentTarget ||
          (event.key !== "Enter" && event.key !== " ")
        ) {
          return;
        }
        event.preventDefault();
        onOpenProject();
      }}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ApprovalCategoryIcon category={item.category} />
            <span className="text-xs text-muted-foreground">{translateI18n(item.category === "OUTPUT_DOCUMENT" ? "outputQueue.category" : item.category === "PROJECT_PLAN" ? "approvalUi.projectPlans" : "approvalUi.deadlineChanges")}</span>
            <StatusBadge status={item.status} />
            {item.stepOrder != null && (
              <Badge variant="outline">{translateI18n("approvalUi.step", { number: item.stepOrder })}</Badge>
            )}
          </div>
          <h3 className="mt-2 font-semibold text-foreground">{item.category === "OUTPUT_DOCUMENT" ? translateOutputName(item.documentKey || "", item.title) : item.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {translateI18n("approvalUi.requestedSummary", { project: item.projectName, customer: item.clientName, name: item.submittedBy || translateI18n("approvalUi.unknown") })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(item.requestedAt || item.submittedAt)}
          </p>
          {item.category === "OUTPUT_DOCUMENT" && <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <p className="break-words">{item.phaseName}{"\u00b7"} {item.milestoneName}</p>
            <p>{translateI18n("outputQueue.snapshot", { version: item.versionNumber ?? "\u2014", count: item.fileCount ?? "\u2014" })}</p>
            {item.reviewBlockedReason && <p className="text-warning">{translateI18n(`outputQueue.${item.reviewBlockedReason}`)}</p>}
          </div>}
          <ApprovalSummary item={item} />
        </div>

        <div
          className="flex shrink-0 flex-wrap gap-2"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {item.category === "OUTPUT_DOCUMENT" ? (
            <Button size="sm" variant="outline" onClick={onOpenProject}>
              {translateI18n(item.canReview ? "outputQueue.openReview" : "outputQueue.viewOutput")}
            </Button>
          ) : item.status === "PENDING" && item.isCurrentApproval !== false && canReview ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive"
                onClick={() => onOpenAction(item, "REJECT")}
              >
                <X className="h-3.5 w-3.5" />
                {translateI18n("common.reject")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => onOpenAction(item, "APPROVE")}
              >
                <Check className="h-3.5 w-3.5" />
                {translateI18n("common.approve")}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => onOpenAction(item, "APPROVE")}
            >
              <Eye className="h-3.5 w-3.5" />
              {translateI18n("approvalUi.viewDetails")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  switch (status) {
    case "APPROVED":
      return <Badge variant="success">{translateI18n("milestoneStatus.APPROVED")}</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">{translateI18n("approvalStatus.REJECTED")}</Badge>;
    case "SUPERSEDED":
      return <Badge variant="outline">{translateI18n("documentStatus.SUPERSEDED")}</Badge>;
    default:
      return <Badge variant="warning">{translateI18n("approvalStatus.PENDING")}</Badge>;
  }
}

function ApprovalSummary({ item }: { item: ApprovalItem }) {
  if (item.category === "PROJECT_PLAN") {
    return (
      <div className="mt-3 border-l-2 border-border pl-3 text-xs text-muted-foreground">
        <p>
          {item.requestNote
            ? <>{translateI18n("copy.planNote")} <strong className="font-medium text-foreground">&quot;{item.requestNote}&quot;</strong></>
            : translateI18n("approvalUi.initialTimeline")}
        </p>
        {item.reviewNote && (
          <p className="mt-1">
            {translateI18n("copy.reviewNoteLabel")} <strong className="font-medium text-foreground">&quot;{item.reviewNote}&quot;</strong>
          </p>
        )}
      </div>
    );
  }

  if (item.category === "DEADLINE") {
    return (
      <div className="mt-3 grid gap-3 border-l-2 border-border pl-3 text-xs sm:grid-cols-2">
        <DeadlineMini title={translateI18n("approvalUi.currentTimeline")} deadline={item.currentDeadline} />
        <DeadlineMini title={translateI18n("approvalUi.proposedChange")} deadline={item.proposedDeadline} />
      </div>
    );
  }

  return null;
}

function DeadlineMini({
  title,
  deadline,
}: {
  title: string;
  deadline?: {
    start_date?: string | null;
    duration_working_days?: number | null;
    due_date?: string | null;
    change_reason?: string | null;
  } | null;
}) {
  return (
    <div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-muted-foreground">
        {translateI18n("approvalUi.deadlineSummary", { start: formatDate(deadline?.start_date), days: deadline?.duration_working_days || "-", due: formatDate(deadline?.due_date) })}
      </p>
      {deadline?.change_reason && (
        <p className="mt-1 text-muted-foreground">{translateI18n("approvalUi.reason", { reason: deadline.change_reason })}</p>
      )}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return translateI18n("approvalUi.dateUnavailable");
  return new Date(value).toLocaleDateString(getIntlLocale(), { dateStyle: "medium" });
}

function ApprovalCategoryIcon({ category }: { category: ApprovalItem["category"] }) {
  if (category === "DEADLINE") {
    return <CalendarClock className="h-3.5 w-3.5 text-warning" />;
  }
  return <ClipboardCheck className="h-3.5 w-3.5 text-primary" />;
}
