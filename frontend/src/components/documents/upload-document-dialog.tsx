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
import { useProjects, useProjectMilestones } from "@/hooks/use-projects";
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
  const [milestoneId, setMilestoneId] = useState(defaultMilestoneId || "");

  const { data: milestones = [] } = useProjectMilestones(projectId);

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
    if (milestoneId) {
      formData.append("milestoneId", milestoneId);
    }
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
      <DialogHeader className="mb-5 space-y-0">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <UploadCloud className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-base font-semibold tracking-tight">Upload New Repository Document</DialogTitle>
            <DialogDescription className="mt-0 text-xs leading-relaxed">
              Upload technical proposals, architecture blueprints, sizing sheets, or project deliverables to private Supabase Storage.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Project Selection */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Associated Project *
          </label>
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setMilestoneId("");
            }}
            className="flex h-10 w-full rounded-lg border border-input bg-background/50 px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
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
        {/* Milestone Selection */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Associated Milestone <span className="normal-case tracking-normal text-muted-foreground/80">(Optional)</span>
          </label>

          <select
            value={milestoneId}
            onChange={(e) => setMilestoneId(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background/50 px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={!projectId || uploadMutation.isPending}
          >
            <option value="">-- Project-level document --</option>

            {milestones.map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                Step {milestone.step_order} - {milestone.name}
              </option>
            ))}
          </select>
        </div>
        {/* Title & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Document Title *
            </label>
            <Input
              placeholder="e.g. High Level Architecture Diagram"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={uploadMutation.isPending}
              className="h-10 border-input bg-background/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background/50 px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
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
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            File Attachment (PDF, DOCX, XLSX, Images, ZIP) *
          </label>
          <div className="flex items-center justify-center w-full">
            <label className="flex h-28 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/15 transition-colors hover:border-primary/30 hover:bg-muted/25">
              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
                {selectedFile ? (
                  <p className="text-xs font-semibold text-primary">
                    {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-foreground font-medium">
                      Click to choose file
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
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Version Notes / Changelog
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Initial draft submitted for presales review..."
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            className="flex w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={uploadMutation.isPending}
          />
        </div>

        <DialogFooter className="border-t border-border/40 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploadMutation.isPending}
            className="h-9 rounded-lg"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={uploadMutation.isPending} className="h-9 rounded-lg">
            {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
