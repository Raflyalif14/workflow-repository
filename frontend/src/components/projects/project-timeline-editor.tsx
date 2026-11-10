"use client";
import { toDraftRows, type TimelineDraftRow } from "@/lib/output-timeline";
import { BusinessConfirmation } from "./business-confirmation";

import { translate as translateI18n, translateStoredError, translateStoredMessage, getIntlLocale } from "@/i18n";
import { useLanguage } from "@/components/i18n/language-provider";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Calendar, CalendarDays, CheckCircle2, Clock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSaveProjectTimeline } from "@/hooks/use-projects";
import { useOutputDocuments } from "@/hooks/use-output-documents";
import {
  resolveTimelineWorkflowMode,
} from "@/lib/workflow-ux-helpers";
import { ProjectMilestonePhase4 } from "@/types/project";

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
  useLanguage();
  const workflowMode = resolveTimelineWorkflowMode(workflowModel, workflowVersion);
  const saveTimeline = useSaveProjectTimeline(projectId);
  const output = useOutputDocuments(projectId);
  const outputDocs = useMemo(() => output.data?.documents || [], [output.data?.documents]);
  const [rows, setRows] = useState<TimelineDraftRow[]>(() =>
    toDraftRows(milestones, output.data?.documents || [], workflowModel, workflowVersion)
  );
  const [confirming, setConfirming] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [missingNames, setMissingNames] = useState("");
  const phaseIdentity = `${projectId}/${milestones[0]?.phase_id || "legacy"}`;
  const previousPhase = useRef(phaseIdentity);
  useEffect(() => { if (previousPhase.current !== phaseIdentity) { previousPhase.current = phaseIdentity; setDirty(false); setConfirming(false); setError(""); } }, [phaseIdentity]);

  useEffect(() => {
    if (!dirty) {
      const nextRows = toDraftRows(milestones, outputDocs, workflowModel, workflowVersion);
      setRows((prev) => {
        if (
          prev.length === nextRows.length &&
          prev.every(
            (r, i) =>
              r.rowId === nextRows[i]?.rowId &&
              r.startDate === nextRows[i]?.startDate &&
              r.durationWorkingDays === nextRows[i]?.durationWorkingDays &&
              r.dueDate === nextRows[i]?.dueDate &&
              r.name === nextRows[i]?.name
          )
        ) {
          return prev;
        }
        return nextRows;
      });
    }
  }, [milestones, outputDocs, workflowModel, workflowVersion, dirty]);

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

  const isValid = rows.length > 0 && invalidRows.length === 0 && !output.isError && !output.isLoading;

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
    rowId: string,
    field: "startDate" | "durationWorkingDays",
    value: string
  ) => {
    saveTimeline.prepare?.();
    setDirty(true);
    setMessage("");
    setError("");
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.rowId === rowId ? { ...row, [field]: value } : row
      )
    );
  };

  const save = async () => {
    if (!isValid) {
      const missingNames = invalidRows.map((r) => r.name).join(", ");
      setMissingNames(missingNames);
      setError("projectAction.timelineIncomplete");
      return;
    }

    setError("");
    setMessage("");

    try {
      await saveTimeline.mutateAsync(rows.map(row => ({
        milestoneId: row.milestoneId,
        ...(row.outputDocumentId ? { outputDocumentId: row.outputDocumentId } : {}),
        startDate: row.startDate,
        durationWorkingDays: Number(row.durationWorkingDays),
      })));
      setMessage("projectAction.timelineSaved");
      setDirty(false);
    } catch (saveError) {
      setError("projectAction.timelineSaveFailed");
      throw saveError;
    }
  };

  if (!workflowMode) {
    return (
      <Card className="border-destructive/40 bg-destructive/5 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold tracking-tight">{translateI18n("copy.timelineSetup")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-destructive">{translateI18n("copy.workflowUnknown")}</p>
        </CardContent>
      </Card>
    );
  }

  if (output.isLoading && !outputDocs.length) {
    return (
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold tracking-tight">{translateI18n("copy.timelineSetup")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-10 w-full animate-pulse rounded-lg bg-muted/40" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-muted/40" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-muted/40" />
        </CardContent>
      </Card>
    );
  }

  if (output.isError) return (
    <Card><CardContent className="py-4 text-sm text-destructive">
      {translateI18n("projectAction.timelineSaveFailed")}
      <Button variant="outline" className="ml-3" onClick={() => output.refetch()}>{translateI18n("common.retry")}</Button>
    </CardContent></Card>
  );
  if (!rows.length) return null;

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-2">
            <CardTitle className="text-base font-semibold tracking-tight">{translateI18n("copy.timelineSetup")}</CardTitle>
            <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
              <CardDescription className="text-xs leading-relaxed">
                {translateI18n("projectAction.timelineHelp")}
              </CardDescription>
            </div>
          </div>
        </div>
        {canEdit && (
          <Button
            size="sm"
            className="h-9 self-start gap-1.5 rounded-lg shadow-sm sm:self-auto"
            onClick={() => setConfirming(true)}
            disabled={!isValid || saveTimeline.isPending || !hasUnsavedChanges}
          >
            <Save className="h-3.5 w-3.5" />
            <span>{translateI18n(saveTimeline.isPending ? "common.saving" : "projectAction.saveTimeline")}</span>
          </Button>
        )}
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <div className="max-w-full overflow-x-auto">
          <div className="min-w-0 space-y-2 text-sm xl:min-w-[652px]">
            <div className="hidden grid-cols-[72px_minmax(140px,1.6fr)_70px_minmax(116px,1fr)_92px_minmax(126px,1fr)] gap-2 border-b border-border/60 px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:grid">
              <span>{translateI18n("copy.step")}</span>
              <span>{translateI18n("nav.milestones")}</span>
              <span>{translateI18n("copy.role")}</span>
              <span>{translateI18n("copy.startDate")}</span>
              <span>{translateI18n("copy.duration")}</span>
              <span>{translateI18n("copy.calculatedDue")}</span>
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
                  key={row.rowId}
                  className={`grid grid-cols-1 gap-3 rounded-xl border p-3 transition-colors duration-200 xl:grid-cols-[72px_minmax(140px,1.6fr)_70px_minmax(116px,1fr)_92px_minmax(126px,1fr)] xl:items-center xl:gap-2 xl:px-3 xl:py-3 ${
                    isRowIncomplete && canEdit
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border/40 bg-muted/10 hover:border-primary/25"
                  }`}
                >
                  <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:hidden">{translateI18n("copy.step")}</span>
                    {String(row.stepOrder).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="block truncate text-sm font-semibold tracking-tight text-foreground" title={row.name}>
                        {row.name}
                      </span>
                      {row.isRequired && (
                        <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                          {translateI18n("outputScope.required")}
                        </span>
                      )}
                    </div>
                    {isRowIncomplete && canEdit && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-destructive">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span>{translateI18n("copy.missingTimeline")}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 xl:block">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:hidden">{translateI18n("copy.role")}</span>
                    <span className="inline-flex rounded-md bg-muted/50 px-2 py-1 font-mono text-xs text-foreground">{row.role}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:hidden">{translateI18n("copy.startDate")}</span>
                    {canEdit ? (
                      <Input
                        type="date"
                        className="h-9 rounded-lg border-input bg-background/50 text-xs"
                        value={row.startDate}
                        onChange={(event) => updateRow(row.rowId, "startDate", event.target.value)}
                      />
                    ) : (
                      <span className="flex h-9 items-center rounded-lg border border-input bg-muted/20 px-3 font-mono text-xs text-foreground">{formatDate(row.startDate)}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:hidden">{translateI18n("copy.duration")}</span>
                    {canEdit ? (
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        className="h-9 rounded-lg border-input bg-background/50 text-xs"
                        placeholder={translateI18n("copy.duration")}
                        value={row.durationWorkingDays}
                        onChange={(event) => updateRow(row.rowId, "durationWorkingDays", event.target.value)}
                      />
                    ) : (
                      <span className="flex h-9 items-center rounded-lg border border-input bg-muted/20 px-3 font-mono text-xs text-foreground">{translateI18n("projectDetail.workingDays", { count: row.durationWorkingDays || "-" })}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:hidden">{translateI18n("copy.calculatedDue")}</span>
                    <span
                      className={`flex h-9 items-center rounded-lg border border-border/40 bg-muted/20 px-3 font-mono text-xs ${
                        changed ? "italic text-warning" : "font-semibold text-foreground"
                      }`}
                    >
                      {changed ? translateI18n("projectAction.saveTimeline") : formatDate(row.dueDate)}
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
            <span>{error === "projectAction.timelineIncomplete" ? translateI18n("projectAction.timelineIncomplete", { names: missingNames }) : translateStoredError(error)}</span>
          </div>
        )}
        {message && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-success shadow-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{translateStoredMessage(message)}</span>
          </div>
        )}
        <BusinessConfirmation
          open={confirming}
          onOpenChange={setConfirming}
          title={translateI18n("copy.timelineSetup")}
          action={translateI18n("businessAudit.save")}
          onConfirm={save}
          changes={rows
            .filter((row) => row.startDate !== row.savedStartDate || row.durationWorkingDays !== row.savedDurationWorkingDays)
            .map(
              (row) =>
                `${row.name} (${row.role}): ${row.savedStartDate ? formatDate(row.savedStartDate) : translateI18n("businessAudit.notSet")} / ${row.savedDurationWorkingDays ? `${row.savedDurationWorkingDays} ${translateI18n("businessAuditFields.duration_working_days").toLowerCase()}` : translateI18n("businessAudit.notSet")} → ${formatDate(row.startDate)} / ${row.durationWorkingDays} ${translateI18n("businessAuditFields.duration_working_days").toLowerCase()}`
            )}
        >
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <CalendarDays className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <p className="leading-relaxed">{translateI18n("businessAudit.timeline")}</p>
            </div>

            <div className="space-y-2.5">
              {rows
                .filter((row) => row.startDate !== row.savedStartDate || row.durationWorkingDays !== row.savedDurationWorkingDays)
                .map((row) => {
                  const startDateChanged = row.startDate !== row.savedStartDate;
                  const durationChanged = row.durationWorkingDays !== row.savedDurationWorkingDays;
                  const oldStart = row.savedStartDate ? formatDate(row.savedStartDate) : translateI18n("businessAudit.notSet");
                  const newStart = row.startDate ? formatDate(row.startDate) : "-";
                  const oldDur = row.savedDurationWorkingDays
                    ? `${row.savedDurationWorkingDays} ${translateI18n("businessAuditFields.duration_working_days").toLowerCase()}`
                    : translateI18n("businessAudit.notSet");
                  const newDur = row.durationWorkingDays
                    ? `${row.durationWorkingDays} ${translateI18n("businessAuditFields.duration_working_days").toLowerCase()}`
                    : "-";

                  return (
                    <div
                      key={row.rowId}
                      className="rounded-xl border border-border bg-card p-3.5 shadow-xs space-y-2.5 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {row.stepOrder}
                          </span>
                          <span className="font-semibold text-foreground text-sm">
                            {row.name}
                          </span>
                          {row.isRequired && (
                            <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                              {translateI18n("outputScope.required")}
                            </span>
                          )}
                        </div>
                        <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                          {row.role}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-muted/40 p-2.5 border border-border/40">
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1.5">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{translateI18n("businessAuditFields.start_date")}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={startDateChanged && row.savedStartDate ? "line-through text-muted-foreground text-xs" : "text-muted-foreground text-xs"}>
                              {oldStart}
                            </span>
                            {startDateChanged && (
                              <>
                                <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                                <span className="font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs">
                                  {newStart}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg bg-muted/40 p-2.5 border border-border/40">
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{translateI18n("businessAuditFields.duration_working_days")}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={durationChanged && row.savedDurationWorkingDays ? "line-through text-muted-foreground text-xs" : "text-muted-foreground text-xs"}>
                              {oldDur}
                            </span>
                            {durationChanged && (
                              <>
                                <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                                <span className="font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs">
                                  {newDur}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </BusinessConfirmation>
      </CardContent>
    </Card>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(`${value.slice(0,10)}T00:00:00Z`).toLocaleDateString(getIntlLocale(), { dateStyle: "medium", timeZone: "UTC" });
}
