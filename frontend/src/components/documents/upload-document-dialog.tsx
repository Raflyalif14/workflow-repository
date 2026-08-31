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
import { Input } from "@/components/ui/input";
import { useUploadDocument } from "@/hooks/use-documents";
import { useProjects } from "@/hooks/use-projects";
import { UploadCloud, FileText } from "lucide-react";

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
  defaultMilestoneId?: string;
}

export function UploadDocumentDialog({
  open,
  onOpenChange,
  defaultProjectId,
  defaultMilestoneId,
}: UploadDocumentDialogProps) {
  const uploadMutation = useUploadDocument();
  const { data: projectsData } = useProjects({ limit: 50 });
  const projects = projectsData?.projects || [];

  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("PROPOSAL");
  const [changelog, setChangelog] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      alert("Please select a file to upload.");
      return;
    }
    if (!projectId) {
      alert("Please select a Project.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("projectId", projectId);
    if (defaultMilestoneId) formData.append("milestoneId", defaultMilestoneId);
    formData.append("title", title);
    formData.append("category", category);
    formData.append("changelog", changelog || "Initial document upload");

    try {
      await uploadMutation.mutateAsync(formData);
      alert("Document uploaded successfully.");
      onOpenChange(false);
      setTitle("");
      setSelectedFile(null);
      setChangelog("");
    } catch (err: any) {
      alert(err.message || "Failed to upload document");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center gap-2 text-primary mb-1">
          <UploadCloud className="h-5 w-5" />
          <DialogTitle>Upload New Repository Document</DialogTitle>
        </div>
        <DialogDescription>
          Upload technical proposals, architecture blueprints, sizing sheets, or project deliverables to private Supabase Storage.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Project Selection */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Associated Project *
          </label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            required
            disabled={uploadMutation.isPending}
          >
            <option value="">-- Select Project --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectCode} — {p.name} ({p.clientName})
              </option>
            ))}
          </select>
        </div>

        {/* Title & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Document Title *
            </label>
            <Input
              placeholder="e.g. High Level Architecture Diagram"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={uploadMutation.isPending}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              disabled={uploadMutation.isPending}
            >
              <option value="PROPOSAL">Proposal</option>
              <option value="ARCHITECTURE_DESIGN">Architecture Design</option>
              <option value="SIZING_SHEET">Sizing Sheet</option>
              <option value="MOM">Minutes of Meeting (MoM)</option>
              <option value="ASSESSMENT_REPORT">Assessment Report</option>
              <option value="BOQ">Bill of Quantity (BOQ)</option>
              <option value="DELIVERABLE">Deliverable</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        {/* File Picker Box */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            File Attachment (PDF, DOCX, XLSX, Images, ZIP) *
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
                      Click to choose file or drag & drop
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Max file size 50 MB
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

        {/* Changelog / Notes */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Version Notes / Changelog
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Initial draft submitted for presales review..."
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={uploadMutation.isPending}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploadMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
