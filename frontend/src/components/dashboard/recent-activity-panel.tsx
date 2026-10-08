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
import type { DashboardActivityPagination, RecentActivity } from "@/types/dashboard";

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
  const [history, setHistory] = useState<{ scopeKey: string; cursors: Array<string | null> }>({ scopeKey, cursors: [null] });
  const cursors = history.scopeKey === scopeKey ? history.cursors : [null];
  const cursor = cursors[cursors.length - 1];
  const query = useDashboardActivity(cursor);
  const page = cursors.length;
  const activities = query.canRead ? (page === 1 ? firstActivities : query.data?.items || []) : [];
  const nextCursor = page === 1 ? firstPagination?.nextCursor : query.data?.nextCursor;
  const loading = query.isAccessLoading || (page === 1 ? firstLoading : query.isPending);
  const hasError = page === 1 ? firstError : query.isError;
  const pending = query.isAccessLoading || (page === 1 ? firstLoading || refreshing : query.isFetching);
  const onRetry = () => {
    if (!query.canRead) return;
    if (page === 1) retryFirstPage();
    else void query.refetch();
  };
  const previous = () => {
    if (!pending && page > 1) setHistory({ scopeKey, cursors: cursors.slice(0, -1) });
  };
  const next = () => {
    if (!pending && !hasError && nextCursor) setHistory({ scopeKey, cursors: [...cursors, nextCursor] });
  };
  useEffect(() => {
    if (history.scopeKey !== scopeKey) setHistory({ scopeKey, cursors: [null] });
  }, [scopeKey, history.scopeKey]);

  return (
    <section aria-labelledby="recent-activity-heading" className="dashboard-surface overflow-hidden">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h2 id="recent-activity-heading" className="text-base font-semibold text-foreground">{t("copy.recentActivity")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("dashboardPage.recentActivityScope")}</p>
      </div>

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
      ) : <div className="px-4 py-5 text-sm text-muted-foreground sm:px-5">{t("copy.noRecentActivity")}</div>}
      {(activities.length > 0 || page > 1) && <nav aria-label={t("dashboardPage.activityPagination")} className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm sm:px-5">
        <span className="text-muted-foreground">{t("dashboardPage.activityPage", { page })}</span>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" aria-controls="dashboard-recent-activity-list" disabled={pending || page <= 1} onClick={previous}>{t("dashboardPage.activityPrevious")}</Button>
          <Button type="button" size="sm" variant="outline" aria-controls="dashboard-recent-activity-list" disabled={pending || hasError || !nextCursor} onClick={next}>{t("common.next")}</Button>
        </div>
      </nav>}

    </section>
  );
}
