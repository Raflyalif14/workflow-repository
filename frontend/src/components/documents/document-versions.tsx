"use client";

import { AlertCircle, Download, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { translate as translateI18n } from "@/i18n";
import {
  formatDocumentDateTime,
  formatDocumentFileSize,
  formatDocumentMimeType,
  formatDocumentParticipant,
  getLatestVersionLabel,
  getVersionLabel,
} from "@/lib/document-surface-ux";
import type { DocumentVersion } from "@/types/document";

interface DocumentVersionsProps {
  latestVersion: DocumentVersion | null;
  versions: DocumentVersion[];
  totalVersions?: number;
  canReadHistory: boolean;
  isLoading: boolean;
  isError: boolean;
  downloadPending: boolean;
  pendingVersionId?: string;
  onDownload: (version: DocumentVersion) => Promise<void>;
}

export function DocumentVersions({ latestVersion, versions, totalVersions, canReadHistory,
  isLoading, isError, downloadPending, pendingVersionId, onDownload }: DocumentVersionsProps) {
  return (
    <>
      <section aria-labelledby="latest-document-version">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3
            id="latest-document-version"
            className="text-sm font-semibold text-foreground"
          >
            {translateI18n("ui.latestVersion")}
          </h3>
          {latestVersion && (
            <>
              <Badge variant="outline">
                {getVersionLabel(latestVersion.versionNumber)}
              </Badge>
              {getLatestVersionLabel(latestVersion.isLatest) && (
                <Badge variant="success">{translateI18n("copy.latest")}</Badge>
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
                {translateI18n("projectDetail.uploadedBy", { name: formatDocumentParticipant(latestVersion.uploadedBy?.fullName) })}{" "}
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
              onClick={() => void onDownload(latestVersion)}
              disabled={downloadPending}
            >
              <Download className="h-3.5 w-3.5" />
              {translateI18n("common.download")}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {translateI18n("documentDialog.noVersion")}
          </p>
        )}
      </section>

      {canReadHistory && <section aria-labelledby="document-version-history">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3
            id="document-version-history"
            className="text-sm font-semibold text-foreground"
          >
            {translateI18n("copy.versionHistory")}
          </h3>
          <span className="text-xs text-muted-foreground">
            {translateI18n("documentDialog.totalVersions", { count: totalVersions ?? versions.length })}
          </span>
        </div>

        {isLoading ? (
          <p className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {translateI18n("copy.loadingHistory")}
          </p>
        ) : isError ? (
          <p
            className="flex items-start gap-2 py-2 text-xs text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {translateI18n("copy.versionHistoryError")}
          </p>
        ) : versions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {translateI18n("documentDialog.noVersionHistory")}
          </p>
        ) : (
          <div className="divide-y divide-border/50 border-y border-border/60">
            {versions.map((version) => {
              const isDownloading =
                downloadPending &&
                pendingVersionId === version.id;
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
                          {translateI18n("copy.latest")}
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
                    onClick={() => void onDownload(version)}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {translateI18n("common.download")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>}
    </>
  );
}
