"use client";

import { CalendarClock, Check, Circle, Clock, User as UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProjectMilestone, MilestoneStatus } from "@/types/project";

interface MilestoneTimelineProps {
  milestones: ProjectMilestone[];
  projectId: string;
}

export function MilestoneTimeline({ milestones }: MilestoneTimelineProps) {
  return (
    <div className="space-y-4">
      <div className="relative ml-4 space-y-6 border-l-2 border-border/80 pb-2">
        {milestones.map((milestone) => {
          const isDone = milestone.status === "COMPLETED" || milestone.status === "APPROVED";
          const isActive = milestone.status === "IN_PROGRESS";

          return (
            <div key={milestone.id} className="relative pl-6">
              <div
                className={`absolute -left-[17px] top-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-background ${
                  isDone
                    ? "border-emerald-500 text-emerald-400"
                    : isActive
                      ? "border-primary text-primary"
                      : "border-muted-foreground text-muted-foreground"
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
              </div>

              <div className="rounded-lg border border-border/70 bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">
                        Step {milestone.orderIndex}
                      </span>
                      <MilestoneStatusBadge status={milestone.status} />
                    </div>
                    <h4 className="text-base font-semibold text-foreground">{milestone.name}</h4>
                    {milestone.notes && (
                      <p className="max-w-2xl text-xs text-muted-foreground">{milestone.notes}</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border/40 pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="h-3.5 w-3.5" />
                    <span>
                      PIC: <strong className="text-foreground">{milestone.pic?.fullName || milestone.pic?.full_name || "Unassigned"}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" />
                    <span>
                      Deadline: <strong className="text-foreground">{formatDate(milestone.deadline)}</strong>
                    </span>
                  </div>

                  {milestone.actualEndDate && (
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Finished: {formatDate(milestone.actualEndDate)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  if (status === "COMPLETED" || status === "APPROVED") return <Badge variant="success">{status}</Badge>;
  if (status === "IN_PROGRESS") return <Badge variant="warning">IN_PROGRESS</Badge>;
  if (status === "SUBMITTED" || status === "WAITING_APPROVAL") {
    return <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-300">{status}</Badge>;
  }
  if (status === "REJECTED" || status === "OVERDUE") return <Badge variant="destructive">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
}
