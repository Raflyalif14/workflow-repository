"use client";

import { CalendarDays, FolderKanban, ListFilter, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/i18n/language-provider";
import { ACTIVITY_KIND_LABELS, type ActivityFilterDraft } from "@/lib/dashboard-activity-filters";
import type { TranslationKey } from "@/i18n";

const control = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const label = "mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground";

export function ActivityFilters({ draft, projects, onChange, onApply, onReset, disabled, pending, activeCount, error }: {
  draft: ActivityFilterDraft;
  projects: Array<{ id: string; name: string }>;
  onChange: (draft: ActivityFilterDraft) => void;
  onApply: () => void;
  onReset: () => void;
  disabled: boolean;
  pending: boolean;
  activeCount: number;
  error?: TranslationKey;
}) {
  const { t } = useLanguage();
  const hasDraft = Boolean(draft.projectId || draft.kind || draft.period !== "all");
  return <form aria-label={t("activityFilters.title")} className="border-b border-border bg-muted/20 px-4 py-4 sm:px-5" onSubmit={event => { event.preventDefault(); onApply(); }}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="whitespace-nowrap">{t("activityFilters.heading")}</span>
        {activeCount > 0 && <span className="shrink-0 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{t("activityFilters.active", { count: activeCount })}</span>}
      </div>
      <Button type="button" size="sm" variant="ghost" disabled={disabled || !hasDraft && activeCount === 0} onClick={onReset} className="h-8 gap-1.5 px-2 text-xs text-muted-foreground">
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{t("activityFilters.reset")}
      </Button>
    </div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
      <div className="min-w-0">
        <label htmlFor="activity-project" className={label}><FolderKanban className="h-3.5 w-3.5" aria-hidden="true" />{t("activityFilters.project")}</label>
        <select id="activity-project" className={control} value={draft.projectId} disabled={disabled} onChange={event => onChange({ ...draft, projectId: event.target.value })}>
          <option value="">{t("activityFilters.allProjects")}</option>
          {[...projects].sort((a, b) => a.name.localeCompare(b.name)).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor="activity-kind" className={label}><ListFilter className="h-3.5 w-3.5" aria-hidden="true" />{t("activityFilters.kind")}</label>
        <select id="activity-kind" className={control} value={draft.kind} disabled={disabled} onChange={event => onChange({ ...draft, kind: event.target.value as ActivityFilterDraft["kind"] })}>
          <option value="">{t("activityFilters.allKinds")}</option>
          {Object.entries(ACTIVITY_KIND_LABELS).map(([key, text]) => <option key={key} value={key}>{t(text)}</option>)}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor="activity-period" className={label}><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{t("activityFilters.period")}</label>
        <select id="activity-period" className={control} value={draft.period} disabled={disabled} onChange={event => onChange({ ...draft, period: event.target.value as ActivityFilterDraft["period"] })}>
          <option value="all">{t("activityFilters.allDates")}</option>
          <option value="today">{t("activityFilters.today")}</option>
          <option value="last7">{t("activityFilters.last7")}</option>
          <option value="custom">{t("activityFilters.custom")}</option>
        </select>
      </div>
      {draft.period === "custom" && <div className="grid gap-3 sm:col-span-2 sm:max-w-xl sm:grid-cols-2 xl:col-span-3">
      <div><label htmlFor="activity-from" className={label}>{t("activityFilters.from")}</label>
        <input id="activity-from" type="date" required className={control} disabled={disabled} value={draft.from} onChange={event => onChange({ ...draft, from: event.target.value })} /></div>
      <div><label htmlFor="activity-to" className={label}>{t("activityFilters.to")}</label>
        <input id="activity-to" type="date" required className={control} disabled={disabled} value={draft.to} min={draft.from || undefined} onChange={event => onChange({ ...draft, to: event.target.value })} /></div>
      </div>}
      <Button type="submit" disabled={disabled || pending} className={`h-10 gap-2 rounded-lg sm:self-end ${draft.period === "custom" ? "sm:col-span-2 xl:col-span-1 xl:col-start-4 xl:row-start-2" : ""}`}><ListFilter className="h-4 w-4" aria-hidden="true" />{t("activityFilters.apply")}</Button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{t(error)}</p>}
  </form>;
}
