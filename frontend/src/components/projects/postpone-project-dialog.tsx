"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock } from "lucide-react";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePostponeProject } from "@/hooks/use-projects";
import { postponeProjectFormSchema, PostponeProjectFormValues } from "@/schemas/project.schema";
import { Project } from "@/types/project";

export function PostponeProjectDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
}) {
  const postponeProject = usePostponeProject();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PostponeProjectFormValues>({
    resolver: zodResolver(postponeProjectFormSchema),
    defaultValues: { reason: "" },
  });

  const submit = async (data: PostponeProjectFormValues) => {
    if (!project) return;
    try {
      await postponeProject.mutateAsync({ projectId: project.id, reason: data.reason });
      reset();
      onOpenChange(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to postpone project.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="mb-1 flex items-center gap-2 text-amber-500">
          <CalendarClock className="h-5 w-5" />
          <DialogTitle>Postpone Project</DialogTitle>
        </div>
        <DialogDescription>
          {project?.name}
        </DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={handleSubmit(submit)}>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reason for Postponement *
          </label>
          <textarea
            rows={3}
            {...register("reason")}
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isSubmitting}
          />
          {errors.reason && <p className="mt-1 text-xs text-destructive">{errors.reason.message}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting} className="bg-amber-500 text-black hover:bg-amber-600">
            {isSubmitting ? "Saving..." : "Confirm Postpone"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
