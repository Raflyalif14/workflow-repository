"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { FileCheck2, FolderKanban, Milestone, RotateCcw, UserCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { AssignedMilestone, useMyAssignedMilestones } from "@/hooks/use-projects";
import { useStartMilestoneRevision, useSubmitMilestone } from "@/hooks/use-milestone-workflow";

export default function MilestonesPage() {
  const { user } = useAuth();
  const canLoadAssignments = user?.role === "SA" || user?.role === "HEAD_SA";
  const { data: milestones = [], isLoading, isError } = useMyAssignedMilestones(canLoadAssignments);

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Milestone className="h-4 w-4" />
            Assigned Milestones
          </div>
          <h1 className="text-3xl font-bold tracking-tight">My Milestones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canLoadAssignments ? "Milestones assigned to your Solution Architect profile." : "Open a project to review its milestone timeline."}
          </p>
        </div>
        <Link href="/projects">
          <Button variant="outline" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            Projects
          </Button>
        </Link>
      </div>

      {!canLoadAssignments ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Assigned milestone visibility is available for SA and Head SA roles.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading assigned milestones...</p>
      ) : isError ? (
        <p className="py-12 text-center text-destructive">Unable to load assigned milestones.</p>
      ) : milestones.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No assigned milestones found.</CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Assigned Work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {milestones.map((milestone) => <AssignedMilestoneRow key={milestone.id} milestone={milestone} />)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AssignedMilestoneRow({ milestone }: { milestone: AssignedMilestone }) {
  const { user } = useAuth();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const projectId = milestone.project?.id || milestone.project_id;
  const isSa = user?.role === "SA";
  const startRevision = useStartMilestoneRevision(projectId, milestone.id);

  const handleStartRevision = async () => {
    setMessage("");
    setError("");
    try {
      await startRevision.mutateAsync();
      setMessage("Revision started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start revision.");
    }
  };

  return (
    <div className="rounded-md border border-border/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{String(milestone.step_order).padStart(2, "0")} {milestone.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {milestone.project?.name || "Project"} | {milestone.project?.customer || "-"}
          </p>
          {message && <p className="mt-2 text-xs text-emerald-400">{message}</p>}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={milestone.status === "COMPLETED" ? "success" : milestone.status === "IN_PROGRESS" || milestone.status === "SUBMITTED" ? "warning" : milestone.status === "REJECTED" ? "destructive" : "outline"}>{milestone.status}</Badge>
          {isSa && milestone.status === "IN_PROGRESS" && (
            <Button size="sm" className="gap-1.5" onClick={() => setSubmitOpen(true)}>
              <FileCheck2 className="h-3.5 w-3.5" />
              Submit Milestone
            </Button>
          )}
          {isSa && milestone.status === "SUBMITTED" && <Badge variant="warning">Waiting for HEAD_SA approval</Badge>}
          {isSa && milestone.status === "REJECTED" && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void handleStartRevision()} disabled={startRevision.isPending}>
              <RotateCcw className="h-3.5 w-3.5" />
              {startRevision.isPending ? "Starting..." : "Start Revision"}
            </Button>
          )}
          {projectId && (
            <Link href={`/projects/${projectId}`}>
              <Button size="sm" variant="outline">Open</Button>
            </Link>
          )}
        </div>
      </div>

      <AssignedSubmitDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        projectId={projectId}
        milestone={milestone}
      />
    </div>
  );
}

function AssignedSubmitDialog({
  open,
  onOpenChange,
  projectId,
  milestone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  milestone: AssignedMilestone;
}) {
  const submitMilestone = useSubmitMilestone(projectId, milestone.id);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      await submitMilestone.mutateAsync(note);
      onOpenChange(false);
      setNote("");
      alert("Milestone submitted for HEAD_SA approval.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit milestone.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Submit Milestone</DialogTitle>
        <DialogDescription>{milestone.name}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <textarea
          rows={3}
          placeholder="Optional submission note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={submitMilestone.isPending}>
            {submitMilestone.isPending ? "Submitting..." : "Submit for Approval"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
