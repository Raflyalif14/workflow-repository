"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSaveProjectTimeline } from "@/hooks/use-projects";
import {
  getTimelinePlanningMilestones,
  resolveTimelineWorkflowMode,
} from "@/lib/workflow-ux-helpers";
import { ProjectMilestonePhase4 } from "@/types/project";

type TimelineDraftRow = {
  milestoneId: string;
  stepOrder: number;
  name: string;
  role: string;
  startDate: string;
  durationWorkingDays: string;
  savedStartDate: string;
  savedDurationWorkingDays: string;
  dueDate: string | null;
};

const toDraftRows = (
  milestones: ProjectMilestonePhase4[],
  workflowModel?: string | null,
  workflowVersion?: number | null
): TimelineDraftRow[] =>
  getTimelinePlanningMilestones(milestones, workflowModel, workflowVersion)
    .map((milestone) => ({
      milestoneId: milestone.id,
      stepOrder: milestone.step_order,
      name: milestone.name,
      role: milestone.workflow_stage?.default_role || "-",
      startDate: milestone.start_date || "",
      durationWorkingDays: milestone.duration_working_days ? String(milestone.duration_working_days) : "",
      savedStartDate: milestone.start_date || "",
      savedDurationWorkingDays: milestone.duration_working_days ? String(milestone.duration_working_days) : "",
      dueDate: milestone.due_date || null,
    }));

export function ProjectTimelineEditor({
  projectId,
  milestones,
  canEdit,
  workflowModel,
  workflowVersion,
}: {
  projectId: string;
  milestones: ProjectMilestonePhase4[];
  canEdit: boolean;
  workflowModel?: string | null;
  workflowVersion?: number | null;
}) {
  const workflowMode = resolveTimelineWorkflowMode(workflowModel, workflowVersion);
  const [rows, setRows] = useState<TimelineDraftRow[]>(() =>
    toDraftRows(milestones, workflowModel, workflowVersion)
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const saveTimeline = useSaveProjectTimeline(projectId);

  useEffect(() => {
    setRows(toDraftRows(milestones, workflowModel, workflowVersion));
  }, [milestones, workflowModel, workflowVersion]);

  const invalidRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          !row.startDate ||
          !Number.isInteger(Number(row.durationWorkingDays)) ||
          Number(row.durationWorkingDays) <= 0
      ),
    [rows]
  );

  const isValid = rows.length > 0 && invalidRows.length === 0;

  const hasUnsavedChanges = useMemo(
    () =>
      rows.some(
        (row) =>
          row.startDate !== row.savedStartDate ||
          row.durationWorkingDays !== row.savedDurationWorkingDays
      ),
    [rows]
  );

  const updateRow = (
    milestoneId: string,
    field: "startDate" | "durationWorkingDays",
    value: string
  ) => {
    setMessage("");
    setError("");
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.milestoneId === milestoneId ? { ...row, [field]: value } : row
      )
    );
  };

  const save = async () => {
    if (!isValid) {
      const missingNames = invalidRows.map((r) => r.name).join(", ");
      setError(`Please complete start date and working days duration for: ${missingNames}.`);
      return;
    }

    setError("");
    setMessage("");
    try {
      await saveTimeline.mutateAsync(
        rows.map((row) => ({
          milestoneId: row.milestoneId,
          startDate: row.startDate,
          durationWorkingDays: Number(row.durationWorkingDays),
        }))
      );
      setMessage("Project timeline saved successfully. Calculated due dates updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save timeline.");
    }
  };

  if (!workflowMode) {
    return (
      <Card className="border-destructive/40 bg-destructive/5 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold tracking-tight">Project Timeline Setup</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-destructive">Unable to determine the project workflow model. Timeline edits are unavailable.</p>
        </CardContent>
      </Card>
    );
  }

  if (!rows.length) return null;

  return (
    <Card className="border-border/60 bg-card/70 shadow-sm">
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-2">
            <CardTitle className="text-base font-semibold tracking-tight">Project Timeline Setup</CardTitle>
            <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
              <CardDescription className="text-xs leading-relaxed">
                Specify start dates and durations in working days for all executable milestones
              </CardDescription>
            </div>
          </div>
        </div>
        {canEdit && (
          <Button
            size="sm"
            className="h-9 self-start gap-1.5 rounded-lg shadow-sm sm:self-auto"
            onClick={() => void save()}
            disabled={!isValid || saveTimeline.isPending || !hasUnsavedChanges}
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saveTimeline.isPending ? "Saving..." : "Save Timeline"}</span>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden">
          <div className="space-y-2 text-sm">
            <div className="hidden grid-cols-[50px_minmax(180px,1.8fr)_90px_150px_110px_150px] gap-3 border-b border-border/60 px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:grid">
              <span>Step</span>
              <span>Milestone</span>
              <span>Role</span>
              <span>Start Date</span>
              <span>Duration</span>
              <span>Calculated Due Date</span>
            </div>
            {rows.map((row) => {
              const isRowIncomplete =
                !row.startDate ||
                !Number.isInteger(Number(row.durationWorkingDays)) ||
                Number(row.durationWorkingDays) <= 0;
              const changed =
                row.startDate !== row.savedStartDate ||
                row.durationWorkingDays !== row.savedDurationWorkingDays;

              return (
                <div
                  key={row.milestoneId}
                  className={`grid grid-cols-1 gap-3 rounded-xl border p-3 transition-colors duration-200 xl:grid-cols-[50px_minmax(180px,1.8fr)_90px_150px_110px_150px] xl:items-center xl:px-3 xl:py-3 ${
                    isRowIncomplete && canEdit
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border/40 bg-muted/10 hover:border-primary/25"
                  }`}
                >
                  <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:hidden">Step</span>
                    {String(row.stepOrder).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <span className="truncate text-sm font-semibold tracking-tight text-foreground" title={row.name}>
                      {row.name}
                    </span>
                    {isRowIncomplete && canEdit && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-destructive">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span>Missing start date or duration</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 xl:block">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:hidden">Role</span>
                    <span className="inline-flex rounded-md bg-muted/50 px-2 py-1 font-mono text-xs text-foreground">{row.role}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:hidden">Start Date</span>
                    {canEdit ? (
                      <Input
                        type="date"
                        className="h-9 rounded-lg border-input bg-background/50 text-xs"
                        value={row.startDate}
                        onChange={(event) => updateRow(row.milestoneId, "startDate", event.target.value)}
                      />
                    ) : (
                      <span className="flex h-9 items-center rounded-lg border border-input bg-muted/20 px-3 font-mono text-xs text-foreground">{formatDate(row.startDate)}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:hidden">Duration</span>
                    {canEdit ? (
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        className="h-9 rounded-lg border-input bg-background/50 text-xs"
                        placeholder="Days"
                        value={row.durationWorkingDays}
                        onChange={(event) => updateRow(row.milestoneId, "durationWorkingDays", event.target.value)}
                      />
                    ) : (
                      <span className="flex h-9 items-center rounded-lg border border-input bg-muted/20 px-3 font-mono text-xs text-foreground">{row.durationWorkingDays || "-"} days</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:hidden">Calculated Due Date</span>
                    <span
                      className={`flex h-9 items-center rounded-lg border border-border/40 bg-muted/20 px-3 font-mono text-xs ${
                        changed ? "italic text-amber-400" : "font-semibold text-foreground"
                      }`}
                    >
                      {changed ? "Save to calculate" : formatDate(row.dueDate)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive shadow-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-400 shadow-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
}
