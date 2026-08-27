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
import { useAssignPic, useEligibleSAs } from "@/hooks/use-assignments";
import { UserCheck, Sparkles, User as UserIcon } from "lucide-react";

interface AssignPicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  milestoneId?: string;
  milestoneName?: string;
  currentPicId?: string;
}

export function AssignPicDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  milestoneId,
  milestoneName,
  currentPicId,
}: AssignPicDialogProps) {
  const { data: architects = [], isLoading: isLoadingSAs } = useEligibleSAs();
  const assignMutation = useAssignPic();

  const [selectedPicId, setSelectedPicId] = useState<string>("");
  const [assignToAllFuture, setAssignToAllFuture] = useState(true);
  const [reason, setReason] = useState("");

  const isReassignment = currentPicId && selectedPicId && currentPicId !== selectedPicId;

  // Head SA option (self)
  const headSa = architects.find(
    (a) => a.role === "HEAD_SA" || a.role === "SUPER_ADMIN"
  );

  const handleAssignToMyself = () => {
    if (headSa) {
      setSelectedPicId(headSa.id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPicId) {
      alert("Please select a Solution Architect.");
      return;
    }

    try {
      await assignMutation.mutateAsync({
        projectId,
        data: {
          newPicId: selectedPicId,
          milestoneId,
          assignToAllFuture,
          reason,
        },
      });
      alert("PIC assigned successfully.");
      onOpenChange(false);
      setReason("");
      setSelectedPicId("");
    } catch (err: any) {
      alert(err.message || "Failed to assign PIC");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center gap-2 text-primary mb-1">
          <UserCheck className="h-5 w-5" />
          <DialogTitle>Assign / Reassign Solution Architect</DialogTitle>
        </div>
        <DialogDescription>
          Assign a dedicated Solution Architect for project <span className="font-semibold text-foreground">{projectName}</span>
          {milestoneName ? ` (Stage: ${milestoneName})` : ""}.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Quick Action: Assign to Myself */}
        {headSa && (
          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="text-xs">
              <span className="font-semibold text-foreground">Head SA Quick Action</span>
              <p className="text-muted-foreground">Assign this project/deliverable to yourself ({headSa.fullName})</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 text-xs border-primary/40 text-primary hover:bg-primary/10"
              onClick={handleAssignToMyself}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Assign to Myself</span>
            </Button>
          </div>
        )}

        {/* SA Selection Dropdown */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Select Solution Architect *
          </label>
          <select
            value={selectedPicId}
            onChange={(e) => setSelectedPicId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isLoadingSAs || assignMutation.isPending}
            required
          >
            <option value="">-- Choose Solution Architect --</option>
            {architects.map((sa) => (
              <option key={sa.id} value={sa.id}>
                {sa.fullName} ({sa.role}) — {sa._count?.assignedMilestones || 0} Active Tasks
              </option>
            ))}
          </select>
        </div>

        {/* Scope Checkbox */}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="assignToAllFuture"
            checked={assignToAllFuture}
            onChange={(e) => setAssignToAllFuture(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary h-4 w-4 bg-background"
          />
          <label htmlFor="assignToAllFuture" className="text-xs font-medium cursor-pointer">
            Apply assignment to this milestone and all subsequent milestones
          </label>
        </div>

        {/* Reassignment / Reason Notes */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Assignment Notes / Justification {isReassignment && "(Recommended for Reassignment)"}
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Expertise in cloud migration, workload distribution..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={assignMutation.isPending}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={assignMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={assignMutation.isPending}>
            {assignMutation.isPending ? "Assigning..." : "Confirm Assignment"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
