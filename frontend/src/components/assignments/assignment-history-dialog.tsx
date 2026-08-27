"use client";

import React from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAssignmentHistory } from "@/hooks/use-assignments";
import { History, ArrowRight, User as UserIcon, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AssignmentHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

export function AssignmentHistoryDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: AssignmentHistoryDialogProps) {
  const { data: histories = [], isLoading, isError } = useAssignmentHistory(projectId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center gap-2 text-primary mb-1">
          <History className="h-5 w-5" />
          <DialogTitle>Assignment History Audit</DialogTitle>
        </div>
        <DialogDescription>
          Complete historical timeline of Solution Architect assignments for project{" "}
          <span className="font-semibold text-foreground">{projectName}</span>.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Loading assignment records...
          </div>
        ) : isError ? (
          <div className="py-8 text-center text-xs text-destructive">
            Failed to load assignment history.
          </div>
        ) : histories.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No assignment changes recorded yet for this project.
          </div>
        ) : (
          <div className="relative border-l-2 border-border/80 ml-3 space-y-4">
            {histories.map((item) => (
              <div key={item.id} className="relative pl-5">
                {/* Dot */}
                <div className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-primary bg-background" />

                <div className="rounded-lg border border-border/70 bg-card p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">
                      {item.milestone ? `Stage: ${item.milestone.name}` : "Project-Wide PIC"}
                    </span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {new Date(item.createdAt).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>

                  {/* Transition: Prev PIC -> New PIC */}
                  <div className="flex items-center gap-2 bg-muted/40 p-2 rounded border border-border/40">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <UserIcon className="h-3.5 w-3.5" />
                      <span>{item.previousPic?.fullName || "Initial (Unassigned)"}</span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
                    <div className="flex items-center gap-1.5 font-bold text-foreground">
                      <UserIcon className="h-3.5 w-3.5 text-primary" />
                      <span>{item.newPic.fullName}</span>
                    </div>
                  </div>

                  {/* Reason & Assigned By */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    <span>
                      Assigned by: <strong className="text-foreground">{item.assignedBy.fullName}</strong>
                    </span>
                    {item.reason && (
                      <span className="italic max-w-[200px] truncate" title={item.reason}>
                        &quot;{item.reason}&quot;
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
