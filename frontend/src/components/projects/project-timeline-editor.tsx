"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const isValid = useMemo(
    () =>
      rows.length > 0 &&
      rows.every(
        (row) =>
          Boolean(row.startDate) &&
          Number.isInteger(Number(row.durationWorkingDays)) &&
          Number(row.durationWorkingDays) > 0
      ),
    [rows]
  );

  const updateRow = (milestoneId: string, field: "startDate" | "durationWorkingDays", value: string) => {
    setMessage("");
    setError("");
    setRows((currentRows) => currentRows.map((row) => row.milestoneId === milestoneId ? { ...row, [field]: value } : row));
  };

  const save = async () => {
    if (!isValid) {
      setError("Every executable milestone needs a start date and a positive working-day duration.");
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
      setMessage("Timeline saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save timeline.");
    }
  };

  if (!rows.length) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Project Timeline</CardTitle>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1.5" onClick={() => void save()} disabled={!isValid || saveTimeline.isPending}>
            <Save className="h-3.5 w-3.5" />
            {saveTimeline.isPending ? "Saving..." : "Save Timeline"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 overflow-x-auto">
        <div className="min-w-[760px] divide-y divide-border/50 text-sm">
          <div className="grid grid-cols-[54px_minmax(180px,1.8fr)_92px_150px_118px_150px] gap-3 px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Step</span>
            <span>Milestone</span>
            <span>Role</span>
            <span>Start Date</span>
            <span>Duration</span>
            <span>Calculated Due Date</span>
          </div>
          {rows.map((row) => {
            const changed = row.startDate !== row.savedStartDate || row.durationWorkingDays !== row.savedDurationWorkingDays;
            return (
              <div key={row.milestoneId} className="grid grid-cols-[54px_minmax(180px,1.8fr)_92px_150px_118px_150px] items-center gap-3 py-3">
                <span className="font-mono text-xs text-muted-foreground">{String(row.stepOrder).padStart(2, "0")}</span>
                <span className="min-w-0 truncate font-medium" title={row.name}>{row.name}</span>
                <span className="text-xs text-muted-foreground">{row.role}</span>
                {canEdit ? (
                  <Input type="date" value={row.startDate} onChange={(event) => updateRow(row.milestoneId, "startDate", event.target.value)} />
                ) : (
                  <span>{formatDate(row.startDate)}</span>
                )}
                {canEdit ? (
                  <Input type="number" min="1" step="1" value={row.durationWorkingDays} onChange={(event) => updateRow(row.milestoneId, "durationWorkingDays", event.target.value)} />
                ) : (
                  <span>{row.durationWorkingDays || "-"}</span>
                )}
                <span className={changed ? "text-muted-foreground" : "font-medium"}>{changed ? "Save to calculate" : formatDate(row.dueDate)}</span>
              </div>
            );
          })}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-emerald-500">{message}</p>}
      </CardContent>
    </Card>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
}
