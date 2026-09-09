"use client";

import { useState } from "react";
import { AlertCircle, Download, Eye, FileText, History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useDownloadSubmissionHistoryAttachment,
  useSubmissionPackageHistory,
} from "@/hooks/use-milestone-workflow";
import type { MilestoneSubmissionRevision } from "@/types/project";

function formatFileSize(value: number | string): string {
  const bytes = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function packageBadge(status: MilestoneSubmissionRevision["status"]) {
  if (status === "APPROVED") return <Badge className="bg-emerald-500/15 text-emerald-400">Approved</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="warning">Under Review</Badge>;
}

export function MilestoneSubmissionHistoryPanel({
  milestoneId,
  canRead,
}: {
  milestoneId: string;
  canRead: boolean;
}) {
  const history = useSubmissionPackageHistory(milestoneId, canRead);
  const download = useDownloadSubmissionHistoryAttachment(milestoneId);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!canRead) return null;

  const openAttachment = (packageId: string, attachmentId: string) => {
    setDownloadError(null);
    download.mutate(
      { packageId, attachmentId },
      { onError: () => setDownloadError("Unable to open the submission attachment.") }
    );
  };

  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <div className="mb-2 flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Submission Revisions</p>
      </div>

      {history.isLoading ? (
        <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading submission revisions...
        </p>
      ) : history.isError ? (
        <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Unable to load submission revisions.
        </p>
      ) : !history.data?.items.length ? (
        <p className="text-xs text-muted-foreground">No submission revisions yet.</p>
      ) : (
        <div className="space-y-2">
          {history.data.items.map((revision) => (
            <div key={revision.id} className="rounded-lg border border-border/40 bg-muted/10 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">Revision {revision.revision}</span>
                {packageBadge(revision.status)}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Submitted by <span className="font-medium text-foreground">{revision.submission.submittedBy?.fullName || "-"}</span>
                {" - "}{formatDateTime(revision.submission.submittedAt)}
              </p>
              {revision.submission.note && <p className="mt-2 whitespace-pre-wrap text-muted-foreground">Note: &quot;{revision.submission.note}&quot;</p>}
              {revision.review.note && (
                <p className="mt-1 whitespace-pre-wrap text-foreground">
                  {revision.status === "REJECTED" ? "Review feedback" : "Review note"}: &quot;{revision.review.note}&quot;
                </p>
              )}
              {revision.review.reviewedAt && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Reviewed by <span className="font-medium text-foreground">{revision.review.reviewedBy?.fullName || "-"}</span>
                  {" - "}{formatDateTime(revision.review.reviewedAt)}
                </p>
              )}
              <div className="mt-2 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Attachments</p>
                {revision.attachments.map((attachment) => {
                  const isDownloading =
                    download.isPending &&
                    download.variables?.packageId === revision.id &&
                    download.variables.attachmentId === attachment.id;
                  return (
                    <div key={attachment.id} className="flex flex-col gap-2 rounded-md border border-border/40 bg-card/70 p-2 sm:flex-row sm:items-center">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{attachment.fileName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatFileSize(attachment.fileSize)}{attachment.mimeType ? ` - ${attachment.mimeType}` : ""}
                        </p>
                      </div>
                      {attachment.promotedDocumentId && (
                        <Badge variant="outline" className="w-fit border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400">In Repository</Badge>
                      )}
                      <div className="flex gap-1 self-start sm:self-auto">
                        <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px] text-primary" disabled={isDownloading} onClick={() => openAttachment(revision.id, attachment.id)}>
                          {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          View
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" disabled={isDownloading} onClick={() => openAttachment(revision.id, attachment.id)}>
                          <Download className="h-3 w-3" />
                          Download
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {downloadError && (
        <p className="mt-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {downloadError}
        </p>
      )}
    </div>
  );
}
