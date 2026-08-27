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
import { useReviewVersion } from "@/hooks/use-documents";
import { DocumentVersion } from "@/types/document";
import { CheckCircle2, XCircle } from "lucide-react";

interface DocumentReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  version: DocumentVersion | null;
  action: "APPROVE" | "REJECT" | null;
}

export function DocumentReviewDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  version,
  action,
}: DocumentReviewDialogProps) {
  const reviewMutation = useReviewVersion();
  const [feedback, setFeedback] = useState("");

  if (!version || !action) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (action === "REJECT" && (!feedback || feedback.length < 5)) {
      alert("Please provide at least 5 characters of feedback for rejection.");
      return;
    }

  try {
      const reviewStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

      await reviewMutation.mutateAsync({
        versionId: version.id,
        documentId,
        status: reviewStatus,
        feedback,
      });
      alert(`Document version v${version.versionNumber} ${action.toLowerCase()} successfully.`);
      onOpenChange(false);
      setFeedback("");
    } catch (err: any) {
      alert(err.message || "Failed to review document version");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center gap-2 mb-1">
          {action === "APPROVE" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : (
            <XCircle className="h-5 w-5 text-destructive" />
          )}
          <DialogTitle>
            {action === "APPROVE" ? "Approve Document Version" : "Reject Document Version"}
          </DialogTitle>
        </div>
        <DialogDescription>
          {action === "APPROVE"
            ? `Confirm approval for '${documentTitle}' (v${version.versionNumber}).`
            : `Provide revision feedback to the author for '${documentTitle}' (v${version.versionNumber}).`}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {action === "REJECT" ? "Rejection Reason & Revision Requirements *" : "Approval Remarks (Optional)"}
          </label>
          <textarea
            rows={3}
            placeholder={
              action === "REJECT"
                ? "Describe what sections need correction or additional information..."
                : "Add optional congratulatory or sign-off notes..."
            }
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            required={action === "REJECT"}
            disabled={reviewMutation.isPending}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={reviewMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={reviewMutation.isPending}
            variant={action === "REJECT" ? "destructive" : "default"}
          >
            {reviewMutation.isPending
              ? "Submitting Review..."
              : action === "APPROVE"
              ? "Confirm Approval"
              : "Confirm Rejection"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
