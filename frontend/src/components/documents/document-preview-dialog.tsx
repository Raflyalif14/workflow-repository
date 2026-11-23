"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  FileCode,
  FileArchive,
} from "lucide-react";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { translate as translateI18n, formatDate } from "@/i18n";
import { downloadFileFromUrl } from "@/lib/file-download";

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export type FileCategory = "pdf" | "image" | "office" | "code" | "archive" | "other";

export function getFileCategory(fileName: string, mimeType?: string | null): FileCategory {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mime = mimeType?.toLowerCase() || "";

  if (ext === "pdf" || mime.includes("pdf")) return "pdf";
  if (
    ["png", "jpg", "jpeg", "webp", "svg", "gif", "bmp"].includes(ext) ||
    mime.startsWith("image/")
  ) {
    return "image";
  }
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv"].includes(ext)) {
    return "office";
  }
  if (["json", "xml", "html", "js", "ts", "css", "sql", "txt", "md"].includes(ext)) {
    return "code";
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return "archive";
  }
  return "other";
}

export interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  fileSize?: number | null;
  fileUrl?: string | null;
  mimeType?: string | null;
  isLoading?: boolean;
  error?: string | null;
  versionNumber?: number | null;
  uploadedByName?: string | null;
  uploadedAt?: string | null;
  status?: string | null;
  canReview?: boolean;
  onApprove?: () => void;
  onRequestRevision?: () => void;
  onDownload?: () => void;
}

export function DocumentPreviewDialog({
  open,
  onOpenChange,
  fileName,
  fileSize,
  fileUrl,
  mimeType,
  isLoading = false,
  error,
  versionNumber,
  uploadedByName,
  uploadedAt,
  status,
  canReview = false,
  onApprove,
  onRequestRevision,
  onDownload,
}: DocumentPreviewDialogProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const category = getFileCategory(fileName, mimeType);
  const isDocx = fileName.toLowerCase().endsWith(".docx");
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !isDocx || !fileUrl) {
      setDocxLoading(false);
      setDocxError(null);
      return;
    }

    let cancelled = false;
    const container = docxContainerRef.current;
    setDocxLoading(true);
    setDocxError(null);

    (async () => {
      try {
        // Fetch file blob without credentials mode so cross-origin Supabase signed URLs
        // (which return Access-Control-Allow-Origin: *) are not blocked by browser CORS.
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;

        const { renderAsync } = await import("docx-preview");
        if (cancelled) return;

        const targetContainer = container || docxContainerRef.current;
        if (!targetContainer) {
          throw new Error("Preview container not mounted");
        }

        targetContainer.innerHTML = "";
        await renderAsync(blob, targetContainer, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
        });

        if (!cancelled) {
          setDocxLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.warn("[DocumentPreviewDialog] docx preview failed, falling back to download card:", err);
          setDocxError(err?.message || "Failed to render docx");
          setDocxLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [open, isDocx, fileUrl]);

  const isFallbackCard =
    !isLoading &&
    !error &&
    Boolean(fileUrl) &&
    !["pdf", "image"].includes(category) &&
    (!isDocx || Boolean(docxError));

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 2.5));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else if (fileUrl) {
      void downloadFileFromUrl(fileUrl, fileName);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      contentClassName="max-w-5xl w-full h-[88vh] flex flex-col p-4 sm:p-6"
    >
      {/* Header */}
      <DialogHeader className="mb-3 shrink-0 pr-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {category === "pdf" && <FileText className="h-4 w-4" />}
              {category === "image" && <ImageIcon className="h-4 w-4" />}
              {category === "office" && <FileSpreadsheet className="h-4 w-4" />}
              {category === "code" && <FileCode className="h-4 w-4" />}
              {category === "archive" && <FileArchive className="h-4 w-4" />}
              {category === "other" && <FileText className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base font-semibold text-foreground">
                {fileName || translateI18n("docPreview.title")}
              </DialogTitle>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {typeof fileSize === "number" && <span>{formatFileSize(fileSize)}</span>}
                {versionNumber && (
                  <span>
                    • {translateI18n("docPreview.version")} {versionNumber}
                  </span>
                )}
                {uploadedByName && (
                  <span>
                    • {translateI18n("docPreview.uploadedBy")} {uploadedByName}
                  </span>
                )}
                {uploadedAt && <span>• {formatDate(uploadedAt)}</span>}
              </div>
            </div>
          </div>

          {/* Quick status & open in new tab */}
          <div className="flex items-center gap-2">
            {status && (
              <Badge variant="outline" className="text-xs">
                {status}
              </Badge>
            )}
            {fileUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => window.open(fileUrl, "_blank", "noopener,noreferrer")}
                title={translateI18n("docPreview.openNewTab")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{translateI18n("docPreview.openNewTab")}</span>
              </Button>
            )}
          </div>
        </div>
      </DialogHeader>

      {/* Main Preview Container */}
      <div className="relative flex-1 min-h-0 overflow-hidden rounded-xl border border-border/70 bg-muted/10">
        {isLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{translateI18n("docPreview.loading")}</p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              {translateI18n("docPreview.loadFailed")}
            </p>
            <p className="max-w-md text-xs text-muted-foreground">{error}</p>
          </div>
        ) : !fileUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              {translateI18n("docPreview.loadFailed")}
            </p>
          </div>
        ) : category === "pdf" ? (
          /* PDF Viewer */
          <iframe
            src={`${fileUrl}#toolbar=1`}
            className="h-full w-full border-none"
            title={fileName}
          />
        ) : category === "image" ? (
          /* Image Viewer with Zoom Toolbar */
          <div className="relative flex h-full w-full flex-col">
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-border/80 bg-background/90 p-1 shadow-sm backdrop-blur-xs">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleZoomOut}
                title={translateI18n("docPreview.zoomOut")}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="px-1.5 text-[11px] font-semibold text-muted-foreground">
                {Math.round(zoomLevel * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleZoomIn}
                title={translateI18n("docPreview.zoomIn")}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleResetZoom}
                title={translateI18n("docPreview.resetZoom")}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl}
                alt={fileName}
                style={{ transform: `scale(${zoomLevel})` }}
                className="max-h-full max-w-full rounded-md object-contain shadow-xs transition-transform duration-150"
              />
            </div>
          </div>
        ) : isDocx && !docxError ? (
          /* In-Browser DOCX Viewer */
          <div className="relative h-full w-full flex flex-col">
            {docxLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-xs">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{translateI18n("docPreview.loading")}</p>
              </div>
            )}
            <div
              ref={docxContainerRef}
              className="h-full w-full overflow-auto bg-muted/40 p-2 sm:p-4 rounded-lg"
            />
          </div>
        ) : (
          /* Office / Non-previewable file profile card */
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              {category === "office" ? (
                <FileSpreadsheet className="h-10 w-10" />
              ) : category === "archive" ? (
                <FileArchive className="h-10 w-10" />
              ) : (
                <FileText className="h-10 w-10" />
              )}
            </div>

            <h3 className="max-w-md break-words text-lg font-semibold text-foreground">
              {fileName}
            </h3>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              {typeof fileSize === "number" && (
                <Badge variant="secondary">{formatFileSize(fileSize)}</Badge>
              )}
              {mimeType && <Badge variant="outline">{mimeType}</Badge>}
            </div>

            <div className="mt-5 max-w-md rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="leading-relaxed">{translateI18n("docPreview.unsupportedOffice")}</p>
              </div>
            </div>

            {(onDownload || fileUrl) && (
              <Button type="button" variant="default" className="mt-6 gap-2" onClick={handleDownload}>
                <Download className="h-4 w-4" />
                <span>{translateI18n("docPreview.downloadFile")}</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Footer / Action Bar */}
      <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          {(onDownload || fileUrl) && !isFallbackCard && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4 text-primary" />
              <span>{translateI18n("docPreview.downloadFile")}</span>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canReview && onRequestRevision && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => {
                onOpenChange(false);
                onRequestRevision();
              }}
            >
              <AlertCircle className="h-4 w-4" />
              <span>{translateI18n("docPreview.requestRevision")}</span>
            </Button>
          )}

          {canReview && onApprove && (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                onOpenChange(false);
                onApprove();
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{translateI18n("docPreview.approve")}</span>
            </Button>
          )}

          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {translateI18n("docPreview.close")}
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
