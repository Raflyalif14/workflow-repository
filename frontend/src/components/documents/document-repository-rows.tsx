"use client";

import Link from "next/link";
import { ArrowRight, Download, FileText, FileUp, Loader2, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { translate as translateI18n, getIntlLocale, translateOutputStatus, translateOutputName } from "@/i18n";
import { formatDocumentCategory } from "@/lib/document-surface-ux";
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

export function OutputRepositoryRow({ item, pendingFiles, onDownload, onArchive, archivePending }: {
  item: OutputRepositoryItem;
  pendingFiles: ReadonlySet<string>;
  onDownload: (fileId: string) => void;
  onArchive: () => void; archivePending: boolean;
}) {
  return <div id={`repository-output-${item.outputId}`} className="grid gap-4 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5 xl:grid-cols-[minmax(240px,1.7fr)_minmax(180px,1fr)_minmax(230px,1.3fr)_auto] xl:items-center">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{translateI18n("documents.output")}</Badge><Badge variant="success">{translateOutputStatus(item.status)}</Badge>{item.accessMode && <Badge variant="outline">{translateI18n(item.accessMode === "SHARED_INTERNAL" ? "documentAccess.shared" : "documentAccess.restricted")}</Badge>}</div>
      <h3 className="mt-2 break-words font-semibold text-foreground">{translateOutputName(item.documentKey, item.name)}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{translateI18n(item.group === "PRA_TENDER" ? "projectCreate.praTender" : "projectCreate.onSubmissionTender")}</p>
    </div>
    {item.canReadProject !== false ? <Link href={`/projects/${item.projectId}`} className="min-w-0 text-sm font-medium text-foreground hover:text-primary">
      <span className="break-words">{item.projectName}</span>
      <span className="block break-words text-xs font-normal text-muted-foreground">{item.customer}</span>
    </Link> : <p className="text-xs text-muted-foreground">{translateI18n("documentAccess.projectPrivate")}</p>}
    <div className="min-w-0">
      <p className="mb-1 text-xs text-muted-foreground">v{item.versionNumber}</p>
      <ul className="divide-y divide-border/40">
        {item.files.map((file) => {
          const pending = pendingFiles.has(`${item.projectId}:${item.documentKey}:${file.id}`);
          return <li key={file.id} className="flex min-w-0 items-center gap-2 py-1.5">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm text-foreground" title={file.fileName}>{file.fileName}</p>
              {typeof file.fileSize === "number" && <p className="text-xs text-muted-foreground">{(file.fileSize / 1024 / 1024).toLocaleString(getIntlLocale(), { maximumFractionDigits: 2 })} MB</p>}
            </div>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => onDownload(file.id)}
              aria-label={`${translateI18n("common.download")}: ${file.fileName}`}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              <span className="sr-only">{translateI18n("common.download")}</span>
            </Button>
          </li>;
        })}
      </ul>
    </div>
    <div className="flex flex-wrap gap-1 xl:justify-end">
      {item.canReadProject !== false && <Link href={`/projects/${item.projectId}#milestone-outputs-${item.milestoneId}`}><Button type="button" size="sm" variant="outline"><ArrowRight className="mr-1 h-3.5 w-3.5" />{translateI18n("project.open")}</Button></Link>}
      {item.outputId && <Button size="sm" variant="outline" disabled={archivePending} onClick={onArchive}>{translateI18n("documentAccess.downloadAll")}</Button>}
    </div>
  </div>;
}

export function DocumentRow({
  document,
  downloadPending,
  onDownload,
  onOpenDetails,
  onUploadVersion,
}: {
  document: DocumentItem;
  downloadPending: boolean;
  onDownload: (versionId: string) => Promise<void>;
  onOpenDetails: () => void;
  onUploadVersion: () => void;
}) {
  const latestVersion = document.versions?.[0];

  return (
    <div className="grid gap-4 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5 xl:grid-cols-[minmax(240px,1.7fr)_minmax(180px,1fr)_minmax(230px,1.3fr)_auto] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{translateI18n("ui.officialDocument")}</Badge>
          {document.accessMode && <Badge variant="outline">{translateI18n(document.accessMode === "SHARED_INTERNAL" ? "documentAccess.shared" : "documentAccess.restricted")}</Badge>}
          <Badge variant="secondary">{formatDocumentCategory(document.category)}</Badge>
          {getStatusBadge(document.status)}
        </div>
        <h3 className="mt-2 truncate font-semibold text-foreground" title={document.title}>
          <button
            type="button"
            className="max-w-full truncate text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={onOpenDetails}
          >
            {document.title}
          </button>
        </h3>
        {document.milestone && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {translateI18n("documentPage.stage", { number: document.milestone.orderIndex })} {document.milestone.name}
          </p>
        )}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 xl:block">
        <span className="text-[11px] font-medium text-muted-foreground xl:hidden">{translateI18n("nav.projects")}</span>
        {document.project ? (
          <Link
            href={`/projects/${document.project.id}`}
            className="min-w-0 text-right xl:text-left"
          >
            <p className="truncate text-sm font-medium text-foreground hover:text-primary">
              {document.project.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {document.project.clientName}
            </p>
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">{translateI18n("ui.projectUnavailable")}</p>
        )}
      </div>

      <div className="min-w-0">
        {latestVersion ? (
          <>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <p className="truncate text-sm font-medium text-foreground" title={latestVersion.fileName}>
                {latestVersion.fileName}
              </p>
              <Badge variant="outline">v{latestVersion.versionNumber}</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {(latestVersion.fileSize / 1024 / 1024).toFixed(2)} MB |{" "}
              {latestVersion.uploadedBy?.fullName || translateI18n("documentPage.unknownUploader")} |{" "}
              {new Date(latestVersion.createdAt).toLocaleDateString(getIntlLocale(), {
                dateStyle: "medium",
              })}
            </p>
            {latestVersion.changelog && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {latestVersion.changelog}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{translateI18n("ui.noVersions")}</p>
        )}
      </div>

      <div className="flex flex-wrap justify-start gap-1 xl:justify-end">
        {latestVersion && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => void onDownload(latestVersion.id)}
            disabled={downloadPending}
          >
            <Download className="h-3.5 w-3.5" />
            {translateI18n("common.download")}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={onOpenDetails}>
          <MessageSquare className="h-3.5 w-3.5" />
          {document.canReadProject === false ? translateI18n("documentAccess.details") : translateI18n("documentPage.commentsCount", { count: document._count?.comments || 0 })}
        </Button>
        {document.canUploadVersion && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onUploadVersion}>
            <FileUp className="h-3.5 w-3.5" />
            {translateI18n("documentPage.newVersion")}
          </Button>
        )}
        {document.project && (
          <Link href={`/projects/${document.project.id}`}>
            <Button size="icon" variant="ghost" title={translateI18n("project.open")}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
