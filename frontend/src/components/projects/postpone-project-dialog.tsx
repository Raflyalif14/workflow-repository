"use client";

import { translateProjectStatus, translate as translateI18n } from "@/i18n";
import { useLanguage } from "@/components/i18n/language-provider";

import { useRef, useState } from "react";
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
  useLanguage();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<"businessAudit.failed" | "businessAudit.stale" | null>(null);
  const busy = useRef(false);
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
    if (!project || busy.current || error === "businessAudit.stale") return;
    if (!confirming) { setConfirming(true); return; }
    busy.current = true; setError(null);
    try {
      await postponeProject.mutateAsync({ projectId: project.id, reason: data.reason });
      reset(); setConfirming(false);
      onOpenChange(false);
    } catch (cause) {
      setError((cause as {status?:number})?.status === 409 ? "businessAudit.stale" : "businessAudit.failed");
    } finally { busy.current = false; }
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy.current) { setConfirming(false); if (!value) setError(null); onOpenChange(value); } }}>
      <DialogHeader>
        <div className="mb-1 flex items-center gap-2 text-amber-500">
          <CalendarClock className="h-5 w-5" />
          <DialogTitle>{translateI18n("copy.postponeProject")}</DialogTitle>
        </div>
        <DialogDescription>
          {project?.name}
        </DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={handleSubmit(submit)}>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {translateI18n("projectAction.postponeReason")} *
          </label>
          <textarea
            rows={3}
            {...register("reason", { onChange: () => project && postponeProject.prepare?.(project.id) })}
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isSubmitting || confirming}
          />
          {errors.reason && <p className="mt-1 text-xs text-destructive">{translateI18n("projectAction.postponeReasonMin")}</p>}
        </div>
        {confirming && <p className="whitespace-pre-wrap text-sm">{translateI18n("businessAudit.check")} {project ? translateProjectStatus(project.status) : "-"} {" -> "} {translateI18n("projectStatus.POSTPONED")}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{translateI18n(error)}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { setConfirming(false); setError(null); onOpenChange(false); }} disabled={isSubmitting}>{translateI18n("common.cancel")}</Button>
          <Button type="submit" disabled={isSubmitting || error === "businessAudit.stale"} className="bg-amber-500 text-black hover:bg-amber-600">
            {translateI18n(isSubmitting ? "common.saving" : confirming ? "projectAction.confirmPostpone" : "reviewConfirm.continue")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
