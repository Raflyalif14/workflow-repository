"use client";

import Link from "next/link";
import { FolderKanban, Milestone, UserCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { useMyAssignedMilestones } from "@/hooks/use-projects";

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
            {milestones.map((milestone) => (
              <div key={milestone.id} className="flex flex-col gap-3 rounded-md border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{String(milestone.step_order).padStart(2, "0")} {milestone.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {milestone.project?.name || "Project"} | {milestone.project?.customer || "-"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={milestone.status === "COMPLETED" ? "success" : milestone.status === "IN_PROGRESS" ? "warning" : "outline"}>{milestone.status}</Badge>
                  {milestone.project?.id && (
                    <Link href={`/projects/${milestone.project.id}`}>
                      <Button size="sm" variant="outline">Open</Button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
