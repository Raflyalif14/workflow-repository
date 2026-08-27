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
import { useProcessApproval, useAddApprovalComment } from "@/hooks/use-approvals";
import { ApprovalItem } from "@/types/approval";
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Download,
  CalendarClock,
  Layers,
  Send,
  MessageSquare,
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
  const addCommentMutation = useAddApprovalComment();

  const [action, setAction] = useState<"APPROVE" | "REJECT">(initialAction || "APPROVE");
  const [feedback, setFeedback] = useState("");
  const [commentText, setCommentText] = useState("");

  // Sync action state when dialog opens or initialAction prop changes
  React.useEffect(() => {
    if (initialAction) {
      setAction(initialAction);
    }
    if (!open) {
      setFeedback("");
      setCommentText("");
    }
  }, [initialAction, open]);

  if (!item) return null;

  const handleDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (action === "REJECT" && (!feedback || feedback.length < 5)) {
      alert("Please provide at least 5 characters of feedback for rejection.");
      return;
    }

    try {
      await processMutation.mutateAsync({
        id: item.id,
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

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    try {
      await addCommentMutation.mutateAsync({
        id: item.id,
        content: commentText,
      });
      setCommentText("");
      alert("Comment posted to ticket thread.");
    } catch (err: any) {
      alert(err.message || "Failed to post comment");
    }
  };

  const handleDownload = () => {
    if (!item.fileUrl) return;
    const downloadUrl = item.fileUrl.startsWith("http")
      ? item.fileUrl
      : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}${item.fileUrl}`;
    window.open(downloadUrl, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center gap-2 mb-1">
          {item.category === "DEADLINE" && <CalendarClock className="h-5 w-5 text-amber-400" />}
          {item.category === "MILESTONE" && <Layers className="h-5 w-5 text-primary" />}
          {item.category === "DOCUMENT" && <FileText className="h-5 w-5 text-blue-400" />}
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

          {/* If Document -> File Attachment Preview & Download */}
          {item.category === "DOCUMENT" && item.fileName && (
            <div className="flex items-center justify-between bg-muted/40 p-2.5 rounded-lg border border-border/40 mt-2">
              <span className="flex items-center gap-1.5 font-medium truncate max-w-[250px]">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{item.fileName}</span>
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleDownload}>
                <Download className="h-3 w-3" />
                <span>Download</span>
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
            <span>Submitted by: <strong className="text-foreground">{item.submittedBy}</strong></span>
            {item.deadline && (
              <span>Target: <strong className="text-foreground">{new Date(item.deadline).toLocaleDateString("id-ID", { dateStyle: "medium" })}</strong></span>
            )}
          </div>
        </div>

        {/* Decision Form */}
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
      </div>
    </Dialog>
  );
}
