"use client";

import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  CalendarDays,
  Eye,
  FileCheck2,
  FileText,
  Loader2,
  Paperclip,
  X,
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
import { Input } from "@/components/ui/input";
import {
  useDownloadSubmissionHistoryAttachment,
  useSubmissionPackageHistory,
  useSubmitMilestone,
} from "@/hooks/use-milestone-workflow";
import {
  appendDocumentFiles,
  canSubmitDocumentFiles,
  DOCUMENT_ACCEPT,
  getDocumentFileKey,
  MAX_DOCUMENT_FILES,
  removeDocumentFile,
} from "@/lib/document-file-selection";
import { getMilestoneSubmissionPresentation } from "@/lib/milestone-submission-ux";

function formatFileSize(size: number | string): string {
  const bytes = typeof size === "string" ? Number(size) : size;
  if (!Number.isFinite(bytes) || bytes <= 0) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface MilestoneSubmissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName?: string | null;
  milestoneId: string;
  milestoneName: string;
  milestoneStatus?: string;
  stepOrder?: number;
  dueDate?: string | null;
  onSuccess: () => void;
}

export function MilestoneSubmissionDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  milestoneId,
  milestoneName,
  milestoneStatus = "IN_PROGRESS",
  stepOrder,
  dueDate,
  onSuccess,
}: MilestoneSubmissionDialogProps) {
  const submitMilestone = useSubmitMilestone(projectId, milestoneId);
  const history = useSubmissionPackageHistory(milestoneId, open);
  const retainedDownload = useDownloadSubmissionHistoryAttachment(milestoneId);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const presentation = getMilestoneSubmissionPresentation(
    milestoneStatus,
    history.data?.items
  );
  const revision = presentation.latestRejectedRevision;
  const dueDateLabel = formatDate(dueDate);
  const reviewedAtLabel = formatDateTime(revision?.review.reviewedAt);
  const isActionable =
    presentation.mode === "SUBMIT" || presentation.mode === "REVISION";

  const reset = () => {
    setNote("");
    setFiles([]);
    setError(null);
    setSelectionError(null);
    setDownloadError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !submitMilestone.isPending) reset();
    onOpenChange(nextOpen);
  };

  const addFiles = (selectedFiles: FileList | null) => {
    if (!selectedFiles?.length) return;
    const selection = appendDocumentFiles(files, selectedFiles);
    setFiles(selection.files);
    setSelectionError(selection.error);
    setError(null);
  };

  const removeFile = (index: number) => {
    setFiles((current) => removeDocumentFile(current, index));
    setSelectionError(null);
    setError(null);
  };

  const openRetainedAttachment = (packageId: string, attachmentId: string) => {
    setDownloadError(null);
    retainedDownload.mutate(
      { packageId, attachmentId },
      {
        onError: () =>
          setDownloadError("Unable to open the retained submission evidence."),
      }
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !isActionable ||
      !canSubmitDocumentFiles(files, selectionError) ||
      submitMilestone.isPending
    ) {
      return;
    }

    setError(null);
    try {
      await submitMilestone.mutateAsync({ files, note });
      reset();
      onSuccess();
      onOpenChange(false);
    } catch {
      setError(
        presentation.mode === "REVISION"
          ? "Unable to submit the revision. Please try again."
          : "Unable to submit work for review. Please try again."
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div className="max-h-[calc(100vh-5rem)] overflow-y-auto pr-1">
        <DialogHeader className="mb-4 space-y-0">
          <div className="flex items-start gap-3 pr-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
              <FileCheck2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base font-semibold">
                  {presentation.title}
                </DialogTitle>
                <Badge
                  variant={
                    presentation.mode === "REVISION"
                      ? "warning"
                      : presentation.mode === "WAITING"
                        ? "outline"
                        : "secondary"
                  }
                  className="text-[10px]"
                >
                  {presentation.stateLabel}
                </Badge>
              </div>
              <DialogDescription className="mt-0 text-xs leading-5">
                {presentation.mode === "REVISION"
                  ? "Send updated work and new evidence to Head SA for another review."
                  : presentation.mode === "WAITING"
                    ? "Your submission has been received and is being reviewed by Head SA."
                    : "Send the completed work and supporting evidence to Head SA for review."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mb-4 grid gap-2 rounded-lg border border-border/60 bg-muted/15 p-3 text-xs sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-muted-foreground">Project</p>
            <p className="mt-0.5 truncate font-medium text-foreground">
              {projectName || "Project"}
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
          {dueDateLabel && (
            <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span>
                Due <strong className="font-medium text-foreground">{dueDateLabel}</strong>
              </span>
            </div>
          )}
        </div>

        {presentation.mode === "REVISION" && (
          <section className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-xs font-semibold text-amber-300">
              Revision requested
            </p>
            {(revision?.review.reviewedBy || reviewedAtLabel) && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {revision?.review.reviewedBy && (
                  <>
                    Reviewer{" "}
                    <strong className="font-medium text-foreground">
                      {revision.review.reviewedBy.fullName}
                    </strong>
                  </>
                )}
                {revision?.review.reviewedBy && reviewedAtLabel && " · "}
                {reviewedAtLabel && <>Requested {reviewedAtLabel}</>}
              </p>
            )}
            <div className="mt-3">
              <p className="text-xs font-medium text-foreground">
                What needs to change
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                {revision?.review.note ||
                  (history.isLoading
                    ? "Loading revision guidance..."
                    : "No revision guidance is available.")}
              </p>
            </div>
          </section>
        )}

        {presentation.mode === "REVISION" &&
          presentation.retainedAttachments.length > 0 && (
            <section className="mb-5">
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Retained rejected evidence
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  These files remain available for reference and are not part of
                  the new upload selection.
                </p>
              </div>
              <div className="divide-y divide-border/50 rounded-lg border border-border/60">
                {presentation.retainedAttachments.map((attachment) => {
                  const isDownloading =
                    retainedDownload.isPending &&
                    retainedDownload.variables?.packageId === revision?.id &&
                    retainedDownload.variables.attachmentId === attachment.id;

                  return (
                    <div
                      key={attachment.id}
                      className="flex min-w-0 items-center gap-3 px-3 py-2.5"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-xs font-medium text-foreground"
                          title={attachment.fileName}
                        >
                          {attachment.fileName}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {attachment.mimeType || "File"} ·{" "}
                          {formatFileSize(attachment.fileSize)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 shrink-0 gap-1.5 px-2 text-xs"
                        disabled={isDownloading}
                        onClick={() =>
                          revision &&
                          openRetainedAttachment(revision.id, attachment.id)
                        }
                      >
                        {isDownloading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                        View
                      </Button>
                    </div>
                  );
                })}
              </div>
              {downloadError && (
                <p
                  className="mt-2 flex items-start gap-2 text-xs text-destructive"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {downloadError}
                </p>
              )}
            </section>
          )}

        {history.isError && presentation.mode === "REVISION" && (
          <div
            className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Unable to load revision guidance and retained evidence. You can
              still submit new work.
            </span>
          </div>
        )}

        {isActionable ? (
          <form className="space-y-5" onSubmit={submit}>
            <div>
              <label
                className="mb-2 block text-sm font-medium text-foreground"
                htmlFor="milestone-submission-note"
              >
                {presentation.mode === "REVISION"
                  ? "Revision summary"
                  : "Work summary"}{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="milestone-submission-note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  presentation.mode === "REVISION"
                    ? "Summarize what changed in this revision..."
                    : "Summarize the completed work for Head SA..."
                }
                disabled={submitMilestone.isPending}
                className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div>
              <div className="mb-2">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="milestone-submission-files"
                >
                  {presentation.mode === "REVISION"
                    ? "New revision evidence"
                    : "Required evidence"}{" "}
                  <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Add 1-{MAX_DOCUMENT_FILES} supported files, up to 50 MB each.
                </p>
              </div>
              <label
                htmlFor="milestone-submission-files"
                className="flex min-h-24 w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/15 px-4 text-center transition-colors hover:border-primary/40 hover:bg-muted/25 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
              >
                <Paperclip className="mb-2 h-6 w-6 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">
                  Choose one or more files
                </span>
                <span className="mt-1 text-[11px] text-muted-foreground">
                  Files are added to this submission only
                </span>
                <Input
                  id="milestone-submission-files"
                  type="file"
                  className="sr-only"
                  accept={DOCUMENT_ACCEPT}
                  multiple
                  disabled={submitMilestone.isPending}
                  aria-describedby={
                    selectionError ? "milestone-submission-file-error" : undefined
                  }
                  onChange={(event) => {
                    addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>

              {files.length > 0 && (
                <div className="mt-3 divide-y divide-border/50 rounded-lg border border-border/60">
                  {files.map((file, index) => (
                    <div
                      key={getDocumentFileKey(file)}
                      className="flex min-w-0 items-center gap-3 px-3 py-2.5"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-xs font-medium text-foreground"
                          title={file.name}
                        >
                          {file.name}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {file.type || "File"} · {formatFileSize(file.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeFile(index)}
                        disabled={submitMilestone.isPending}
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {selectionError && (
                <p
                  id="milestone-submission-file-error"
                  className="mt-2 flex items-start gap-2 text-xs text-destructive"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {selectionError}
                </p>
              )}
            </div>

            <div className="border-t border-border/60 pt-4">
              <h3 className="text-sm font-semibold text-foreground">
                Review before submitting
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {files.length
                  ? `${files.length} new file${files.length === 1 ? "" : "s"} will be sent to Head SA for review.`
                  : "Add at least one new file before submitting."}
                {presentation.mode === "REVISION" &&
                  " Retained evidence remains unchanged."}
              </p>
            </div>

            {error && (
              <div
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
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
                disabled={submitMilestone.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !canSubmitDocumentFiles(files, selectionError) ||
                  submitMilestone.isPending
                }
                className="h-10 w-full gap-1.5 sm:w-auto"
              >
                <FileCheck2 className="h-4 w-4" />
                <span>
                  {submitMilestone.isPending
                    ? presentation.pendingLabel
                    : presentation.primaryLabel}
                </span>
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="rounded-lg border border-border/60 bg-muted/15 p-4 text-sm text-muted-foreground">
            {presentation.mode === "WAITING"
              ? "No action is needed while Head SA reviews this submission."
              : "Submission is not available for the current milestone state."}
          </div>
        )}

        <MilestoneSubmissionHistoryPanel
          milestoneId={milestoneId}
          canRead
        />
      </div>
    </Dialog>
  );
}
