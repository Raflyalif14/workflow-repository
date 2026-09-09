"use client";

import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Loader2,
  Package,
} from "lucide-react";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { milestoneKeys } from "@/lib/query-keys";
import {
  useDownloadSubmissionAttachment,
  useReviewSubmissionApproval,
  useSubmissionPackage,
} from "@/hooks/use-milestone-workflow";
import {
  MilestoneSubmissionApproval,
  MilestoneSubmissionAttachment,
} from "@/types/project";

function formatFileSize(bytes: number | string): string {
  const n = typeof bytes === "string" ? Number(bytes) : bytes;
  if (!n || isNaN(n)) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function mimeLabel(mime: string): string {
  if (!mime || mime === "application/octet-stream") return "";
  const short = mime.replace(/^application\//, "").replace(/^image\//, "img/");
  return short;
}

export interface MilestoneSubmissionReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestoneId: string;
  milestoneName: string;
  projectId: string;
  projectName?: string;
  approvalId?: string | undefined;
  submissionNote?: string | null;
  readOnly?: boolean;
}

export function MilestoneSubmissionReviewDialog({
  open,
  onOpenChange,
  milestoneId,
  milestoneName,
  projectId,
  projectName,
  approvalId,
  submissionNote,
  readOnly = false,
}: MilestoneSubmissionReviewDialogProps) {
  const packageQuery = useSubmissionPackage(milestoneId, open);
  const downloadMutation = useDownloadSubmissionAttachment(milestoneId);
  const reviewMutation = useReviewSubmissionApproval(projectId, milestoneId);

  // Fallback query for approval details if approvalId or submissionNote is omitted by caller
  const historyQuery = useQuery<MilestoneSubmissionApproval[]>({
    queryKey: milestoneKeys.submissionApprovalHistory(milestoneId),
    queryFn: () =>
      apiClient<MilestoneSubmissionApproval[]>(
        `/milestones/${milestoneId}/approval-history`
      ),
    enabled: open && !readOnly && (!approvalId || submissionNote === undefined),
    staleTime: 0,
  });

  const [action, setAction] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");

  const pkg = packageQuery.data;
  const packageIsLoading = packageQuery.isLoading;
  const packageLoadFailed = packageQuery.isError;
  const isLegacy = packageQuery.isSuccess && pkg === null;
  const attachments: MilestoneSubmissionAttachment[] = pkg?.attachments ?? [];
  const isRejectedPackage = pkg?.status === "REJECTED";
  const visibleAttachments = attachments.filter(
    (attachment) => attachment.status === (isRejectedPackage ? "REJECTED" : "PENDING")
  );
  const isPending = reviewMutation.isPending;

  const pendingApproval = historyQuery.data?.find((a) => a.status === "PENDING");
  const effectiveApprovalId =
    approvalId ||
    pkg?.submission_approval_id ||
    pendingApproval?.id ||
    historyQuery.data?.[0]?.id;

  const effectiveSubmissionNote =
    submissionNote !== undefined
      ? submissionNote
      : (pendingApproval?.submission_note ?? historyQuery.data?.[0]?.submission_note ?? null);
  const canProcessReview =
    Boolean(effectiveApprovalId) &&
    !isPending &&
    !packageIsLoading &&
    !packageLoadFailed;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (packageIsLoading) {
      setError("Submission attachments are still loading.");
      return;
    }
    if (packageLoadFailed) {
      setError("Unable to load submission attachments.");
      return;
    }
    if (!effectiveApprovalId) {
      setError("Unable to load submission review details.");
      return;
    }
    if (action === "REJECT" && (!note.trim() || note.trim().length < 5)) {
      setError(
        "Please provide a specific rejection reason (at least 5 characters) so the SA knows what to fix."
      );
      return;
    }
    setError("");
    try {
      await reviewMutation.mutateAsync({
        approvalId: effectiveApprovalId,
        decision: action,
        note: note.trim() || undefined,
      });
      setNote("");
      setError("");
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to process review."
      );
    }
  };

  const handleDownload = (attachmentId: string) => {
    setDownloadError("");
    downloadMutation.mutate(attachmentId, {
      onError: () => setDownloadError("Unable to open submission attachment."),
    });
  };

  // Reset form state when dialog closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setAction("APPROVE");
      setNote("");
      setError("");
      setDownloadError("");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader className="mb-4 space-y-0">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <FileCheck2 className="h-4 w-4 text-emerald-400" />
          </span>
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-base font-semibold tracking-tight">
              {readOnly ? "Rejected Submission" : "Review Milestone Submission"}
            </DialogTitle>
            <DialogDescription className="mt-0 text-xs leading-relaxed">
              {readOnly ? "View retained evidence for" : "Review submitted work for"}{" "}
              <span className="font-semibold text-foreground">
                {milestoneName}
              </span>
              {projectName && (
                <>
                  {" "}
                  in{" "}
                  <span className="font-semibold text-foreground">
                    {projectName}
                  </span>
                </>
              )}
              .
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4">
        {/* Submission Note */}
        {effectiveSubmissionNote && (
          <div className="rounded-xl border border-border/40 bg-muted/10 p-3 text-xs">
            <p className="mb-1 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              Submission Note
            </p>
            <p className="text-foreground">&quot;{effectiveSubmissionNote}&quot;</p>
          </div>
        )}

        {/* Attachments Section */}
        <div className="rounded-xl border border-border/60 bg-muted/10 p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              {isRejectedPackage ? "Rejected Submission Attachments" : "Submission Attachments"}
            </span>
            {visibleAttachments.length > 0 && (
              <Badge variant={isRejectedPackage ? "destructive" : "outline"} className="text-[10px]">
                {visibleAttachments.length} file
                {visibleAttachments.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {packageQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading submission package...</span>
            </div>
          ) : packageLoadFailed ? (
            <div
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Unable to load submission attachments.</span>
            </div>
          ) : isLegacy ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0" />
              <span>
                Legacy submission - no attachment package.
                {!readOnly && " You can still approve or reject this submission."}
              </span>
            </div>
          ) : visibleAttachments.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {isRejectedPackage
                ? "No retained rejected attachments found in this package."
                : "No pending attachments found in this package."}
            </p>
          ) : (
            <div className="space-y-2">
              {visibleAttachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/70 p-2.5 text-xs transition-colors hover:border-primary/25"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {attachment.file_name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatFileSize(attachment.file_size)}
                      {mimeLabel(attachment.mime_type) &&
                        ` - ${mimeLabel(attachment.mime_type)}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 rounded-md px-2 text-[11px] text-primary hover:bg-primary/10"
                    onClick={() => handleDownload(attachment.id)}
                    disabled={
                      downloadMutation.isPending &&
                      downloadMutation.variables === attachment.id
                    }
                  >
                    {downloadMutation.isPending &&
                    downloadMutation.variables === attachment.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                    <span>View</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => handleDownload(attachment.id)}
                    disabled={
                      downloadMutation.isPending &&
                      downloadMutation.variables === attachment.id
                    }
                  >
                    <Download className="h-3 w-3" />
                    <span>Download</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {downloadError && (
          <div
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{downloadError}</span>
          </div>
        )}

        {!readOnly && (
          <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-muted/10 p-1.5 sm:flex-row">
            <Button
              type="button"
              variant={action === "APPROVE" ? "default" : "outline"}
              className={`h-9 flex-1 gap-1.5 rounded-lg text-xs ${
                action === "APPROVE"
                  ? "bg-emerald-500 text-black font-semibold shadow-sm hover:bg-emerald-600"
                  : ""
              }`}
              onClick={() => {
                setAction("APPROVE");
                setError("");
              }}
              disabled={isPending || packageIsLoading || packageLoadFailed}
            >
              <FileCheck2 className="h-4 w-4" />
              <span>Approve Submission</span>
            </Button>
            <Button
              type="button"
              variant={action === "REJECT" ? "destructive" : "outline"}
              className="h-9 flex-1 gap-1.5 rounded-lg text-xs"
              onClick={() => {
                setAction("REJECT");
                setError("");
              }}
              disabled={isPending || packageIsLoading || packageLoadFailed}
            >
              <AlertCircle className="h-4 w-4" />
              <span>Reject (Needs Revision)</span>
            </Button>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {action === "REJECT"
                ? "Rejection Reason / Revision Notes *"
                : "Approval Remarks (Optional)"}
            </label>
            <textarea
              rows={3}
              placeholder={
                action === "REJECT"
                  ? "Specify reasons for rejection and required corrections (required)..."
                  : "Add optional sign-off remarks..."
              }
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setError("");
              }}
              className="flex w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              required={action === "REJECT"}
              disabled={isPending || packageIsLoading || packageLoadFailed}
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
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              className="h-9 rounded-lg"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canProcessReview}
              variant={action === "REJECT" ? "destructive" : "default"}
              className={
                action === "APPROVE"
                  ? "h-9 rounded-lg bg-emerald-500 font-semibold text-black hover:bg-emerald-600"
                  : "h-9 rounded-lg"
              }
            >
              {isPending
                ? "Processing..."
                : `Confirm ${action === "APPROVE" ? "Approval" : "Rejection"}`}
            </Button>
          </DialogFooter>
          </form>
        )}
      </div>
    </Dialog>
  );
}
