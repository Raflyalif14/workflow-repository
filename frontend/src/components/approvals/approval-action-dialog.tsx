"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProcessApproval } from "@/hooks/use-approvals";
import { ApprovalItem } from "@/types/approval";
import {
  CheckCircle2,
  XCircle,
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getApprovalTypeDisplay } from "@/lib/workflow-ux-helpers";

interface ApprovalActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ApprovalItem | null;
  initialAction?: "APPROVE" | "REJECT" | null;
}

export function ApprovalActionDialog({
  open,
  onOpenChange,
  item,
  initialAction = "APPROVE",
}: ApprovalActionDialogProps) {
  const processMutation = useProcessApproval();

  const [action, setAction] = useState<"APPROVE" | "REJECT">(initialAction || "APPROVE");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  // Sync action state when dialog opens or initialAction prop changes
  React.useEffect(() => {
    if (initialAction) {
      setAction(initialAction);
    }
    if (!open) {
      setFeedback("");
      setError("");
    }
  }, [initialAction, open]);

  if (!item) return null;

  const isPending = item.status === "PENDING";
  const canProcess = isPending && item.isCurrentApproval !== false;

  const handleDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canProcess) return;

    if (action === "REJECT" && (!feedback.trim() || feedback.trim().length < 5)) {
      setError("Please provide a specific rejection reason (at least 5 characters) so the requester knows what to fix.");
      return;
    }

    setError("");
    try {
      await processMutation.mutateAsync({
        item,
        action,
        feedback: feedback.trim() || undefined,
      });
      onOpenChange(false);
      setFeedback("");
    } catch (err: any) {
      setError(err.message || "Failed to process decision. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="mb-5 space-y-0">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            {item.category === "DEADLINE" && <CalendarClock className="h-4 w-4 text-amber-400" />}
            {item.category === "PROJECT_PLAN" && <ClipboardCheck className="h-4 w-4" />}
            {item.category === "SUBMISSION" && <FileCheck2 className="h-4 w-4 text-emerald-400" />}
          </span>
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-base font-semibold tracking-tight">Head SA Review & Sign-Off</DialogTitle>
            <DialogDescription className="mt-0 text-xs leading-relaxed">
              Review submission for <span className="font-semibold text-foreground">{item.projectName}</span> ({item.clientName}).
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4">
        {/* Ticket Summary Box */}
        <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4 text-xs shadow-sm">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="font-semibold">
              {getApprovalTypeDisplay(item.category)}
            </Badge>
            <span className="text-muted-foreground">
              Submitted: {new Date(item.submittedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>

          <h3 className="text-sm font-semibold tracking-tight text-foreground">{item.title}</h3>
          <p className="text-muted-foreground">{item.details}</p>

          {item.category === "DEADLINE" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <DeadlineBox title="Effective Deadline" deadline={item.currentDeadline} />
              <DeadlineBox title="Proposed Deadline" deadline={item.proposedDeadline} />
            </div>
          )}

          {item.category === "PROJECT_PLAN" && (
            <div className="space-y-1 rounded-xl border border-border/40 bg-card/70 p-3">
              <p>Project: <strong className="text-foreground">{item.projectName}</strong></p>
              {item.requestNote && <p>Plan note: <strong className="text-foreground">&quot;{item.requestNote}&quot;</strong></p>}
              {item.reviewNote && <p>Review note: <strong className="text-foreground">&quot;{item.reviewNote}&quot;</strong></p>}
            </div>
          )}

          {item.category === "SUBMISSION" && (
            <div className="space-y-1 rounded-xl border border-border/40 bg-card/70 p-3">
              <p>Milestone: <strong className="text-foreground">{item.milestoneName}</strong></p>
              <p>Submitted by: <strong className="text-foreground">{item.submittedBy}</strong></p>
              <p>Submission note: <strong className="text-foreground">{item.submissionNote ? `"${item.submissionNote}"` : "-"}</strong></p>
              {item.reviewNote && <p>Review note: <strong className="text-foreground">&quot;{item.reviewNote}&quot;</strong></p>}
              {item.currentDeadline?.due_date && <p>Effective due: <strong className="text-foreground">{formatDate(item.currentDeadline.due_date)}</strong></p>}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
            <span>Requested by: <strong className="text-foreground">{item.submittedBy}</strong></span>
            {item.deadline && (
              <span>Target: <strong className="text-foreground">{new Date(item.deadline).toLocaleDateString("id-ID", { dateStyle: "medium" })}</strong></span>
            )}
          </div>
        </div>

        {/* Decision Form */}
        {canProcess ? (
          <form onSubmit={handleDecision} className="space-y-3">
            <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-muted/10 p-1.5 sm:flex-row">
              <Button
                type="button"
                variant={action === "APPROVE" ? "default" : "outline"}
                className={`h-9 flex-1 gap-1.5 rounded-lg text-xs ${
                  action === "APPROVE" ? "bg-emerald-500 text-black font-semibold shadow-sm hover:bg-emerald-600" : ""
                }`}
                onClick={() => {
                  setAction("APPROVE");
                  setError("");
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Approve Request</span>
              </Button>
              <Button
                type="button"
                variant={action === "REJECT" ? "destructive" : "outline"}
                className="h-9 flex-1 gap-1.5 rounded-lg text-xs"
                onClick={() => {
                  setAction("REJECT");
                  setError("");
                }}
              >
                <XCircle className="h-4 w-4" />
                <span>Reject (Needs Revision)</span>
              </Button>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {action === "REJECT" ? "Rejection Reason / Revision Notes *" : "Approval Remarks (Optional)"}
              </label>
              <textarea
                rows={3}
                placeholder={
                  action === "REJECT"
                    ? "Specify reasons for rejection and required corrections (required)..."
                    : "Add optional sign-off remarks..."
                }
                value={feedback}
                onChange={(e) => {
                  setFeedback(e.target.value);
                  setError("");
                }}
                className="flex w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                required={action === "REJECT"}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <DialogFooter className="border-t border-border/40 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={processMutation.isPending}
                className="h-9 rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={processMutation.isPending}
                variant={action === "REJECT" ? "destructive" : "default"}
                className={action === "APPROVE" ? "h-9 rounded-lg bg-emerald-500 font-semibold text-black hover:bg-emerald-600" : "h-9 rounded-lg"}
              >
                {processMutation.isPending ? "Processing..." : `Confirm ${action === "APPROVE" ? "Approval" : "Rejection"}`}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1 rounded-xl border border-border/40 bg-muted/15 p-3 text-xs">
              <p>Status: <strong className="text-foreground">{item.status}</strong></p>
              <p>Reviewed by: <strong className="text-foreground">{item.reviewer?.full_name || item.reviewer?.fullName || "-"}</strong></p>
              {item.reviewNote && <p>Review note: <strong className="text-foreground">&quot;{item.reviewNote}&quot;</strong></p>}
            </div>
            <DialogFooter className="border-t border-border/40 pt-4">
              <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
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
    <div className="space-y-0.5 rounded-xl border border-border/40 bg-card/70 p-3 text-[11px]">
      <p className="font-semibold text-foreground">{title}</p>
      <p>Start: {formatDate(deadline?.start_date)}</p>
      <p>Duration: {deadline?.duration_working_days || "-"} working days</p>
      <p>Due: {formatDate(deadline?.due_date)}</p>
      {deadline?.change_reason && <p className="text-muted-foreground italic">Reason: &quot;{deadline.change_reason}&quot;</p>}
    </div>
  );
}
