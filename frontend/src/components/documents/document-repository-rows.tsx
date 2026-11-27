"use client";

import Link from "next/link";
import { ArrowRight, Download, Eye, FileText, FileUp, Loader2, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { translate as translateI18n, getIntlLocale, translateOutputStatus, translateOutputName } from "@/i18n";
import { formatDocumentCategory } from "@/lib/document-surface-ux";
import { isOutcomeEvidenceDocument } from "@/lib/document-repository";
import type { OutputRepositoryItem } from "@/hooks/use-output-documents";
import type { DocumentItem, DocumentStatus } from "@/types/document";

function getStatusBadge(status: DocumentStatus) {
  switch (status) {
    case "APPROVED":
      return <Badge variant="success">{translateI18n("approvalStatus.APPROVED")}</Badge>;
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return <Badge variant="warning">{translateI18n("documentStatus.SUBMITTED")}</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">{translateI18n("approvalStatus.REJECTED")}</Badge>;
    case "SUPERSEDED":
      return <Badge variant="outline">{translateI18n("documentStatus.SUPERSEDED")}</Badge>;
    default:
      return <Badge variant="outline">{translateI18n("documentStatus.DRAFT")}</Badge>;
  }
}

export function getFileIconColor(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "text-red-500 dark:text-red-400";
  if (["doc", "docx"].includes(ext)) return "text-blue-500 dark:text-blue-400";
  if (["xls", "xlsx", "csv"].includes(ext)) return "text-emerald-500 dark:text-emerald-400";
  if (["ppt", "pptx"].includes(ext)) return "text-amber-500 dark:text-amber-400";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "text-orange-500 dark:text-orange-400";
  if (["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) return "text-violet-500 dark:text-violet-400";
  return "text-primary";
}

export function OutputRepositoryRow({
  item,
  pendingFiles,
  onDownload,
  onPreview,
  onArchive,
  archivePending,
}: {
  item: OutputRepositoryItem;
  pendingFiles: ReadonlySet<string>;
  onDownload: (fileId: string, fileName?: string) => void;
  onPreview?: (file: { id: string; fileName: string; fileSize?: number | null; mimeType?: string | null; uploadedAt?: string | null }) => void;
  onArchive: () => void;
  archivePending: boolean;
}) {
  const isPraTender = item.group === "PRA_TENDER";
  const singleFile = item.files.length === 1 ? item.files[0] : null;

  return (
    <div
      id={`repository-output-${item.outputId}`}
      className="flex flex-col gap-3 p-4 sm:p-5 border-t border-border/60 first:border-t-0 hover:bg-muted/15 transition-colors lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={isPraTender ? "secondary" : "default"}
            className="text-[11px] font-medium"
          >
            {translateI18n(isPraTender ? "projectCreate.praTender" : "projectCreate.onSubmissionTender")}
          </Badge>
          <Badge variant="success" className="text-[11px]">
            {translateOutputStatus(item.status)}
          </Badge>
          {item.accessMode && (
            <Badge variant="outline" className="text-[11px]">
              {translateI18n(item.accessMode === "SHARED_INTERNAL" ? "documentAccess.shared" : "documentAccess.restricted")}
            </Badge>
          )}
          <Badge variant="outline" className="text-[11px] font-mono">
            v{item.versionNumber}
          </Badge>
        </div>

        <div>
          <h4 className="font-semibold text-foreground text-sm sm:text-base break-words">
            {translateOutputName(item.documentKey, item.name)}
          </h4>
        </div>

        <div className="space-y-1.5 pt-0.5">
          {item.files.map((file) => {
            const pending = pendingFiles.has(`${item.projectId}:${item.documentKey}:${file.id}`);
            return (
              <div
                key={file.id}
                className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
              >
                <FileText className={`h-4 w-4 shrink-0 ${getFileIconColor(file.fileName)}`} />
                <span
                  className="font-medium text-foreground max-w-[280px] sm:max-w-[420px] md:max-w-[560px] truncate"
                  title={file.fileName}
                >
                  {file.fileName}
                </span>
                {typeof file.fileSize === "number" && (
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    ({(file.fileSize / 1024 / 1024).toLocaleString(getIntlLocale(), { maximumFractionDigits: 2 })} MB)
                  </span>
                )}
                {item.files.length > 1 && (
                  <div className="inline-flex items-center gap-1 ml-1 shrink-0">
                    {onPreview && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-xs text-primary hover:bg-primary-soft hover:text-primary"
                        onClick={() => onPreview(file)}
                        aria-label={`${translateI18n("docPreview.preview")}: ${file.fileName}`}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        {translateI18n("docPreview.preview")}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-xs"
                      disabled={pending}
                      onClick={() => onDownload(file.id, file.fileName)}
                      aria-label={`${translateI18n("docPreview.downloadFile")}: ${file.fileName}`}
                    >
                      {pending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
                      {translateI18n("docPreview.downloadFile")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 lg:pt-0">
        {singleFile && (
          <>
            {onPreview && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 text-primary border-primary/20 hover:bg-primary-soft hover:text-primary"
                onClick={() => onPreview(singleFile)}
                aria-label={`${translateI18n("docPreview.preview")}: ${singleFile.fileName}`}
              >
                <Eye className="h-3.5 w-3.5" />
                {translateI18n("docPreview.preview")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={pendingFiles.has(`${item.projectId}:${item.documentKey}:${singleFile.id}`)}
              onClick={() => onDownload(singleFile.id, singleFile.fileName)}
              aria-label={`${translateI18n("docPreview.downloadFile")}: ${singleFile.fileName}`}
            >
              {pendingFiles.has(`${item.projectId}:${item.documentKey}:${singleFile.id}`) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {translateI18n("docPreview.downloadFile")}
            </Button>
          </>
        )}

        {item.outputId && item.files.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={archivePending}
            onClick={onArchive}
          >
            <Download className="h-3.5 w-3.5" />
            {translateI18n("documentAccess.downloadAll")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function DocumentRow({
  document,
  downloadPending,
  onDownload,
  onPreview,
  onOpenDetails,
  onUploadVersion,
}: {
  document: DocumentItem;
  downloadPending: boolean;
  onDownload: (versionId: string, fileName?: string) => Promise<void>;
  onPreview?: () => void;
  onOpenDetails: () => void;
  onUploadVersion: () => void;
}) {
  const latestVersion = document.versions?.[0];
  const isOutcomeEvidence = isOutcomeEvidenceDocument(document);
  const isMilestoneDoc = !isOutcomeEvidence && Boolean(document.milestoneId);

  const displayTitle = isOutcomeEvidence
    ? translateI18n("documentPage.tenderEvidence")
    : isMilestoneDoc && document.milestone
    ? `${translateI18n("documentPage.milestoneDoc")}: ${document.milestone.name}`
    : isMilestoneDoc
    ? translateI18n("documentPage.milestoneDoc")
    : document.title;

  return (
    <div
      className="flex flex-col gap-3 p-4 sm:p-5 border-t border-border/60 first:border-t-0 hover:bg-muted/15 transition-colors lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {isOutcomeEvidence ? (
            <Badge
              variant="outline"
              className="border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 text-[11px] font-medium"
            >
              {translateI18n("documentPage.outcomeStage")}
            </Badge>
          ) : isMilestoneDoc ? (
            <Badge variant="secondary" className="text-[11px] font-medium">
              {translateI18n("projectCreate.praTender")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[11px] font-medium">
              {formatDocumentCategory(document.category)}
            </Badge>
          )}

          <Badge variant="success" className="text-[11px]">
            {translateI18n("approvalStatus.APPROVED")}
          </Badge>

          {document.accessMode && (
            <Badge variant="outline" className="text-[11px]">
              {translateI18n(document.accessMode === "SHARED_INTERNAL" ? "documentAccess.shared" : "documentAccess.restricted")}
            </Badge>
          )}

          {latestVersion && (
            <Badge variant="outline" className="text-[11px] font-mono">
              v{latestVersion.versionNumber}
            </Badge>
          )}
        </div>

        <div>
          <h4 className="font-semibold text-foreground text-sm sm:text-base break-words">
            <button
              type="button"
              className="text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={onOpenDetails}
            >
              {displayTitle}
            </button>
          </h4>
          {document.milestone && !isOutcomeEvidence && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {translateI18n("documentPage.stage", { number: document.milestone.orderIndex })}: {document.milestone.name}
            </p>
          )}
        </div>

        {latestVersion ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-0.5">
            <FileText className={`h-4 w-4 shrink-0 ${getFileIconColor(latestVersion.fileName)}`} />
            <span
              className="font-medium text-foreground max-w-[280px] sm:max-w-[420px] md:max-w-[560px] truncate"
              title={latestVersion.fileName}
            >
              {latestVersion.fileName}
            </span>
            <span className="text-[11px] text-muted-foreground shrink-0">
              ({(latestVersion.fileSize / 1024 / 1024).toFixed(2)} MB)
            </span>
            <span className="text-[11px] text-muted-foreground">
              • {latestVersion.uploadedBy?.fullName || translateI18n("documentPage.unknownUploader")} •{" "}
              {new Date(latestVersion.createdAt).toLocaleDateString(getIntlLocale(), {
                dateStyle: "medium",
              })}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{translateI18n("ui.noVersions")}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 lg:pt-0">
        {latestVersion && onPreview && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-primary border-primary/20 hover:bg-primary-soft hover:text-primary"
            onClick={onPreview}
            aria-label={`${translateI18n("docPreview.preview")}: ${latestVersion.fileName}`}
          >
            <Eye className="h-3.5 w-3.5" />
            {translateI18n("docPreview.preview")}
          </Button>
        )}
        {latestVersion && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => void onDownload(latestVersion.id, latestVersion.fileName)}
            disabled={downloadPending}
            aria-label={`${translateI18n("docPreview.downloadFile")}: ${latestVersion.fileName}`}
          >
            <Download className="h-3.5 w-3.5" />
            {translateI18n("docPreview.downloadFile")}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={onOpenDetails}>
          <MessageSquare className="h-3.5 w-3.5" />
          {document.canReadProject === false
            ? translateI18n("documentAccess.details")
            : translateI18n("documentPage.commentsCount", { count: document._count?.comments || 0 })}
        </Button>
        {document.canUploadVersion && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onUploadVersion}>
            <FileUp className="h-3.5 w-3.5" />
            {translateI18n("documentPage.newVersion")}
          </Button>
        )}
      </div>
    </div>
  );
}
