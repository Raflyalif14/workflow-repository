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
  FileCheck2,
  PlayCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

  // Sync action state when dialog opens or initialAction prop changes
  React.useEffect(() => {
    if (initialAction) {
      setAction(initialAction);
    }
    if (!open) {
      setFeedback("");
    }
  }, [initialAction, open]);

  if (!item) return null;

  const isPending = item.status === "PENDING";
  const canProcess = isPending && item.isCurrentApproval !== false;

  const handleDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canProcess) return;
    if (action === "REJECT" && (!feedback || feedback.length < 5)) {
      alert("Please provide at least 5 characters of feedback for rejection.");
      return;
    }

    try {
      await processMutation.mutateAsync({
        item,
        action,
        feedback,
      });
      alert(`Approval request ${action.toLowerCase()}d successfully.`);
      onOpenChange(false);
      setFeedback("");
    } catch (err: any) {
      alert(err.message || "Failed to process decision");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center gap-2 mb-1">
          {item.category === "DEADLINE" && <CalendarClock className="h-5 w-5 text-amber-400" />}
          {item.category === "INITIATION" && <PlayCircle className="h-5 w-5 text-primary" />}
          {item.category === "SUBMISSION" && <FileCheck2 className="h-5 w-5 text-emerald-400" />}
          <DialogTitle>Head SA Review & Sign-Off</DialogTitle>
        </div>
        <DialogDescription>
          Review submission for <span className="font-semibold text-foreground">{item.projectName}</span> ({item.clientName}).
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Ticket Summary Box */}
        <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="font-mono">
              {item.category}
            </Badge>
            <span className="text-muted-foreground">
              Submitted: {new Date(item.submittedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>

          <h3 className="text-sm font-bold text-foreground">{item.title}</h3>
          <p className="text-muted-foreground">{item.details}</p>

          {item.category === "DEADLINE" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <DeadlineBox title="Effective Deadline" deadline={item.currentDeadline} />
              <DeadlineBox title="Proposed Deadline" deadline={item.proposedDeadline} />
            </div>
          )}

          {item.category === "INITIATION" && (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-2.5">
              <p>Milestone: <strong className="text-foreground">{item.milestoneName}</strong></p>
              <p>PIC: <strong className="text-foreground">{formatPicRequirement(item)}</strong></p>
              <p>Effective due: <strong className="text-foreground">{formatDate(item.currentDeadline?.due_date)}</strong></p>
              {item.requestNote && <p>Request note: <strong className="text-foreground">{item.requestNote}</strong></p>}
            </div>
          )}

          {item.category === "SUBMISSION" && (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-2.5">
              <p>Milestone: <strong className="text-foreground">{item.milestoneName}</strong></p>
              <p>Submitted by: <strong className="text-foreground">{item.submittedBy}</strong></p>
              <p>Submission note: <strong className="text-foreground">{item.submissionNote || "-"}</strong></p>
              {item.reviewNote && <p>Review note: <strong className="text-foreground">{item.reviewNote}</strong></p>}
              {item.currentDeadline?.due_date && <p>Effective due: <strong className="text-foreground">{formatDate(item.currentDeadline.due_date)}</strong></p>}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
            <span>Requested by: <strong className="text-foreground">{item.submittedBy}</strong></span>
            {item.deadline && (
              <span>Target: <strong className="text-foreground">{new Date(item.deadline).toLocaleDateString("id-ID", { dateStyle: "medium" })}</strong></span>
            )}
          </div>
        </div>

        {/* Decision Form */}
        {canProcess ? (
        <form onSubmit={handleDecision} className="space-y-3">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant={action === "APPROVE" ? "default" : "outline"}
              className={`flex-1 gap-1.5 text-xs h-9 ${
                action === "APPROVE" ? "bg-emerald-500 hover:bg-emerald-600 text-black font-semibold" : ""
              }`}
              onClick={() => setAction("APPROVE")}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Approve Request</span>
            </Button>
            <Button
              type="button"
              variant={action === "REJECT" ? "destructive" : "outline"}
              className="flex-1 gap-1.5 text-xs h-9"
              onClick={() => setAction("REJECT")}
            >
              <XCircle className="h-4 w-4" />
              <span>Reject (Needs Revision)</span>
            </Button>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              {action === "REJECT" ? "Rejection Reason / Revision Notes *" : "Approval Remarks (Optional)"}
            </label>
            <textarea
              rows={3}
              placeholder={
                action === "REJECT"
                  ? "Specify reasons for rejection and required corrections..."
                  : "Add optional sign-off remarks..."
              }
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              required={action === "REJECT"}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={processMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={processMutation.isPending}
              variant={action === "REJECT" ? "destructive" : "default"}
              className={action === "APPROVE" ? "bg-emerald-500 hover:bg-emerald-600 text-black font-semibold" : ""}
            >
              {processMutation.isPending ? "Processing..." : `Confirm ${action}`}
            </Button>
          </DialogFooter>
        </form>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs">
              <p>Status: <strong className="text-foreground">{item.status}</strong></p>
              <p>Reviewed by: <strong className="text-foreground">{item.reviewer?.full_name || item.reviewer?.fullName || "-"}</strong></p>
              {item.reviewNote && <p>Review note: <strong className="text-foreground">{item.reviewNote}</strong></p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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

function formatPicRequirement(item: ApprovalItem) {
  if (item.stageDefaultRole !== "SA") return "Not Required";
  return item.pic?.full_name || item.pic?.fullName || "-";
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
    <div className="rounded-lg border border-border/40 bg-muted/30 p-2.5 text-[11px]">
      <p className="font-semibold text-foreground">{title}</p>
      <p>Start: {formatDate(deadline?.start_date)}</p>
      <p>Duration: {deadline?.duration_working_days || "-"} working days</p>
      <p>Due: {formatDate(deadline?.due_date)}</p>
      {deadline?.change_reason && <p>Reason: {deadline.change_reason}</p>}
    </div>
  );
}
