"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDocuments, useDocumentDownloadUrl } from "@/hooks/use-documents";
import { useOutputRepository, useOutputRepositoryDownload } from "@/hooks/use-output-documents";
import { useRepositorySession } from "@/hooks/use-repository-session";
import { buildRepositoryItems, repositoryLoadState } from "@/lib/document-repository";
import { formatHumanReadableLabel } from "@/lib/workflow-ux-helpers";
import { getIntlLocale, translate, translateOutputName, translateStoredError } from "@/i18n";

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleDateString(getIntlLocale(), { dateStyle: "medium" }) : "-";

export function ProjectDocumentsSection({ projectId }: { projectId: string }) {
  const scope = useRepositorySession();
  const documents = useDocuments({ projectId });
  const outputs = useOutputRepository();
  const documentDownload = useDocumentDownloadUrl();
  const outputDownload = useOutputRepositoryDownload();
  const [downloadError, setDownloadError] = useState("");
  const loadState = repositoryLoadState(scope.enabled, documents, outputs);
  // Both sources have already passed the repository's backend permission checks.
  // Only current approved output snapshots with files are admitted by this helper.
  const items = buildRepositoryItems(documents.data || [], (outputs.data || []).filter(output => output.projectId === projectId));

  async function download(save: () => Promise<{ url: string }>) {
    setDownloadError("");
    try { const { url } = await save(); window.open(url, "_blank", "noopener,noreferrer"); }
    catch { setDownloadError("projectDetail.documentDownloadFailed"); }
  }

  return <Card>
    <CardHeader className="pb-3"><div className="space-y-1">
      <CardTitle className="text-base font-semibold tracking-tight">{translate("documents.official")}</CardTitle>
      <CardDescription className="text-xs">{translate("projectDetail.officialDescription")}</CardDescription>
    </div></CardHeader>
    <CardContent className="space-y-3">
      {downloadError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{translateStoredError(downloadError)}</p>}
      {loadState === "loading" ? <div className="space-y-2">{[1, 2].map(item =>
        <div key={item} className="h-16 animate-pulse rounded-xl border border-border/40 bg-muted/20" />)}</div>
        : loadState === "error" ? <div className="py-4 text-center">
          <p className="text-xs text-destructive">{translate("documents.loadError")}</p>
          <Button size="sm" variant="outline" onClick={() => {
            if (scope.enabled) { void documents.refetch(); void outputs.refetch(); }
          }}>{translate("common.retry")}</Button>
        </div>
        : items.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">{translate("documents.empty")}</p>
        : <div className="space-y-2">{items.map(item => {
          if (item.sourceType === "OUTPUT") {
            const output = item.output;
            return <div key={`output:${item.sourceId}`} className="space-y-2 rounded-md border border-border/40 bg-muted/10 p-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="min-w-0 break-words text-sm font-semibold text-foreground">{translateOutputName(output.documentKey, output.name)}</p>
                <Badge variant="success" className="text-[10px]">{translate("documentStatus.APPROVED")}</Badge>
                <Badge variant="outline" className="text-[10px]">{translate("projectDetail.version", { number: output.versionNumber })}</Badge>
              </div>
              {output.files.map(file => <div key={file.id} className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 break-words text-xs text-muted-foreground">{file.fileName}</p>
                <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 self-start text-xs sm:self-auto"
                  disabled={outputDownload.isPending} onClick={() => void download(() => outputDownload.mutateAsync({
                    projectId: output.projectId, documentKey: output.documentKey, fileId: file.id, versionId: output.approvedVersionId,
                  }))}><Download className="h-3.5 w-3.5" /><span>{translate("copy.viewDownload")}</span></Button>
              </div>)}
              <p className="text-[11px] text-muted-foreground">{formatDate(output.updatedAt)}</p>
            </div>;
          }
          const document = item.document, latestVersion = document.versions?.[0];
          const sourceLabel = document.category === "MOM" ? "MoM" : document.milestoneId
            ? document.milestone?.name || translate("documentSurface.milestoneDeliverable")
            : document.category === "OTHER" ? translate("documentSurface.projectDocument") : formatHumanReadableLabel(document.category);
          return <div key={`official:${document.id}`} className="flex flex-col gap-3 rounded-md border border-border/40 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-foreground">{document.title}</p>
                <Badge variant="secondary" className="text-[10px] uppercase">{sourceLabel}</Badge>
                {latestVersion && <Badge variant="outline" className="text-[10px]">{translate("projectDetail.version", { number: latestVersion.versionNumber })}</Badge>}
              </div>
              <p className="truncate text-xs text-muted-foreground">{latestVersion?.fileName || translate("projectDetail.noFileVersion")}</p>
              <p className="text-[11px] text-muted-foreground">
                {latestVersion?.uploadedBy?.fullName && <>{translate("projectDetail.uploadedBy", { name: latestVersion.uploadedBy.fullName })} - </>}
                {formatDate(latestVersion?.createdAt || document.createdAt)}
              </p>
            </div>
            {latestVersion && <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 self-start text-xs sm:self-auto"
              onClick={() => void download(() => documentDownload.mutateAsync(latestVersion.id))} disabled={documentDownload.isPending}>
              <Download className="h-3.5 w-3.5" /><span>{translate("copy.viewDownload")}</span>
            </Button>}
          </div>;
        })}</div>}
    </CardContent>
  </Card>;
}
