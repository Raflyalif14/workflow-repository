"use client";

import { translate as translateI18n } from "@/i18n";
import { formatDashboardDeadline } from "@/lib/dashboard-ux";
import type { DashboardSaWorkload } from "@/types/dashboard";

export function SolutionArchitectWorkloadPanel({
  workload,
  loading,
  hasError,
}: {
  workload: DashboardSaWorkload[];
  loading: boolean;
  hasError: boolean;
}) {
  const everyoneIdle = workload.length > 0 && workload.every((item) =>
    item.activeProjectCount === 0
    && item.activeMilestoneCount === 0
    && item.revisionCount === 0
    && item.waitingReviewCount === 0
    && item.overdueCount === 0
  );

  return (
    <section aria-labelledby="sa-workload-heading" className="dashboard-surface overflow-hidden">
      <div className="border-b border-border px-5 py-5">
        <h2 id="sa-workload-heading" className="text-base font-semibold text-foreground">{translateI18n("copy.saWorkload")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{translateI18n("copy.workloadDescription")}</p>
      </div>

      {loading && workload.length === 0 ? (
        <div className="space-y-3 p-5" aria-label={translateI18n("dashboardPage.loadingWorkload")}>
          {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded bg-muted" />)}
        </div>
      ) : hasError && workload.length === 0 ? (
        <div className="px-5 py-8 text-sm text-muted-foreground">{translateI18n("ui.workloadLoadFailed")}</div>
      ) : workload.length === 0 ? (
        <div className="px-5 py-8 text-sm text-muted-foreground">{translateI18n("copy.noActiveSa")}</div>
      ) : (
        <>
          {everyoneIdle && <p className="border-b border-border bg-muted/30 px-5 py-3 text-sm text-muted-foreground">{translateI18n("copy.noSaWork")}</p>}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">{translateI18n("role.SA")}</th>
                  <th className="px-3 py-3 text-center font-medium">{translateI18n("copy.activeProjects")}</th>
                  <th className="px-3 py-3 text-center font-medium">{translateI18n("copy.activeWork")}</th>
                  <th className="px-3 py-3 font-medium">{translateI18n("copy.nearestDeadline")}</th>
                  <th className="px-3 py-3 text-center font-medium">{translateI18n("copy.revision")}</th>
                  <th className="px-3 py-3 text-center font-medium">{translateI18n("copy.waitingReview")}</th>
                  <th className="px-5 py-3 text-center font-medium">{translateI18n("copy.overdue")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workload.map((item) => {
                  const deadline = formatDashboardDeadline(item.nearestDeadline);
                  return (
                    <tr key={item.saId}>
                      <td className="px-5 py-4 font-medium text-foreground">{item.saName}</td>
                      <td className="px-3 py-4 text-center text-foreground">{item.activeProjectCount}</td>
                      <td className="px-3 py-4 text-center text-foreground">{item.activeMilestoneCount || <span className="text-muted-foreground">{translateI18n("copy.noActiveWork")}</span>}</td>
                      <td className="px-3 py-4 text-muted-foreground">{deadline || translateI18n("dashboardPage.noDeadline")}</td>
                      <td className="px-3 py-4 text-center"><span className={item.revisionCount > 0 ? "font-medium text-[hsl(var(--warning))]" : "text-muted-foreground"}>{item.revisionCount}</span></td>
                      <td className="px-3 py-4 text-center text-muted-foreground">{item.waitingReviewCount}</td>
                      <td className="px-5 py-4 text-center"><span className={item.overdueCount > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}>{item.overdueCount}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-border lg:hidden">
            {workload.map((item) => {
              const deadline = formatDashboardDeadline(item.nearestDeadline);
              return (
                <div key={item.saId} className="space-y-3 px-5 py-4">
                  <p className="font-medium text-foreground">{item.saName}</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.activeProjects")}</dt><dd className="mt-1 text-foreground">{item.activeProjectCount}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.activeWork")}</dt><dd className="mt-1 text-foreground">{item.activeMilestoneCount || translateI18n("dashboardPage.noActiveWork")}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.nearestDeadline")}</dt><dd className="mt-1 text-foreground">{deadline || translateI18n("dashboardPage.noDeadline")}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.waitingReview")}</dt><dd className="mt-1 text-foreground">{item.waitingReviewCount}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.revision")}</dt><dd className={item.revisionCount > 0 ? "mt-1 font-medium text-[hsl(var(--warning))]" : "mt-1 text-foreground"}>{item.revisionCount}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.overdue")}</dt><dd className={item.overdueCount > 0 ? "mt-1 font-semibold text-destructive" : "mt-1 text-foreground"}>{item.overdueCount}</dd></div>
                  </dl>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
