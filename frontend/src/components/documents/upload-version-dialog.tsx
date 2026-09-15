"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUploadNewVersion } from "@/hooks/use-documents";
import {
  formatDocumentFileSize,
  formatDocumentMimeType,
  getVersionLabel,
} from "@/lib/document-surface-ux";
import { DocumentItem } from "@/types/document";
import { AlertCircle, FileText, FileUp, X } from "lucide-react";

interface UploadVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DocumentItem | null;
}

export function UploadVersionDialog({
  open,
  onOpenChange,
  document,
}: UploadVersionDialogProps) {
  const uploadVersionMutation = useUploadNewVersion();

  const [changelog, setChangelog] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  if (!document) return null;

  const currentLatestVersion = document.versions[0]?.versionNumber || 1;
  const nextVersion = currentLatestVersion + 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please select the updated file version.");
      return;
    }
    if (!changelog.trim()) {
      setError("Please enter a brief changelog describing the updates.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("changelog", changelog);

    try {
      setError("");
      await uploadVersionMutation.mutateAsync({
        documentId: document.id,
        formData,
      });
      onOpenChange(false);
      setSelectedFile(null);
      setChangelog("");
      setError("");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to upload version";
      setError(errorMsg);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !uploadVersionMutation.isPending) setError("");
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div className="max-h-[calc(100vh-5rem)] overflow-y-auto pr-1">
        <DialogHeader className="mb-4">
          <div className="flex items-start gap-3 pr-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <FileUp className="h-4 w-4" />
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base">Upload new version</DialogTitle>
                <Badge variant="outline">{getVersionLabel(nextVersion)}</Badge>
              </div>
              <DialogDescription className="mt-0 text-xs leading-5">
                <span className="font-medium text-foreground">{document.title}</span>
                {document.project?.name ? ` · ${document.project.name}` : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="document-version-file"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Revision file <span className="text-destructive">*</span>
            </label>
            <input
              id="document-version-file"
              type="file"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setSelectedFile(file);
                  setError("");
                }
                event.currentTarget.value = "";
              }}
              disabled={uploadVersionMutation.isPending}
              aria-describedby={error ? "upload-version-error" : undefined}
            />

            {selectedFile ? (
              <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border/60 bg-muted/10 p-3">
                <FileText className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground" title={selectedFile.name}>
                    {selectedFile.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDocumentMimeType(selectedFile.type)} ·{" "}
                    {formatDocumentFileSize(selectedFile.size)}
                  </p>
                </div>
                <label
                  htmlFor="document-version-file"
                  className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-primary outline-none hover:bg-primary/10 focus-within:ring-2 focus-within:ring-ring"
                >
                  Replace
                </label>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setSelectedFile(null)}
                  disabled={uploadVersionMutation.isPending}
                  aria-label="Remove selected file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label
                htmlFor="document-version-file"
                className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 px-4 text-center outline-none hover:border-primary/50 hover:bg-muted/20 focus-within:ring-2 focus-within:ring-ring"
              >
                <FileText className="mb-2 h-7 w-7 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  Choose revision file
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  PDF, DOCX, XLSX, images, or ZIP
                </span>
              </label>
            )}
          </div>

          <div>
            <label
              htmlFor="document-version-note"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Version note <span className="text-destructive">*</span>
            </label>
            <textarea
              id="document-version-note"
              rows={3}
              placeholder="Describe what changed in this version..."
              value={changelog}
              onChange={(event) => {
                setChangelog(event.target.value);
                setError("");
              }}
              className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              required
              disabled={uploadVersionMutation.isPending}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "upload-version-error" : undefined}
            />
          </div>

          {error && (
            <div
              id="upload-version-error"
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
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
              onClick={() => handleOpenChange(false)}
              disabled={uploadVersionMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={uploadVersionMutation.isPending}>
              {uploadVersionMutation.isPending ? "Uploading..." : "Upload version"}
            </Button>
          </DialogFooter>
        </form>
      </div>
    </Dialog>
  );
}
