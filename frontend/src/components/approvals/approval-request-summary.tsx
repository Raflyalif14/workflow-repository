"use client";

import { Badge } from "@/components/ui/badge";
import { translate as translateI18n, getIntlLocale } from "@/i18n";
import type { ApprovalItem } from "@/types/approval";

export function ApprovalRequestSummary({ item }: { item: ApprovalItem }) {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4 text-xs shadow-sm">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="font-semibold">
          {translateI18n(item.category === "PROJECT_PLAN" ? "approvalUi.projectPlans" : "approvalUi.deadlineChanges")}
        </Badge>
        <span className="text-muted-foreground">
          {translateI18n("approvalDialog.submittedAt", { date: new Date(item.submittedAt).toLocaleString(getIntlLocale(), { dateStyle: "medium", timeStyle: "short" }) })}
        </span>
      </div>

      <h3 className="text-sm font-semibold tracking-tight text-foreground">{item.title}</h3>
      <p className="text-muted-foreground">{item.details}</p>

      {item.category === "DEADLINE" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <DeadlineBox title={translateI18n("approvalDialog.effectiveDeadline")} deadline={item.currentDeadline} />
          <DeadlineBox title={translateI18n("approvalDialog.proposedDeadline")} deadline={item.proposedDeadline} />
        </div>
      )}

      {item.category === "PROJECT_PLAN" && (
        <div className="space-y-1 rounded-xl border border-border/40 bg-card p-3">
          <p>{translateI18n("copy.projectColon")} <strong className="text-foreground">{item.projectName}</strong></p>
          {item.phaseName && <p>{translateI18n("projectPhase.label", { phase: item.phaseName })}</p>}
          {item.requestNote && <p>{translateI18n("copy.planNote")} <strong className="text-foreground">&quot;{item.requestNote}&quot;</strong></p>}
          {item.reviewNote && <p>{translateI18n("copy.reviewNoteLabel")} <strong className="text-foreground">&quot;{item.reviewNote}&quot;</strong></p>}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
        <span>{translateI18n("copy.requestedBy")} <strong className="text-foreground">{item.submittedBy}</strong></span>
        {item.deadline && (
          <span>{translateI18n("copy.targetLabel")} <strong className="text-foreground">{new Date(item.deadline).toLocaleDateString(getIntlLocale(), { dateStyle: "medium" })}</strong></span>
        )}
      </div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(`${value.slice(0,10)}T00:00:00Z`).toLocaleDateString(getIntlLocale(), { dateStyle: "medium", timeZone: "UTC" });
}

function DeadlineBox({
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
    <div className="space-y-0.5 rounded-xl border border-border/40 bg-card p-3 text-[11px]">
      <p className="font-semibold text-foreground">{title}</p>
      <p>{translateI18n("approvalDialog.startDate", { date: formatDate(deadline?.start_date) })}</p>
      <p>{translateI18n("approvalDialog.duration", { count: deadline?.duration_working_days || "-" })}</p>
      <p>{translateI18n("approvalDialog.dueDate", { date: formatDate(deadline?.due_date) })}</p>
      {deadline?.change_reason && <p className="text-muted-foreground italic">{translateI18n("approvalDialog.reason", { reason: deadline.change_reason })}</p>}
    </div>
  );
}
