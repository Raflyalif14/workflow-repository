"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { formatActivityDescription } from "@/lib/activity-timeline";
import { formatDashboardActivityLabel, formatDashboardTimestamp } from "@/lib/dashboard-ux";
import { formatActorRoleLabel } from "@/lib/workflow-ux-helpers";
import { useDashboardActivity } from "@/hooks/use-dashboard";
import { getAuthSession } from "@/lib/auth";
import { ActivityFilters } from "./activity-filters";
import { buildActivityFilters, EMPTY_ACTIVITY_FILTERS, type ActivityFilterDraft } from "@/lib/dashboard-activity-filters";
import type { TranslationKey } from "@/i18n";
import type { DashboardActivityFilters, DashboardActivityPagination, RecentActivity } from "@/types/dashboard";

export function RecentActivityPanel({ activities: firstActivities, pagination: firstPagination, scopeKey: accountKey, loading: firstLoading, refreshing = false, hasError: firstError, onRetry: retryFirstPage }: {
  activities: RecentActivity[];
  scopeKey: string;
  pagination?: DashboardActivityPagination;
  refreshing?: boolean;
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
}) {
  const { t } = useLanguage();
  const scopeKey = `${accountKey}:${getAuthSession()?.id || "none"}`;
  const [history, setHistory] = useState<{ scopeKey: string; page: number; filters: DashboardActivityFilters }>({ scopeKey, page: 1, filters: {} });
  const requestedPage = history.scopeKey === scopeKey ? history.page : 1;
  const filters = history.scopeKey === scopeKey ? history.filters : {};
  const [draft, setDraft] = useState<ActivityFilterDraft>(EMPTY_ACTIVITY_FILTERS);
  const [filterError, setFilterError] = useState<TranslationKey | undefined>();
  const activeCount = Number(Boolean(filters.projectId)) + Number(Boolean(filters.kind)) + Number(Boolean(filters.from || filters.to));
  const useOverview = requestedPage === 1 && activeCount === 0;
  const [pageInput, setPageInput] = useState("1");
  const query = useDashboardActivity(useOverview ? null : requestedPage, true, filters);
  const pagination = useOverview ? firstPagination : query.data;
  const page = pagination?.page ?? requestedPage;
  const totalPages = pagination?.totalPages ?? (activeCount === 0 ? firstPagination?.totalPages : undefined);
  const activities = query.canRead ? (useOverview ? firstActivities : query.data?.items || []) : [];
  const nextCursor = pagination?.nextCursor;
  const loading = query.isAccessLoading || (useOverview ? firstLoading : query.isPending);
  const hasError = useOverview ? firstError : query.isError;
  const pending = query.isAccessLoading || (useOverview ? firstLoading || refreshing : query.isFetching);
  const targetPage = Number(pageInput);
  const canJump = Boolean(query.canRead && !pending && !hasError && pageInput.trim() && totalPages
    && Number.isSafeInteger(targetPage) && targetPage >= 1 && targetPage <= totalPages && targetPage !== page);
  const onRetry = () => {
    if (!query.canRead) return;
    if (useOverview) retryFirstPage();
    else void query.refetch();
  };
  const previous = () => {
    if (query.canRead && !pending && page > 1) setHistory({ scopeKey, page: page - 1, filters });
  };
  const next = () => {
    if (query.canRead && !pending && !hasError && nextCursor) setHistory({ scopeKey, page: page + 1, filters });
  };
  const resetFilters = () => {
    setDraft(EMPTY_ACTIVITY_FILTERS); setFilterError(undefined);
    setHistory({ scopeKey, page: 1, filters: {} });
  };
  useEffect(() => {
    if (history.scopeKey !== scopeKey) {
      setHistory({ scopeKey, page: 1, filters: {} }); setDraft(EMPTY_ACTIVITY_FILTERS); setFilterError(undefined);
    }
  }, [scopeKey, history.scopeKey]);
  useEffect(() => { setPageInput(String(page)); }, [page, scopeKey]);

  return (
    <section aria-labelledby="recent-activity-heading" className="dashboard-surface overflow-hidden">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h2 id="recent-activity-heading" className="text-base font-semibold text-foreground">{t("copy.recentActivity")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("dashboardPage.recentActivityScope")}</p>
      </div>

      <ActivityFilters draft={draft} projects={query.canRead ? firstPagination?.projects ?? query.data?.projects ?? [] : []}
        disabled={!query.canRead || query.isAccessLoading} pending={pending} activeCount={activeCount} error={filterError}
        onChange={value => { setDraft(value); setFilterError(undefined); }}
        onApply={() => {
          if (!query.canRead || pending) return;
          const result = buildActivityFilters(draft);
          setFilterError(result.error);
          if (result.filters) setHistory({ scopeKey, page: 1, filters: result.filters });
        }} onReset={resetFilters} />
      {!pending && !hasError && query.canRead && pagination && <p aria-live="polite" className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground sm:px-5">{t("activityFilters.results", { count: pagination.total })}</p>}

      {loading && !hasError && activities.length === 0 ? (
        <div role="status" className="space-y-3 p-4 sm:p-5" aria-label={t("dashboardPage.loadingActivity")}>
          {[0, 1, 2].map(item => <div key={item} className="h-14 animate-pulse rounded bg-muted" />)}
        </div>
      ) : activities.length > 0 ? (
        <>
          {hasError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm text-muted-foreground sm:px-5">
            <p>{t("ui.activityLoadFailed")}</p>
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t("common.retry")}</Button>
          </div>}
          <div id="dashboard-recent-activity-list" className="divide-y divide-border" aria-live="polite">
            {activities.map(activity => {
              const timestamp = formatDashboardTimestamp(activity.createdAt);
              const content = (
                <div className="grid min-w-0 gap-2 px-4 py-3 sm:px-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_auto] xl:items-center xl:gap-4">
                  <p className="break-words text-sm font-medium text-foreground">{formatDashboardActivityLabel(activity.action)}</p>
                  <div className="min-w-0">
                    <p className="break-words text-sm text-foreground">{activity.project?.name || t("copy.projectUnavailable")}</p>
                    <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{formatActivityDescription(activity.action, activity.details)}</p>
                  </div>
                  <p className="min-w-0 break-words text-xs text-muted-foreground">
                    {[activity.user.fullName, formatActorRoleLabel(activity.user.role)].filter(Boolean).join(" - ")}
                  </p>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-xs text-muted-foreground">{timestamp || t("common.notAvailable")}</span>
                    {activity.project && <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </div>
                </div>
              );
              return activity.project ? (
                <Link key={activity.id} href={"/projects/" + activity.project.id} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  {content}
                </Link>
              ) : <div key={activity.id}>{content}</div>;
            })}
          </div>

        </>
      ) : hasError ? (
        <div role="alert" className="space-y-3 px-4 py-5 text-sm text-muted-foreground sm:px-5">
          <p>{t("ui.activityLoadFailed")}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t("common.retry")}</Button>
        </div>
      ) : activeCount > 0 ? <div className="space-y-2 px-4 py-8 text-center sm:px-5">
        <p className="text-sm font-medium text-foreground">{t("activityFilters.noMatches")}</p>
        <p className="text-sm text-muted-foreground">{t("activityFilters.noMatchesHint")}</p>
        <Button type="button" variant="outline" size="sm" onClick={resetFilters}>{t("activityFilters.reset")}</Button>
      </div> : <div className="px-4 py-5 text-sm text-muted-foreground sm:px-5">{t("copy.noRecentActivity")}</div>}
      {(activities.length > 0 || page > 1) && <nav aria-label={t("dashboardPage.activityPagination")} className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm sm:px-5">
        <span className="text-muted-foreground" aria-live="polite">{totalPages ? t("dashboardPage.activityPageOf", { page, total: totalPages }) : t("dashboardPage.activityPage", { page })}</span>
        <div className="flex flex-wrap items-center gap-3">
          <form className="flex items-center gap-2" onSubmit={event => {
            event.preventDefault();
            if (canJump) setHistory({ scopeKey, page: targetPage, filters });
          }}>
            <label htmlFor="recent-activity-page" className="text-xs text-muted-foreground">{t("dashboardPage.activityGoTo")}</label>
            <input id="recent-activity-page" type="number" inputMode="numeric" min={1} max={totalPages} step={1}
              value={pageInput} onChange={event => setPageInput(event.target.value)} disabled={pending || hasError || !query.canRead || !totalPages}
              className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
            <Button type="submit" size="sm" variant="outline" aria-controls="dashboard-recent-activity-list" disabled={!canJump}>{t("dashboardPage.activityGo")}</Button>
          </form>
          <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" aria-controls="dashboard-recent-activity-list" disabled={pending || page <= 1} onClick={previous}>{t("dashboardPage.activityPrevious")}</Button>
          <Button type="button" size="sm" variant="outline" aria-controls="dashboard-recent-activity-list" disabled={pending || hasError || !nextCursor} onClick={next}>{t("common.next")}</Button>
          </div>
        </div>
      </nav>}

    </section>
  );
}
