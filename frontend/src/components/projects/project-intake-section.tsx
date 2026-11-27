"use client";

import { translate as translateI18n, translateStoredError } from "@/i18n";
import { useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useProjectIntake, useProjectIntakeDownloadUrl } from "@/hooks/use-project-intake";
import { formatDate } from "@/lib/project-detail-format";
import { DocumentPreviewDialog } from "@/components/documents/document-preview-dialog";
import { downloadFileFromUrl } from "@/lib/file-download";
import { formatDocumentMimeType } from "@/lib/document-surface-ux";

export function ProjectIntakeSection({ projectId }: { projectId: string }) {
  const { data: attachments = [], isLoading, isError } = useProjectIntake(projectId);
  const intakeDownload = useProjectIntakeDownloadUrl(projectId);
  const [downloadError, setDownloadError] = useState("");
  const [previewTarget, setPreviewTarget] = useState<{
    attachment: (typeof attachments)[0];
    url: string | null;
  } | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  const handleDownload = async (attachmentId: string, fileName?: string) => {
    setDownloadError("");
    try {
      const { url } = await intakeDownload.mutateAsync(attachmentId);
      await downloadFileFromUrl(url, fileName);
    } catch {
      setDownloadError("projectDetail.intakeDownloadFailed");
    }
  };

  const handlePreview = async (attachment: (typeof attachments)[0]) => {
    setDownloadError("");
    setPreviewLoadingId(attachment.id);
    try {
      const { url } = await intakeDownload.mutateAsync(attachment.id);
      setPreviewTarget({ attachment, url });
    } catch {
      setDownloadError("projectDetail.intakeDownloadFailed");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const sections: Array<{ kind: "MOM" | "PHOTO" | "DOCUMENT"; label: string }> = [
    { kind: "MOM", label: "MoM" },
    { kind: "PHOTO", label: translateI18n("projectCreate.projectPhotos") },
    { kind: "DOCUMENT", label: translateI18n("ui.supportingDocuments") },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold tracking-tight">{translateI18n("copy.projectIntake")}</CardTitle>
          <CardDescription className="text-xs">
            {translateI18n("projectDetail.intakeDescription")}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {downloadError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {translateStoredError(downloadError)}
          </p>
        )}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((item) => (
              <div key={item} className="h-14 animate-pulse rounded-xl border border-border/40 bg-muted/20" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-4 text-center text-xs text-destructive">{translateI18n("copy.intakeLoadError")}</p>
        ) : attachments.length === 0 ? (
          <p className="py-5 text-center text-sm text-muted-foreground">{translateI18n("copy.noIntake")}</p>
        ) : (
          <div className="space-y-3">
            {sections.map(({ kind, label }) => {
              const items = attachments.filter((attachment) => attachment.kind === kind);
              if (!items.length) return null;

              return (
                <div key={kind} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                  {items.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex flex-col gap-3 rounded-md border border-border/40 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="min-w-0 truncate text-sm font-semibold text-foreground" title={attachment.file_name}>{attachment.file_name}</p>
                          <Badge variant="secondary" className="shrink-0 text-[10px]">{translateI18n("copy.intakeEvidence")}</Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDocumentMimeType(attachment.mime_type, attachment.file_name)} · {formatFileSize(attachment.size_bytes)} · {translateI18n("projectDetail.addedOn", { date: formatDate(attachment.created_at) })}
                        </p>
                      </div>
                      <div className="flex shrink-0 whitespace-nowrap items-center gap-1.5 self-start sm:self-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 gap-1.5 text-xs hover:bg-primary/10 hover:text-primary"
                          onClick={() => void handlePreview(attachment)}
                          disabled={previewLoadingId !== null}
                          aria-label={translateI18n("docPreview.previewFile", { name: attachment.file_name })}
                        >
                          {previewLoadingId === attachment.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Eye className="h-3.5 w-3.5 text-primary" />
                          )}
                          <span>{translateI18n("docPreview.preview")}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => void handleDownload(attachment.id, attachment.file_name)}
                          disabled={intakeDownload.isPending}
                          aria-label={translateI18n("docPreview.downloadFile")}
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>{translateI18n("common.download")}</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {previewTarget && (
        <DocumentPreviewDialog
          open={Boolean(previewTarget)}
          onOpenChange={(open) => {
            if (!open) setPreviewTarget(null);
          }}
          fileName={previewTarget.attachment.file_name}
          fileSize={previewTarget.attachment.size_bytes}
          fileUrl={previewTarget.url}
          mimeType={previewTarget.attachment.mime_type}
          isLoading={previewLoadingId === previewTarget.attachment.id}
          uploadedAt={previewTarget.attachment.created_at}
          status={translateI18n("copy.intakeEvidence")}
          onDownload={() => void handleDownload(previewTarget.attachment.id, previewTarget.attachment.file_name)}
        />
      )}
    </Card>
  );
}

function formatFileSize(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "-";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}
