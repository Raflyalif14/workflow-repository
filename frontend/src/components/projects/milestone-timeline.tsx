"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  Clock,
  Play,
  Check,
  XCircle,
  Lock,
  Send,
  UserPlus,
  User as UserIcon,
  AlertCircle,
  FileCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ProjectMilestone, MilestoneStatus } from "@/types/project";
import { apiClient } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";

interface MilestoneTimelineProps {
  milestones: ProjectMilestone[];
  projectId: string;
}

export function MilestoneTimeline({
  milestones,
  projectId,
}: MilestoneTimelineProps) {
  const queryClient = useQueryClient();
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Modal Action States
  const [activeMilestone, setActiveMilestone] = useState<ProjectMilestone | null>(null);
  const [modalAction, setModalAction] = useState<"SUBMIT" | "APPROVE" | "REJECT" | null>(null);
  const [notes, setNotes] = useState("");

  const refreshProject = () => {
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const getStatusBadge = (status: MilestoneStatus) => {
    switch (status) {
      case "COMPLETED":
      case "APPROVED":
        return <Badge variant="success">Approved & Completed</Badge>;
      case "WAITING_APPROVAL":
        return <Badge variant="warning">Waiting Head SA Approval</Badge>;
      case "IN_PROGRESS":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">In Progress</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">Revision Required (Rejected)</Badge>;
      case "OVERDUE":
        return <Badge variant="destructive">Overdue</Badge>;
      default:
        return <Badge variant="outline">Not Started (Locked)</Badge>;
    }
  };

  const handleStart = async (milestoneId: string) => {
    setIsActionLoading(true);
    try {
      await apiClient(`/engine/milestones/${milestoneId}/start`, { method: "POST" });
      refreshProject();
    } catch (err: any) {
      alert(err.message || "Failed to start milestone");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!activeMilestone || !modalAction) return;
    setIsActionLoading(true);

    try {
      if (modalAction === "SUBMIT") {
        await apiClient(`/engine/milestones/${activeMilestone.id}/submit`, {
          method: "POST",
          body: JSON.stringify({ notes }),
        });
      } else if (modalAction === "APPROVE") {
        await apiClient(`/engine/milestones/${activeMilestone.id}/approve`, {
          method: "POST",
          body: JSON.stringify({ feedback: notes }),
        });
      } else if (modalAction === "REJECT") {
        if (!notes || notes.length < 5) {
          alert("Please provide at least 5 characters of feedback for rejection.");
          setIsActionLoading(false);
          return;
        }
        await apiClient(`/engine/milestones/${activeMilestone.id}/reject`, {
          method: "POST",
          body: JSON.stringify({ feedback: notes }),
        });
      }

      setModalAction(null);
      setActiveMilestone(null);
      setNotes("");
      refreshProject();
    } catch (err: any) {
      alert(err.message || "Action failed");
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative border-l-2 border-border/80 ml-4 space-y-6 pb-2">
        {milestones.map((milestone, idx) => {
          const isCompleted =
            milestone.status === "COMPLETED" || milestone.status === "APPROVED";
          const isCurrent = milestone.status === "IN_PROGRESS";
          const isWaitingApproval = milestone.status === "WAITING_APPROVAL";
          const isRejected = milestone.status === "REJECTED";

          // Sequential Rule: Previous step must be completed to unlock
          const prevMilestone = idx > 0 ? milestones[idx - 1] : null;
          const isUnlocked =
            idx === 0 ||
            prevMilestone?.status === "COMPLETED" ||
            prevMilestone?.status === "APPROVED";

          return (
            <div key={milestone.id} className="relative pl-6">
              {/* Timeline Step Icon Indicator */}
              <div
                className={`absolute -left-[17px] top-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-background transition-colors ${
                  isCompleted
                    ? "border-emerald-500 text-emerald-400 shadow-sm shadow-emerald-500/20"
                    : isWaitingApproval
                    ? "border-amber-500 text-amber-400 animate-pulse"
                    : isRejected
                    ? "border-destructive text-destructive"
                    : isCurrent
                    ? "border-primary text-primary ring-4 ring-primary/10 animate-pulse"
                    : !isUnlocked
                    ? "border-muted text-muted-foreground opacity-50"
                    : "border-muted-foreground text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : !isUnlocked ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <span className="text-xs font-bold font-mono">{milestone.orderIndex}</span>
                )}
              </div>

              {/* Milestone Card Box */}
              <div
                className={`rounded-xl border bg-card p-4 shadow-sm transition ${
                  isCurrent
                    ? "border-primary/60 bg-primary/5"
                    : isWaitingApproval
                    ? "border-amber-500/40 bg-amber-500/5"
                    : !isUnlocked
                    ? "border-border/40 opacity-70"
                    : "border-border/70 hover:border-primary/40"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-muted-foreground">
                        Step {milestone.orderIndex}
                      </span>
                      {getStatusBadge(milestone.status)}
                    </div>
                    <h4 className="text-base font-semibold text-foreground">
                      {milestone.name}
                    </h4>
                  </div>

                  {/* Dynamic Action Buttons based on Milestone State */}
                  <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                    {milestone.status === "NOT_STARTED" && (
                      <Button
                        size="sm"
                        variant={isUnlocked ? "default" : "outline"}
                        disabled={!isUnlocked || isActionLoading}
                        className="gap-1.5 h-8 text-xs"
                        onClick={() => handleStart(milestone.id)}
                      >
                        {isUnlocked ? <Play className="h-3.5 w-3.5 fill-current" /> : <Lock className="h-3.5 w-3.5" />}
                        <span>{isUnlocked ? "Start Step" : "Locked (Step N-1 Required)"}</span>
                      </Button>
                    )}

                    {(milestone.status === "IN_PROGRESS" || milestone.status === "REJECTED") && (
                      <Button
                        size="sm"
                        className="gap-1.5 h-8 text-xs bg-primary text-primary-foreground shadow-sm"
                        disabled={isActionLoading}
                        onClick={() => {
                          setActiveMilestone(milestone);
                          setModalAction("SUBMIT");
                        }}
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Submit Deliverable</span>
                      </Button>
                    )}

                    {milestone.status === "WAITING_APPROVAL" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                          disabled={isActionLoading}
                          onClick={() => {
                            setActiveMilestone(milestone);
                            setModalAction("REJECT");
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Reject (Head SA)</span>
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1.5 h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
                          disabled={isActionLoading}
                          onClick={() => {
                            setActiveMilestone(milestone);
                            setModalAction("APPROVE");
                          }}
                        >
                          <FileCheck2 className="h-3.5 w-3.5" />
                          <span>Approve (Head SA)</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Revision Notes if any */}
                {milestone.notes && (
                  <div className="mt-2.5 rounded-lg bg-muted/40 border border-border/50 p-2.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Notes/Feedback: </span>
                    {milestone.notes}
                  </div>
                )}

                {/* Footer Metadata */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-3 pt-3 border-t border-border/40">
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="h-3.5 w-3.5" />
                    <span>
                      PIC: <strong className="text-foreground">{milestone.pic?.fullName || "Unassigned"}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      Deadline:{" "}
                      <strong className="text-foreground">
                        {new Date(milestone.deadline).toLocaleDateString("id-ID", {
                          dateStyle: "medium",
                        })}
                      </strong>
                    </span>
                  </div>

                  {milestone.actualEndDate && (
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>
                        Finished:{" "}
                        {new Date(milestone.actualEndDate).toLocaleDateString("id-ID", {
                          dateStyle: "medium",
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Dialog (Submit / Approve / Reject) */}
      <Dialog
        open={!!modalAction}
        onOpenChange={(open) => {
          if (!open) {
            setModalAction(null);
            setActiveMilestone(null);
            setNotes("");
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {modalAction === "SUBMIT" && "Submit Milestone Deliverable"}
            {modalAction === "APPROVE" && "Approve Milestone (Head SA)"}
            {modalAction === "REJECT" && "Reject Milestone Deliverable (Head SA)"}
          </DialogTitle>
          <DialogDescription>
            {modalAction === "SUBMIT" &&
              `Submit '${activeMilestone?.name}' for review. If approval is required, Head Solution Architect will be notified.`}
            {modalAction === "APPROVE" &&
              `Confirm approval for '${activeMilestone?.name}'. This will advance the workflow to the next step.`}
            {modalAction === "REJECT" &&
              `Provide feedback to the PIC for revision on '${activeMilestone?.name}'.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {modalAction === "REJECT" ? "Rejection Reason (Required) *" : "Notes / Feedback (Optional)"}
          </label>
          <textarea
            rows={3}
            placeholder={
              modalAction === "REJECT"
                ? "Describe what needs to be revised before approval..."
                : "Add optional remarks or completion notes..."
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setModalAction(null)}
            disabled={isActionLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmAction}
            disabled={isActionLoading}
            variant={modalAction === "REJECT" ? "destructive" : "default"}
          >
            {isActionLoading ? "Processing..." : `Confirm ${modalAction}`}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
