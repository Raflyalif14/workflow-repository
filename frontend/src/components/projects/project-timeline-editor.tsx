"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSaveProjectTimeline } from "@/hooks/use-projects";
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

const toDraftRows = (milestones: ProjectMilestonePhase4[]): TimelineDraftRow[] =>
  milestones
    .filter((milestone) => milestone.step_order > 2)
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
}: {
  projectId: string;
  milestones: ProjectMilestonePhase4[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<TimelineDraftRow[]>(() => toDraftRows(milestones));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const saveTimeline = useSaveProjectTimeline(projectId);

  useEffect(() => {
    setRows(toDraftRows(milestones));
  }, [milestones]);

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

  if (!rows.length) return null;

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-bold">Project Timeline Setup</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Specify start dates and durations in working days for all executable milestones
          </CardDescription>
        </div>
        {canEdit && (
          <Button
            size="sm"
            className="gap-1.5 shadow-sm"
            onClick={() => void save()}
            disabled={!isValid || saveTimeline.isPending || !hasUnsavedChanges}
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saveTimeline.isPending ? "Saving..." : "Save Timeline"}</span>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <div className="min-w-[720px] divide-y divide-border/50 text-sm">
            <div className="grid grid-cols-[50px_minmax(180px,1.8fr)_90px_150px_110px_150px] gap-3 px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                  className={`grid grid-cols-[50px_minmax(180px,1.8fr)_90px_150px_110px_150px] items-center gap-3 py-2.5 px-2 rounded-md ${
                    isRowIncomplete && canEdit ? "bg-amber-500/5" : ""
                  }`}
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(row.stepOrder).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <span className="truncate font-medium text-foreground text-xs" title={row.name}>
                      {row.name}
                    </span>
                    {isRowIncomplete && canEdit && (
                      <p className="text-[10px] text-amber-400 font-medium">Missing start date or duration</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{row.role}</span>
                  {canEdit ? (
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={row.startDate}
                      onChange={(event) => updateRow(row.milestoneId, "startDate", event.target.value)}
                    />
                  ) : (
                    <span className="text-xs text-foreground font-mono">{formatDate(row.startDate)}</span>
                  )}
                  {canEdit ? (
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      className="h-8 text-xs"
                      placeholder="Days"
                      value={row.durationWorkingDays}
                      onChange={(event) => updateRow(row.milestoneId, "durationWorkingDays", event.target.value)}
                    />
                  ) : (
                    <span className="text-xs text-foreground font-mono">{row.durationWorkingDays || "-"} days</span>
                  )}
                  <span
                    className={`text-xs font-mono ${
                      changed ? "text-amber-400 italic" : "font-medium text-foreground"
                    }`}
                  >
                    {changed ? "Save to calculate" : formatDate(row.dueDate)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-400">
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
