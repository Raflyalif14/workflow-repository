"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, FileText, Paperclip, UploadCloud, X } from "lucide-react";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUploadSalesMilestoneDocuments } from "@/hooks/use-documents";
import {
  appendDocumentFiles,
  canSubmitDocumentFiles,
  DOCUMENT_ACCEPT,
  getDocumentFileKey,
  MAX_DOCUMENT_FILES,
  removeDocumentFile,
} from "@/lib/document-file-selection";

function formatFileSize(size: number): string {
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

interface SalesMilestoneDocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  milestoneId: string;
  milestoneName: string;
  onSuccess: (uploadedCount: number) => void;
}

export function SalesMilestoneDocumentUploadDialog({
  open,
  onOpenChange,
  projectId,
  milestoneId,
  milestoneName,
  onSuccess,
}: SalesMilestoneDocumentUploadDialogProps) {
  const uploadDocuments = useUploadSalesMilestoneDocuments(projectId, milestoneId);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const reset = () => {
    setFiles([]);
    setError(null);
    setSelectionError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !uploadDocuments.isPending) reset();
    onOpenChange(nextOpen);
  };

  const addFiles = (selectedFiles: FileList | null) => {
    if (!selectedFiles?.length) return;
    const selection = appendDocumentFiles(files, selectedFiles);
    setFiles(selection.files);
    setSelectionError(selection.error);
    setError(null);
  };

  const removeFile = (index: number) => {
    setFiles((current) => removeDocumentFile(current, index));
    setSelectionError(null);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitDocumentFiles(files, selectionError) || uploadDocuments.isPending) return;

    setError(null);
    try {
      const result = await uploadDocuments.mutateAsync(files);
      onSuccess(result.documents.length);
      reset();
      onOpenChange(false);
    } catch {
      setError("Unable to upload milestone documents. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader className="mb-5 space-y-0">
        <div className="flex items-start gap-3 pr-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <UploadCloud className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-base font-semibold tracking-tight">Upload Milestone Documents</DialogTitle>
            <DialogDescription className="mt-0 text-xs leading-relaxed">
              Add official documents for the SALES milestone &ldquo;{milestoneName}&rdquo;.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Documents
          </label>
          <label className="flex min-h-28 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/15 px-4 text-center transition-colors hover:border-primary/30 hover:bg-muted/25">
            <Paperclip className="mb-2 h-7 w-7 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Choose one or more files</span>
            <span className="mt-0.5 text-[11px] text-muted-foreground">
              Up to {MAX_DOCUMENT_FILES} files, 50 MB each
            </span>
            <Input
              type="file"
              className="hidden"
              accept={DOCUMENT_ACCEPT}
              multiple
              disabled={uploadDocuments.isPending}
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>

        {files.length > 0 && (
          <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
            {files.map((file, index) => (
              <div
                key={getDocumentFileKey(file)}
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2"
              >
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeFile(index)}
                  disabled={uploadDocuments.isPending}
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {(error || selectionError) && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error || selectionError}</span>
          </div>
        )}

        <DialogFooter className="border-t border-border/40 pt-4">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-lg"
            onClick={() => handleOpenChange(false)}
            disabled={uploadDocuments.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="h-9 rounded-lg"
            disabled={!canSubmitDocumentFiles(files, selectionError) || uploadDocuments.isPending}
          >
            {uploadDocuments.isPending ? "Uploading..." : "Upload Documents"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
