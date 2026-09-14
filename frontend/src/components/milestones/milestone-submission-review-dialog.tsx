"use client";

import { type FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarDays,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Loader2,
  Package,
  UserRound,
} from "lucide-react";
import { MilestoneSubmissionHistoryPanel } from "@/components/milestones/milestone-submission-history-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDownloadSubmissionAttachment,
  useReviewSubmissionApproval,
  useSubmissionPackage,
  useSubmissionPackageHistory,
} from "@/hooks/use-milestone-workflow";
import { apiClient } from "@/lib/api-client";
import { milestoneKeys } from "@/lib/query-keys";
import {
  formatReviewDate,
  formatReviewDateTime,
  formatReviewParticipant,
  formatReviewStatus,
  getReviewActionCopy,
} from "@/lib/review-surface-ux";
import type {
  MilestoneSubmissionApproval,
  MilestoneSubmissionAttachment,
} from "@/types/project";

function formatFileSize(bytes: number | string): string {
  const size = typeof bytes === "string" ? Number(bytes) : bytes;
  if (!Number.isFinite(size) || size <= 0) return "Size unavailable";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function mimeLabel(mime: string): string {
  if (!mime || mime === "application/octet-stream") return "File";
  return mime.replace(/^application\//, "").replace(/^image\//, "image/");
}

export interface MilestoneSubmissionReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestoneId: string;
  milestoneName: string;
  projectId: string;
  projectName?: string;
  approvalId?: string;
  submissionNote?: string | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
  dueDate?: string | null;
  stepOrder?: number;
  status?: string;
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
  submittedBy,
  submittedAt,
  dueDate,
  stepOrder,
  status = "PENDING",
  readOnly = false,
}: MilestoneSubmissionReviewDialogProps) {
  const packageQuery = useSubmissionPackage(milestoneId, open);
  const packageHistory = useSubmissionPackageHistory(milestoneId, open);
  const downloadMutation = useDownloadSubmissionAttachment(milestoneId);
  const reviewMutation = useReviewSubmissionApproval(projectId, milestoneId);

  // Some queue callers omit approval metadata, so reuse the existing history endpoint.
  const approvalHistoryQuery = useQuery<MilestoneSubmissionApproval[]>({
    queryKey: milestoneKeys.submissionApprovalHistory(milestoneId),
    queryFn: () =>
      apiClient<MilestoneSubmissionApproval[]>(
        `/milestones/${milestoneId}/approval-history`
      ),
    enabled:
      open &&
      !readOnly &&
      (!approvalId ||
        submissionNote === undefined ||
        submittedBy === undefined ||
        submittedAt === undefined),
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
    (attachment) =>
      attachment.status === (isRejectedPackage ? "REJECTED" : "PENDING")
  );
  const isPending = reviewMutation.isPending;
  const pendingApproval = approvalHistoryQuery.data?.find(
    (approval) => approval.status === "PENDING"
  );
  const fallbackApproval =
    pendingApproval || approvalHistoryQuery.data?.[0] || null;
  const effectiveApprovalId =
    approvalId || pkg?.submission_approval_id || fallbackApproval?.id;
  const effectiveSubmissionNote =
    submissionNote !== undefined
      ? submissionNote
      : fallbackApproval?.submission_note || null;
  const effectiveSubmittedBy =
    submittedBy !== undefined
      ? submittedBy
      : fallbackApproval?.submitted_by?.full_name;
  const effectiveSubmittedAt =
    submittedAt !== undefined ? submittedAt : fallbackApproval?.submitted_at;
  const submissionDateLabel = formatReviewDateTime(effectiveSubmittedAt);
  const dueDateLabel = dueDate ? formatReviewDate(dueDate) : null;
  const currentRevision = packageHistory.data?.items.find(
    (revision) => revision.id === pkg?.id
  );
  const previousRejectedRevision = packageHistory.data?.items.find(
    (revision) => revision.status === "REJECTED" && revision.id !== pkg?.id
  );
  const reviewCopy = getReviewActionCopy("SUBMISSION", action);
  const canProcessReview =
    Boolean(effectiveApprovalId) &&
    !isPending &&
    !packageIsLoading &&
    !packageLoadFailed;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (packageIsLoading) {
      setError("Submission evidence is still loading.");
      return;
    }
    if (packageLoadFailed) {
      setError("Unable to load submission evidence.");
      return;
    }
    if (!effectiveApprovalId) {
      setError("Unable to load submission review details.");
      return;
    }
    if (reviewCopy.noteRequired && (!note.trim() || note.trim().length < 5)) {
      setError(
        "Please provide specific revision guidance of at least 5 characters."
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
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Failed to process review."
      );
    }
  };

  const handleDownload = (attachmentId: string) => {
    setDownloadError("");
    downloadMutation.mutate(attachmentId, {
      onError: () => setDownloadError("Unable to open submission evidence."),
    });
  };

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
      <div className="max-h-[calc(100vh-5rem)] overflow-y-auto pr-1">
        <DialogHeader className="mb-4 space-y-0">
          <div className="flex items-start gap-3 pr-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <FileCheck2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base font-semibold">
                  {readOnly
                    ? "Rejected submission evidence"
                    : reviewCopy.title}
                </DialogTitle>
                <Badge
                  variant={isRejectedPackage ? "destructive" : "warning"}
                  className="text-[10px]"
                >
                  {formatReviewStatus(
                    isRejectedPackage ? "REJECTED" : status,
                    isRejectedPackage
                  )}
                </Badge>
              </div>
              <DialogDescription className="mt-0 text-xs leading-5">
                {readOnly
                  ? "Review the retained evidence from this revision request."
                  : "Review the current work summary and evidence before making a decision."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <section className="mb-5 border-y border-border/60 py-3">
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-muted-foreground">Project</p>
              <p className="mt-0.5 truncate font-medium text-foreground">
                {projectName || "Project unavailable"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground">
                {stepOrder ? `Stage ${stepOrder}` : "Milestone"}
              </p>
              <p className="mt-0.5 truncate font-medium text-foreground">
                {milestoneName}
              </p>
            </div>
            <div className="flex min-w-0 items-start gap-2 text-muted-foreground">
              <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Submitted by{" "}
                <strong className="font-medium text-foreground">
                  {formatReviewParticipant(effectiveSubmittedBy)}
                </strong>
                <span aria-hidden="true"> · </span>
                {submissionDateLabel}
              </span>
            </div>
            {dueDateLabel && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Due{" "}
                  <strong className="font-medium text-foreground">
                    {dueDateLabel}
                  </strong>
                </span>
              </div>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Work summary
              </h3>
              {currentRevision && (
                <span className="text-xs text-muted-foreground">
                  Submission {currentRevision.revision}
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
              {effectiveSubmissionNote || "No submission note provided."}
            </p>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                {isRejectedPackage
                  ? "Retained rejected evidence"
                  : "Submitted evidence"}
              </h3>
              {visibleAttachments.length > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  {visibleAttachments.length} file
                  {visibleAttachments.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>

            {packageQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-5 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading submission evidence...</span>
              </div>
            ) : packageLoadFailed ? (
              <div
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Unable to load submission evidence.</span>
              </div>
            ) : isLegacy ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                <FileText className="h-4 w-4 shrink-0" />
                <span>
                  Legacy submission with no attachment package.
                  {!readOnly && " The review decision remains available."}
                </span>
              </div>
            ) : visibleAttachments.length === 0 ? (
              <p className="rounded-lg border border-border/60 px-3 py-4 text-xs text-muted-foreground">
                {isRejectedPackage
                  ? "No retained rejected evidence is available."
                  : "No submitted evidence is available."}
              </p>
            ) : (
              <div className="divide-y divide-border/50 rounded-lg border border-border/60">
                {visibleAttachments.map((attachment) => {
                  const isDownloading =
                    downloadMutation.isPending &&
                    downloadMutation.variables === attachment.id;

                  return (
                    <div
                      key={attachment.id}
                      className="flex min-w-0 flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-xs font-medium text-foreground"
                          title={attachment.file_name}
                        >
                          {attachment.file_name}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {mimeLabel(attachment.mime_type)} ·{" "}
                          {formatFileSize(attachment.file_size)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1.5 px-2 text-xs text-primary"
                          onClick={() => handleDownload(attachment.id)}
                          disabled={isDownloading}
                        >
                          {isDownloading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                          View
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1.5 px-2 text-xs"
                          onClick={() => handleDownload(attachment.id)}
                          disabled={isDownloading}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {downloadError && (
            <div
              className="flex items-start gap-2 text-xs text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{downloadError}</span>
            </div>
          )}

          {previousRejectedRevision?.review.note && (
            <section className="border-l-2 border-amber-500/50 pl-3">
              <p className="text-xs font-medium text-foreground">
                Previous revision guidance
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                {previousRejectedRevision.review.note}
              </p>
            </section>
          )}

          <MilestoneSubmissionHistoryPanel
            milestoneId={milestoneId}
            canRead={open}
          />

          {!readOnly && (
            <form
              onSubmit={handleSubmit}
              className="space-y-4 border-t border-border/60 pt-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Decision
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Approve the current submission or return it with clear revision guidance.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {(["APPROVE", "REJECT"] as const).map((decision) => {
                  const copy = getReviewActionCopy("SUBMISSION", decision);
                  const selected = action === decision;
                  return (
                    <Button
                      key={decision}
                      type="button"
                      variant="outline"
                      className={
                        decision === "REJECT"
                          ? selected
                            ? "h-10 border-destructive/60 bg-destructive/10 text-destructive"
                            : "h-10 border-destructive/30 text-destructive"
                          : selected
                            ? "h-10 border-primary/60 bg-primary/10 text-primary"
                            : "h-10"
                      }
                      onClick={() => {
                        setAction(decision);
                        setError("");
                      }}
                      disabled={
                        isPending || packageIsLoading || packageLoadFailed
                      }
                    >
                      {copy.selectionLabel}
                    </Button>
                  );
                })}
              </div>

              <div>
                <label
                  htmlFor="submission-review-note"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  {reviewCopy.noteLabel}
                  {reviewCopy.noteRequired && (
                    <span className="text-destructive" aria-hidden="true">
                      {" "}*
                    </span>
                  )}
                </label>
                <textarea
                  id="submission-review-note"
                  rows={3}
                  placeholder={reviewCopy.notePlaceholder}
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setError("");
                  }}
                  className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  required={reviewCopy.noteRequired}
                  aria-invalid={Boolean(error) && reviewCopy.noteRequired}
                  aria-describedby={error ? "submission-review-error" : undefined}
                  disabled={
                    isPending || packageIsLoading || packageLoadFailed
                  }
                />
              </div>

              {error && (
                <div
                  id="submission-review-error"
                  className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <DialogFooter className="border-t border-border/60 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full sm:w-auto"
                  onClick={() => handleOpenChange(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!canProcessReview}
                  variant={action === "REJECT" ? "outline" : "default"}
                  className={
                    action === "REJECT"
                      ? "h-10 w-full border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto"
                      : "h-10 w-full sm:w-auto"
                  }
                >
                  {isPending ? reviewCopy.pendingLabel : reviewCopy.submitLabel}
                </Button>
              </DialogFooter>
            </form>
          )}
        </div>
      </div>
    </Dialog>
  );
}
