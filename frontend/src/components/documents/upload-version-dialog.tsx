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
import { useUploadNewVersion } from "@/hooks/use-documents";
import { DocumentItem } from "@/types/document";
import { History, FileUp, FileText } from "lucide-react";

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

  if (!document) return null;

  const currentLatestVersion = document.versions[0]?.versionNumber || 1;
  const nextVersion = currentLatestVersion + 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      alert("Please select the updated file version.");
      return;
    }
    if (!changelog.trim()) {
      alert("Please enter a brief changelog describing the updates.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("changelog", changelog);

    try {
      await uploadVersionMutation.mutateAsync({
        documentId: document.id,
        formData,
      });
      alert(`Version v${nextVersion} uploaded successfully.`);
      onOpenChange(false);
      setSelectedFile(null);
      setChangelog("");
    } catch (err: any) {
      alert(err.message || "Failed to upload version");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center gap-2 text-primary mb-1">
          <FileUp className="h-5 w-5" />
          <DialogTitle>Upload New Version (v{nextVersion})</DialogTitle>
        </div>
        <DialogDescription>
          Publish a revised version for <span className="font-semibold text-foreground">{document.title}</span>.
          Previous versions will be archived and superseded automatically.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* File Picker */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            New File Attachment *
          </label>
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border rounded-xl cursor-pointer bg-card hover:bg-muted/20 hover:border-primary/50 transition">
              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                <FileText className="w-8 h-8 mb-2 text-muted-foreground" />
                {selectedFile ? (
                  <p className="text-xs font-semibold text-primary">
                    {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-foreground font-medium">
                      Click to choose revision file
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      PDF, DOCX, XLSX, Images, ZIP
                    </p>
                  </>
                )}
              </div>
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                }}
              />
            </label>
          </div>
        </div>

        {/* Changelog */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Changelog / Revision Summary *
          </label>
          <textarea
            rows={3}
            placeholder="e.g. Updated network topology diagram as requested by Head SA..."
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            required
            disabled={uploadVersionMutation.isPending}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploadVersionMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={uploadVersionMutation.isPending}>
            {uploadVersionMutation.isPending ? "Uploading Version..." : `Publish v${nextVersion}`}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
