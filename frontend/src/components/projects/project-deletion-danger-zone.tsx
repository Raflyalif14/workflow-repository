"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDeleteProject, useProjectDeletionPreview } from "@/hooks/use-projects";
import { Project } from "@/types/project";

export function ProjectDeletionDangerZone({ project }: { project: Project }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [cleanupWarning, setCleanupWarning] = useState("");
  const preview = useProjectDeletionPreview(project.id, open);
  const deletion = useDeleteProject(project.id);
  const canDelete = confirmation === project.name && Boolean(preview.data) && !deletion.isPending;

  const close = (nextOpen: boolean) => {
    if (!nextOpen && !deletion.isPending) {
      setConfirmation("");
      setError("");
      setCleanupWarning("");
    }
    setOpen(nextOpen);
  };

  const submit = async () => {
    if (!canDelete) return;
    setError("");
    try {
      const result = await deletion.mutateAsync(confirmation);
      if (result.cleanup.status !== "COMPLETED") {
        setCleanupWarning("Project data was deleted, but document storage cleanup is pending. An administrator must retry the recorded cleanup job.");
        window.setTimeout(() => router.push("/projects"), 1800);
        return;
      }
      router.push("/projects");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete project.");
    }
  };

  return (
    <>
      <Card className="border-destructive/40 bg-destructive/5 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive"><AlertTriangle className="h-4 w-4" /></span>
            <div className="space-y-1"><CardTitle className="text-base font-semibold tracking-tight">Danger Zone</CardTitle><CardDescription className="text-xs">Deleting this project permanently removes its workflow data, documents, approvals, and related records.</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent><Button variant="destructive" className="gap-2" onClick={() => setOpen(true)}><Trash2 className="h-4 w-4" />Delete Project</Button></CardContent>
      </Card>

      <Dialog open={open} onOpenChange={close}>
        <DialogHeader><DialogTitle>Delete Project Permanently</DialogTitle><DialogDescription>{project.name}</DialogDescription></DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">This action is permanent. It removes the project and all project-owned workflow records.</p>
          {preview.isLoading ? <p className="text-xs text-muted-foreground">Loading deletion preview...</p> : preview.isError ? <p className="text-xs text-destructive">Unable to load the deletion preview.</p> : preview.data && (
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/15 p-3 text-xs text-muted-foreground">
              <span>Milestones: <strong className="text-foreground">{preview.data.milestone_count}</strong></span><span>Documents: <strong className="text-foreground">{preview.data.document_count}</strong></span>
              <span>Versions: <strong className="text-foreground">{preview.data.document_version_count}</strong></span><span>Submission files: <strong className="text-foreground">{preview.data.submission_attachment_count}</strong></span>
              <span>Project Intake files: <strong className="text-foreground">{preview.data.project_intake_attachment_count}</strong></span>
              <span>Supporting inputs: <strong className="text-foreground">{preview.data.milestone_contribution_count}</strong></span><span>Supporting files: <strong className="text-foreground">{preview.data.milestone_contribution_attachment_count}</strong></span>
              <span>Approvals: <strong className="text-foreground">{Object.values(preview.data.approvals).reduce((total, count) => total + count, 0)}</strong></span><span>Assignments: <strong className="text-foreground">{preview.data.assignment_count}</strong></span>
              <span>Notifications: <strong className="text-foreground">{preview.data.notification_count}</strong></span><span>Storage objects: <strong className="text-foreground">{preview.data.storage_object_count}</strong></span>
            </div>
          )}
          <div><label htmlFor="delete-project-confirmation" className="mb-1 block text-xs font-semibold">Type <strong>{project.name}</strong> to confirm</label><Input id="delete-project-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={deletion.isPending} /></div>
          {error && <p className="text-xs text-destructive">{error}</p>}{cleanupWarning && <p className="text-xs text-amber-500">{cleanupWarning}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => close(false)} disabled={deletion.isPending}>Cancel</Button><Button variant="destructive" onClick={() => void submit()} disabled={!canDelete}>{deletion.isPending ? "Deleting..." : "Delete Project"}</Button></DialogFooter>
      </Dialog>
    </>
  );
}
