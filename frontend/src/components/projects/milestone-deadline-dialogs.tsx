"use client";

import { ApiError } from "@/lib/api-client";
import { translate as translateI18n, translateStoredError } from "@/i18n";
import { FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { hasEffectiveDeadline } from "@/lib/milestone-ui-state";
import {
  formatReviewDate,
  formatReviewDateTime,
  formatReviewParticipant,
  getDeadlineChangeDays,
  getReviewActionCopy,
} from "@/lib/review-surface-ux";
import { formatBusinessAuditValue } from "@/lib/activity-timeline";
import { useReviewDeadlineApproval, useSaveMilestoneDeadline } from "@/hooks/use-milestone-workflow";
import { ProjectMilestonePhase4 } from "@/types/project";

export function DeadlineDialog({
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
  const [confirming, setConfirming] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || error === "businessAudit.stale") return;
    const days = Number(duration);
    if (!startDate || !Number.isInteger(days) || days <= 0) {
      setError("projectDetail.deadlineScheduleRequired");
      return;
    }
    if (hasEffectiveDeadline(milestone) && !reason.trim()) {
      setError("projectDetail.deadlineReasonRequired");
      return;
    }
    setError("");
    if (!confirming) { setConfirming(true); return; }
    busy.current = true;
    try {
      await saveDeadline.mutateAsync({
        start_date: startDate,
        duration_working_days: days,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setReason("");
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof ApiError && saveError.status === 409 ? "businessAudit.stale" : "projectDetail.deadlineRequestFailed");
    } finally { busy.current = false; }
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy.current) { if (!value) { setConfirming(false); setError(""); } onOpenChange(value); } }}>
      <DialogHeader>
        <DialogTitle>{translateI18n("copy.requestDeadline")}</DialogTitle>
        <DialogDescription>{milestone.name}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label htmlFor="deadline-start-date" className="block text-xs font-semibold text-muted-foreground mb-1">{translateI18n("copy.newStartDate")}</label>
          <Input
            id="deadline-start-date"
            type="date"
            value={startDate}
            onChange={(event) => { saveDeadline.prepare?.(); setStartDate(event.target.value); setConfirming(false); }}
            aria-describedby={error ? "deadline-change-error" : undefined}
            required
          />
        </div>
        <div>
          <label htmlFor="deadline-working-days" className="block text-xs font-semibold text-muted-foreground mb-1">{translateI18n("copy.workingDays")}</label>
          <Input
            id="deadline-working-days"
            type="number"
            min="1"
            step="1"
            value={duration}
            onChange={(event) => { saveDeadline.prepare?.(); setDuration(event.target.value); setConfirming(false); }}
            placeholder={translateI18n("ui.workingDays")}
            aria-describedby={error ? "deadline-change-error" : undefined}
            required
          />
        </div>
        <div>
          <label htmlFor="deadline-change-reason" className="block text-xs font-semibold text-muted-foreground mb-1">{translateI18n("copy.deadlineReason")}</label>
          <textarea
            id="deadline-change-reason"
            rows={3}
            value={reason}
            onChange={(event) => { saveDeadline.prepare?.(); setReason(event.target.value); setConfirming(false); }}
            placeholder={translateI18n("projectDetail.deadlineReasonPlaceholder")}
            className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-describedby={error ? "deadline-change-error" : undefined}
            required
          />
        </div>
        {error && <p id="deadline-change-error" className="text-sm text-destructive" role="alert">{translateStoredError(error)}</p>}
        {confirming && <p className="whitespace-pre-wrap text-sm">{translateI18n("businessAudit.check")} {milestone.name}: {formatBusinessAuditValue("start_date",milestone.start_date)} / {milestone.duration_working_days || "-"} {" -> "} {formatBusinessAuditValue("start_date",startDate)} / {duration}. {reason}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { setConfirming(false); setError(""); onOpenChange(false); }} disabled={saveDeadline.isPending}>
            {translateI18n("common.cancel")}
          </Button>
          <Button type="submit" disabled={saveDeadline.isPending || error === "businessAudit.stale"}>
            {translateI18n(saveDeadline.isPending ? "common.saving" : confirming ? "businessAudit.submit" : "reviewConfirm.continue")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export function DeadlineReviewDialog({
  open,
  onOpenChange,
  projectId,
  milestoneId,
  approvalId,
  type,
  decision,
  projectName,
  milestoneName,
  currentDeadline,
  requestedDeadline,
  requestedBy,
  requestedAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  milestoneId: string;
  approvalId?: string;
  type: "DEADLINE";
  decision: "APPROVE" | "REJECT";
  projectName?: string;
  milestoneName?: string;
  currentDeadline?: {
    start_date?: string | null;
    duration_working_days?: number | null;
    due_date?: string | null;
  } | null;
  requestedDeadline?: {
    start_date?: string | null;
    duration_working_days?: number | null;
    due_date?: string | null;
    change_reason?: string | null;
  } | null;
  requestedBy?: string | null;
  requestedAt?: string | null;
}) {
  const reviewDeadline = useReviewDeadlineApproval(projectId, milestoneId);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const pending = reviewDeadline.isPending;
  const reviewCopy = getReviewActionCopy(type, decision);
  const deadlineDelta =
    type === "DEADLINE"
      ? getDeadlineChangeDays(
          currentDeadline?.due_date,
          requestedDeadline?.due_date
        )
      : null;
  const deadlineDeltaLabel =
    deadlineDelta === null
      ? null
      : deadlineDelta === 0
        ? "No change in calendar days"
        : `${Math.abs(deadlineDelta)} calendar day${
            Math.abs(deadlineDelta) === 1 ? "" : "s"
          } ${deadlineDelta > 0 ? "later" : "earlier"}`;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || error === "businessAudit.stale") return;
    if (!approvalId) return;
    if (decision === "REJECT" && !note.trim()) {
      setError("projectDetail.reviewReasonRequired");
      return;
    }
    setError("");
    if (!confirming) { reviewDeadline.prepare?.(); setConfirming(true); return; }
    busy.current = true;
    try {
      const input = { approvalId, decision, note: note.trim() || undefined };
      await reviewDeadline.mutateAsync(input);
      setNote("");
      onOpenChange(false);
    } catch (reviewError) {
      setError(reviewError instanceof ApiError && reviewError.status === 409 ? "businessAudit.stale" : "projectDetail.reviewFailed");
    } finally { busy.current = false; }
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy.current) { if (!value) { setConfirming(false); setError(""); } onOpenChange(value); } }}>
      <DialogHeader className="mb-4">
        <DialogTitle>{reviewCopy.title}</DialogTitle>
        <DialogDescription>
          {translateI18n("projectDetail.compareDeadline")}
        </DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        {(projectName || milestoneName) && (
          <div className="grid gap-3 border-y border-border/60 py-3 text-xs sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-muted-foreground">{translateI18n("copy.projectLabel")}</p>
              <p className="mt-0.5 truncate font-medium text-foreground">
                {projectName || "Unavailable"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground">{translateI18n("nav.milestones")}</p>
              <p className="mt-0.5 truncate font-medium text-foreground">
                {milestoneName || "Unavailable"}
              </p>
            </div>
          </div>
        )}

        {type === "DEADLINE" && (
          <div className="space-y-4">
            <section aria-label={translateI18n("projectDetail.deadlineComparison")}>
              <div className="grid gap-3 sm:grid-cols-2 sm:divide-x sm:divide-border/60">
                <div className="min-w-0 sm:pr-3">
                  <p className="text-xs text-muted-foreground">
                    {translateI18n("projectDetail.currentDeadline")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {formatReviewDate(currentDeadline?.due_date)}
                  </p>
                  {currentDeadline?.duration_working_days != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {translateI18n("projectDetail.workingDays", { count: currentDeadline.duration_working_days })}
                    </p>
                  )}
                </div>
                <div className="min-w-0 border-t border-border/60 pt-3 sm:border-t-0 sm:pl-3 sm:pt-0">
                  <p className="text-xs text-muted-foreground">
                    {translateI18n("projectDetail.requestedDeadline")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {formatReviewDate(requestedDeadline?.due_date)}
                  </p>
                  {requestedDeadline?.duration_working_days != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {translateI18n("projectDetail.workingDays", { count: requestedDeadline.duration_working_days })}
                    </p>
                  )}
                </div>
              </div>
              {deadlineDeltaLabel && (
                <p className="mt-3 text-xs font-medium text-primary">
                  {deadlineDeltaLabel}
                </p>
              )}
            </section>

            <section className="space-y-1">
              <p className="text-xs text-muted-foreground">{translateI18n("copy.reason")}</p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {requestedDeadline?.change_reason?.trim() ||
                  "No reason provided."}
              </p>
            </section>

            <p className="text-xs text-muted-foreground">
              {translateI18n("projectDetail.requestedBy", { name: formatReviewParticipant(requestedBy) })}{" "}
              <span aria-hidden="true"> · </span>
              {formatReviewDateTime(requestedAt)}
            </p>
          </div>
        )}

        <div>
          <label
            htmlFor="workflow-review-note"
            className="mb-1 block text-xs font-semibold text-muted-foreground"
          >
            {reviewCopy.noteLabel}
            {reviewCopy.noteRequired && " *"}
          </label>
          <textarea
            id="workflow-review-note"
            rows={4}
            value={note}
            onChange={(event) => {
              setNote(event.target.value); setConfirming(false);
              if (error !== "businessAudit.stale") setError("");
            }}
            placeholder={reviewCopy.notePlaceholder}
            className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            required={reviewCopy.noteRequired}
            aria-invalid={Boolean(error) && reviewCopy.noteRequired}
            aria-describedby={error ? "workflow-review-error" : undefined}
            disabled={pending}
          />
        </div>
        {error && (
          <p
            id="workflow-review-error"
            className="text-sm text-destructive"
            role="alert"
          >
            {translateStoredError(error)}
          </p>
        )}
        {confirming && <p className="whitespace-pre-wrap text-sm">{translateI18n("businessAudit.check")} {milestoneName} - {translateI18n(decision === "APPROVE" ? "reviewConfirm.approve" : "reviewConfirm.reject")}. {note}</p>}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => { setConfirming(false); setError(""); onOpenChange(false); }}
            disabled={pending}
          >
            {translateI18n("common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={!approvalId || pending || error === "businessAudit.stale"}
            variant={decision === "REJECT" ? "outline" : "default"}
            className={
              decision === "REJECT"
                ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                : ""
            }
          >
            {pending ? reviewCopy.pendingLabel : confirming ? reviewCopy.submitLabel : translateI18n("reviewConfirm.continue")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
