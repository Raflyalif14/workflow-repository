"use client";

import { translate as translateI18n, translateStoredError } from "@/i18n";
import { useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useProjectIntake, useProjectIntakeDownloadUrl } from "@/hooks/use-project-intake";
import { formatDate } from "@/lib/project-detail-format";

export function ProjectIntakeSection({ projectId }: { projectId: string }) {
  const { data: attachments = [], isLoading, isError } = useProjectIntake(projectId);
  const intakeDownload = useProjectIntakeDownloadUrl(projectId);
  const [downloadError, setDownloadError] = useState("");

  const handleDownload = async (attachmentId: string) => {
    setDownloadError("");
    try {
      const { url } = await intakeDownload.mutateAsync(attachmentId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setDownloadError("projectDetail.intakeDownloadFailed");
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
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{attachment.file_name}</p>
                          <Badge variant="secondary" className="text-[10px]">{translateI18n("copy.intakeEvidence")}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {attachment.mime_type} - {formatFileSize(attachment.size_bytes)} - {translateI18n("projectDetail.addedOn", { date: formatDate(attachment.created_at) })}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 gap-1.5 self-start text-xs sm:self-auto"
                        onClick={() => void handleDownload(attachment.id)}
                        disabled={intakeDownload.isPending}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>{translateI18n("copy.viewDownload")}</span>
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatFileSize(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "-";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}
