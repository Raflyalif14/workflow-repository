"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  postponeProjectFormSchema,
  PostponeProjectFormValues,
} from "@/schemas/project.schema";
import { usePostponeProject } from "@/hooks/use-projects";
import { Project } from "@/types/project";
import { CalendarClock } from "lucide-react";

interface PostponeProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
}

export function PostponeProjectDialog({
  open,
  onOpenChange,
  project,
}: PostponeProjectDialogProps) {
  const postponeProjectMutation = usePostponeProject();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PostponeProjectFormValues>({
    resolver: zodResolver(postponeProjectFormSchema),
    defaultValues: {
      newTargetEndDate: "",
      reason: "",
    },
  });

  const onSubmit = async (data: PostponeProjectFormValues) => {
    if (!project) return;
    try {
      await postponeProjectMutation.mutateAsync({
        projectId: project.id,
        data: {
          newTargetEndDate: data.newTargetEndDate,
          reason: data.reason,
        },
      });
      alert(`Project ${project.projectCode} has been successfully postponed.`);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      alert(err.message || "Failed to postpone project");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center gap-2 text-amber-400 mb-1">
          <CalendarClock className="h-5 w-5" />
          <DialogTitle>Postpone Project Timeline</DialogTitle>
        </div>
        <DialogDescription>
          Extend target deadline for <span className="font-semibold text-foreground">{project?.name}</span> ({project?.projectCode}).
          This will update the project status and record a formal audit trail.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Current Target Deadline
          </label>
          <div className="text-sm font-medium text-foreground bg-muted/40 px-3 py-2 rounded-md border border-border">
            {project?.targetEndDate
              ? new Date(project.targetEndDate).toLocaleDateString("id-ID", {
                  dateStyle: "full",
                })
              : "-"}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            New Target Deadline *
          </label>
          <Input
            type="date"
            {...register("newTargetEndDate")}
            disabled={isSubmitting}
          />
          {errors.newTargetEndDate && (
            <p className="text-xs text-destructive mt-1">
              {errors.newTargetEndDate.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Reason for Postponement *
          </label>
          <textarea
            rows={3}
            placeholder="e.g. Client requested architecture scope change, pending security audit sign-off..."
            {...register("reason")}
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isSubmitting}
          />
          {errors.reason && (
            <p className="text-xs text-destructive mt-1">{errors.reason.message}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
          >
            {isSubmitting ? "Updating..." : "Confirm Postpone"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
