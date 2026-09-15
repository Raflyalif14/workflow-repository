"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import {
  AlertCircle,
  Download,
  FileText,
  FileUp,
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react";
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
  useAddComment,
  useDocument,
  useDocumentDownloadUrl,
} from "@/hooks/use-documents";
import {
  formatDocumentDateTime,
  formatDocumentFileSize,
  formatDocumentMimeType,
  formatDocumentParticipant,
  formatDocumentRole,
  formatDocumentStatus,
  getDocumentContextLabel,
  getDocumentPrimaryActionLabel,
  getEmptyDiscussionLabel,
  getLatestVersionLabel,
  getVersionLabel,
} from "@/lib/document-surface-ux";
import { formatHumanReadableLabel } from "@/lib/workflow-ux-helpers";
import type {
  DocumentCategory,
  DocumentItem,
  DocumentStatus,
  DocumentVersion,
} from "@/types/document";

interface DocumentCommentsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DocumentItem | null;
  canUploadVersion: boolean;
  onUploadVersion: (document: DocumentItem) => void;
}

function getStatusVariant(
  status: DocumentStatus
): "success" | "warning" | "destructive" | "outline" {
  if (status === "APPROVED") return "success";
  if (status === "SUBMITTED" || status === "UNDER_REVIEW") return "warning";
  if (status === "REJECTED") return "destructive";
  return "outline";
}

function getCategoryLabel(category: DocumentCategory): string {
  if (category === "MOM") return "MoM";
  if (category === "BOQ") return "Bill of Quantity";
  return formatHumanReadableLabel(category);
}

export function DocumentCommentsDrawer({
  open,
  onOpenChange,
  document: documentSummary,
  canUploadVersion,
  onUploadVersion,
}: DocumentCommentsDrawerProps) {
  const documentId = documentSummary?.id || "";
  const documentQuery = useDocument(documentId);
  const addCommentMutation = useAddComment();
  const downloadMutation = useDocumentDownloadUrl();
  const [content, setContent] = useState("");
  const [commentError, setCommentError] = useState("");
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    setContent("");
    setCommentError("");
    setDownloadError("");
  }, [documentId]);

  if (!documentSummary) return null;

  const detailedDocument = documentQuery.data;
  const currentDocument = detailedDocument || documentSummary;
  const summaryVersions = documentSummary.versions || [];
  const versions = detailedDocument?.versions || summaryVersions;
  const latestVersion =
    versions.find((version) => version.isLatest) || versions[0] || null;
  const comments = detailedDocument?.comments || [];
  const primaryActionLabel = getDocumentPrimaryActionLabel(canUploadVersion);

  const handleDownload = async (version: DocumentVersion) => {
    setDownloadError("");
    try {
      const { url } = await downloadMutation.mutateAsync(version.id);
      const link = window.document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch {
      setDownloadError("Unable to download this document version.");
    }
  };

  const handleSendComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!content.trim()) return;

    setCommentError("");
    try {
      await addCommentMutation.mutateAsync({
        documentId,
        content,
      });
      setContent("");
    } catch {
      setCommentError("Unable to post your comment.");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCommentError("");
      setDownloadError("");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div className="max-h-[calc(100vh-5rem)] space-y-5 overflow-y-auto pr-1">
        <DialogHeader className="mb-0 border-b border-border/60 pb-4">
          <div className="space-y-3 pr-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Official document</Badge>
              <Badge variant="secondary">
                {getDocumentContextLabel(
                  "OFFICIAL_DOCUMENT",
                  currentDocument.milestoneId
                )}
              </Badge>
              <Badge variant="secondary">
                {getCategoryLabel(currentDocument.category)}
              </Badge>
              <Badge variant={getStatusVariant(currentDocument.status)}>
                {formatDocumentStatus(currentDocument.status)}
              </Badge>
            </div>
            <div>
              <DialogTitle className="break-words text-lg leading-6">
                {currentDocument.title}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5">
                {currentDocument.project ? (
                  <>
                    <Link
                      href={`/projects/${currentDocument.project.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {currentDocument.project.name}
                    </Link>
                    {currentDocument.milestone
                      ? ` · Stage ${currentDocument.milestone.orderIndex}: ${currentDocument.milestone.name}`
                      : ""}
                  </>
                ) : (
                  "Project context not available"
                )}
              </DialogDescription>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {canUploadVersion ? (
                <Button
                  type="button"
                  className="gap-2 sm:w-fit"
                  onClick={() => onUploadVersion(currentDocument)}
                >
                  <FileUp className="h-4 w-4" />
                  {primaryActionLabel}
                </Button>
              ) : (
                latestVersion && (
                  <Button
                    type="button"
                    className="gap-2 sm:w-fit"
                    onClick={() => void handleDownload(latestVersion)}
                    disabled={downloadMutation.isPending}
                  >
                    {downloadMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {primaryActionLabel}
                  </Button>
                )
              )}
              {canUploadVersion && latestVersion && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 sm:w-fit"
                  onClick={() => void handleDownload(latestVersion)}
                  disabled={downloadMutation.isPending}
                >
                  {downloadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download latest
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {downloadError && (
          <div
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{downloadError}</span>
          </div>
        )}

        <section aria-labelledby="latest-document-version">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3
              id="latest-document-version"
              className="text-sm font-semibold text-foreground"
            >
              Latest version
            </h3>
            {latestVersion && (
              <>
                <Badge variant="outline">
                  {getVersionLabel(latestVersion.versionNumber)}
                </Badge>
                {getLatestVersionLabel(latestVersion.isLatest) && (
                  <Badge variant="success">Latest</Badge>
                )}
              </>
            )}
          </div>

          {latestVersion ? (
            <div className="grid gap-3 border-y border-border/60 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <p
                    className="truncate text-sm font-medium text-foreground"
                    title={latestVersion.fileName}
                  >
                    {latestVersion.fileName}
                  </p>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {formatDocumentMimeType(latestVersion.mimeType)} ·{" "}
                  {formatDocumentFileSize(latestVersion.fileSize)}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Uploaded by{" "}
                  <span className="font-medium text-foreground">
                    {formatDocumentParticipant(
                      latestVersion.uploadedBy?.fullName
                    )}
                  </span>{" "}
                  · {formatDocumentDateTime(latestVersion.createdAt)}
                </p>
                {latestVersion.changelog && (
                  <p className="mt-2 whitespace-pre-wrap leading-5 text-foreground">
                    {latestVersion.changelog}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start gap-2 sm:justify-center"
                onClick={() => void handleDownload(latestVersion)}
                disabled={downloadMutation.isPending}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No version is available for this document.
            </p>
          )}
        </section>

        <section aria-labelledby="document-version-history">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3
              id="document-version-history"
              className="text-sm font-semibold text-foreground"
            >
              Version history
            </h3>
            <span className="text-xs text-muted-foreground">
              {currentDocument._count?.versions ?? versions.length} total
            </span>
          </div>

          {documentQuery.isLoading ? (
            <p className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading version history...
            </p>
          ) : documentQuery.isError ? (
            <p
              className="flex items-start gap-2 py-2 text-xs text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Unable to load version history.
            </p>
          ) : versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No version history available.
            </p>
          ) : (
            <div className="divide-y divide-border/50 border-y border-border/60">
              {versions.map((version) => {
                const isDownloading =
                  downloadMutation.isPending &&
                  downloadMutation.variables === version.id;
                return (
                  <div
                    key={version.id}
                    className="grid min-w-0 gap-2 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {getVersionLabel(version.versionNumber)}
                        </span>
                        {getLatestVersionLabel(version.isLatest) && (
                          <Badge variant="success" className="text-[10px]">
                            Latest
                          </Badge>
                        )}
                        <span className="truncate text-muted-foreground">
                          {version.fileName}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {formatDocumentMimeType(version.mimeType)} ·{" "}
                        {formatDocumentFileSize(version.fileSize)} ·{" "}
                        {formatDocumentParticipant(version.uploadedBy?.fullName)} ·{" "}
                        {formatDocumentDateTime(version.createdAt)}
                      </p>
                      {version.changelog && (
                        <p className="mt-1 whitespace-pre-wrap leading-5 text-foreground/90">
                          {version.changelog}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="justify-start gap-2 sm:justify-center"
                      onClick={() => void handleDownload(version)}
                      disabled={isDownloading}
                    >
                      {isDownloading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Download
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section aria-labelledby="document-discussion" className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h3
              id="document-discussion"
              className="text-sm font-semibold text-foreground"
            >
              Discussion
            </h3>
            {!documentQuery.isLoading && !documentQuery.isError && (
              <span className="text-xs text-muted-foreground">
                {comments.length}
              </span>
            )}
          </div>

          {documentQuery.isLoading ? (
            <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading discussion...
            </p>
          ) : documentQuery.isError ? (
            <p
              className="flex items-start gap-2 py-2 text-xs text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Unable to load discussion.
            </p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {getEmptyDiscussionLabel()}
            </p>
          ) : (
            <div className="divide-y divide-border/50 border-y border-border/60">
              {comments.map((comment) => (
                <article key={comment.id} className="py-3 text-xs">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-foreground">
                      {formatDocumentParticipant(comment.author?.fullName)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDocumentRole(comment.author?.role)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDocumentDateTime(comment.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words leading-5 text-foreground/90">
                    {comment.content}
                  </p>
                </article>
              ))}
            </div>
          )}

          <form onSubmit={handleSendComment} className="space-y-2">
            <label
              htmlFor="document-comment"
              className="block text-sm font-medium text-foreground"
            >
              Add a comment
            </label>
            <textarea
              id="document-comment"
              rows={2}
              placeholder="Write a comment or feedback..."
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setCommentError("");
              }}
              className="flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              disabled={addCommentMutation.isPending}
              aria-invalid={Boolean(commentError)}
              aria-describedby={
                commentError ? "document-comment-error" : undefined
              }
            />
            {commentError && (
              <p
                id="document-comment-error"
                className="text-xs text-destructive"
                role="alert"
              >
                {commentError}
              </p>
            )}
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={!content.trim() || addCommentMutation.isPending}
            >
              {addCommentMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {addCommentMutation.isPending ? "Posting..." : "Post comment"}
            </Button>
          </form>
        </section>

        <DialogFooter className="border-t border-border/60 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}
