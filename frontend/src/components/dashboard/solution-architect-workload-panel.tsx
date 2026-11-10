"use client";

import { Fragment, useState } from "react";
import { AlertCircle, AlertTriangle, Calendar, ChevronDown, Clock, FolderKanban, ListTodo } from "lucide-react";
import { WorkloadDetails } from "./workload-details";
import { translate as translateI18n } from "@/i18n";
import { formatDashboardDeadline } from "@/lib/dashboard-ux";
import type { DashboardSaWorkload } from "@/types/dashboard";

export function SolutionArchitectWorkloadPanel({
  workload,
  loading,
  hasError,
  personal = false,
}: {
  workload: DashboardSaWorkload[];
  loading: boolean;
  hasError: boolean;
  personal?: boolean;
}) {
  const [expandedSa, setExpandedSa] = useState<string | null>(null);
  const toggle = (id: string) => setExpandedSa(current => current === id ? null : id);
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
        <h2 id="sa-workload-heading" className="text-base font-semibold text-foreground">{translateI18n(personal ? "roleDashboard.myWork" : "copy.saWorkload")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{translateI18n(personal ? "roleDashboard.myWorkHelp" : "workflowUpdate.workloadHelp")}</p>
      </div>

      {loading && workload.length === 0 ? (
        <div className="space-y-3 p-5" aria-label={translateI18n("dashboardPage.loadingWorkload")}>
          {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded bg-muted" />)}
        </div>
      ) : hasError && workload.length === 0 ? (
        <div className="px-5 py-8 text-sm text-muted-foreground">{translateI18n("ui.workloadLoadFailed")}</div>
      ) : workload.length === 0 ? (
        <div className="px-5 py-8 text-sm text-muted-foreground">{translateI18n(personal ? "workloadDetail.empty" : "copy.noActiveSa")}</div>
      ) : (
        <>
          {everyoneIdle && <p className="border-b border-border bg-muted/30 px-5 py-3 text-sm text-muted-foreground">{translateI18n(personal ? "copy.noActiveWork" : "copy.noSaWork")}</p>}

          {personal ? (
            <div className="space-y-5 p-5">
              {workload.map((item) => {
                const deadline = formatDashboardDeadline(item.nearestDeadline);
                const isExpanded = expandedSa === item.saId;
                return (
                  <div key={item.saId} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-3.5 transition-all hover:border-primary/30 hover:bg-muted/30">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="text-xs font-medium">{translateI18n("copy.activeProjects")}</span>
                          <FolderKanban className="h-4 w-4 text-primary" aria-hidden="true" />
                        </div>
                        <div className="mt-2">
                          <span className="text-2xl font-bold tracking-tight text-foreground">{item.activeProjectCount}</span>
                          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{translateI18n("roleDashboard.activeProjectsHelp")}</p>
                        </div>
                      </div>

                      <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-3.5 transition-all hover:border-primary/30 hover:bg-muted/30">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="text-xs font-medium">{translateI18n("copy.activeWork")}</span>
                          <ListTodo className="h-4 w-4 text-primary" aria-hidden="true" />
                        </div>
                        <div className="mt-2">
                          <span className="text-2xl font-bold tracking-tight text-foreground">{item.activeMilestoneCount}</span>
                          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{translateI18n("roleDashboard.activeWorkHelp")}</p>
                        </div>
                      </div>

                      <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-3.5 transition-all hover:border-primary/30 hover:bg-muted/30">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="text-xs font-medium">{translateI18n("copy.nearestDeadline")}</span>
                          <Calendar className="h-4 w-4 text-primary" aria-hidden="true" />
                        </div>
                        <div className="mt-2">
                          <span className="text-sm font-semibold tracking-tight text-foreground sm:text-base">{deadline || translateI18n("dashboardPage.noDeadline")}</span>
                          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{translateI18n("roleDashboard.nearestDeadlineHelp")}</p>
                        </div>
                      </div>

                      <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-3.5 transition-all hover:border-primary/30 hover:bg-muted/30">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="text-xs font-medium">{translateI18n("copy.waitingReview")}</span>
                          <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </div>
                        <div className="mt-2">
                          <span className="text-2xl font-bold tracking-tight text-foreground">{item.waitingReviewCount}</span>
                          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{translateI18n("roleDashboard.waitingReviewHelp")}</p>
                        </div>
                      </div>

                      <div className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                        item.revisionCount > 0 ? "border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)]" : "border-border/70 bg-card hover:bg-muted/30"
                      }`}>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="text-xs font-medium">{translateI18n("copy.revision")}</span>
                          <AlertCircle className={`h-4 w-4 ${item.revisionCount > 0 ? "text-[hsl(var(--warning))]" : "text-muted-foreground"}`} aria-hidden="true" />
                        </div>
                        <div className="mt-2">
                          <span className={`text-2xl font-bold tracking-tight ${item.revisionCount > 0 ? "text-[hsl(var(--warning))]" : "text-foreground"}`}>
                            {item.revisionCount}
                          </span>
                          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{translateI18n("roleDashboard.revisionHelp")}</p>
                        </div>
                      </div>

                      <div className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                        item.overdueCount > 0 ? "border-destructive/40 bg-destructive/5" : "border-border/70 bg-card hover:bg-muted/30"
                      }`}>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="text-xs font-medium">{translateI18n("copy.overdue")}</span>
                          <AlertTriangle className={`h-4 w-4 ${item.overdueCount > 0 ? "text-destructive" : "text-muted-foreground"}`} aria-hidden="true" />
                        </div>
                        <div className="mt-2">
                          <span className={`text-2xl font-bold tracking-tight ${item.overdueCount > 0 ? "text-destructive" : "text-foreground"}`}>
                            {item.overdueCount}
                          </span>
                          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{translateI18n("roleDashboard.overdueHelp")}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/20">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`workload-mobile-${item.saId}`}
                        onClick={() => toggle(item.saId)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
                      >
                        <div className="flex items-center gap-2.5">
                          <ListTodo className="h-4 w-4 text-primary" aria-hidden="true" />
                          <span className="text-sm font-semibold text-foreground">{item.saName}</span>
                          {item.workItems && item.workItems.length > 0 && (
                            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                              {item.workItems.length} {translateI18n("roleDashboard.myWork").toLowerCase()}
                            </span>
                          )}
                        </div>
                        <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                          {translateI18n(isExpanded ? "workloadDetail.hide" : "workloadDetail.show")}
                          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                        </span>
                      </button>
                      {isExpanded && (
                        <div id={`workload-mobile-${item.saId}`} className="border-t border-border p-4">
                          <WorkloadDetails item={item} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
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
                        <Fragment key={item.saId}><tr onClick={() => toggle(item.saId)} className="cursor-pointer transition-colors hover:bg-muted/40">
                          <td className="px-5 py-4 font-medium text-foreground"><button type="button" aria-expanded={expandedSa === item.saId} aria-controls={`workload-desktop-${item.saId}`} onClick={(event) => { event.stopPropagation(); toggle(item.saId); }} className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <span className="block">{item.saName}</span><span className="mt-1 flex items-center gap-1 text-xs text-primary">{translateI18n(expandedSa === item.saId ? "workloadDetail.hide" : "workloadDetail.show")}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedSa === item.saId ? "rotate-180" : ""}`} /></span>
                          </button></td>
                          <td className="px-3 py-4 text-center text-foreground">{item.activeProjectCount}</td>
                          <td className="px-3 py-4 text-center text-foreground">{item.activeMilestoneCount || <span className="text-muted-foreground">{translateI18n("copy.noActiveWork")}</span>}</td>
                          <td className="px-3 py-4 text-muted-foreground">{deadline || translateI18n("dashboardPage.noDeadline")}</td>
                          <td className="px-3 py-4 text-center"><span className={item.revisionCount > 0 ? "font-medium text-[hsl(var(--warning))]" : "text-muted-foreground"}>{item.revisionCount}</span></td>
                          <td className="px-3 py-4 text-center text-muted-foreground">{item.waitingReviewCount}</td>
                          <td className="px-5 py-4 text-center"><span className={item.overdueCount > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}>{item.overdueCount}</span></td>
                        </tr>
                        {expandedSa === item.saId && <tr><td colSpan={7} className="bg-muted/20 p-4"><div id={`workload-desktop-${item.saId}`}><WorkloadDetails item={item} /></div></td></tr>}
                        </Fragment>
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
                      <button type="button" aria-expanded={expandedSa === item.saId} aria-controls={`workload-mobile-${item.saId}`} onClick={() => toggle(item.saId)} className="flex w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring"><span className="font-medium text-foreground">{item.saName}</span><span className="text-xs text-primary">{translateI18n(expandedSa === item.saId ? "workloadDetail.hide" : "workloadDetail.show")}</span></button>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.activeProjects")}</dt><dd className="mt-1 text-foreground">{item.activeProjectCount}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.activeWork")}</dt><dd className="mt-1 text-foreground">{item.activeMilestoneCount}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.nearestDeadline")}</dt><dd className="mt-1 text-foreground">{deadline || translateI18n("dashboardPage.noDeadline")}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.waitingReview")}</dt><dd className="mt-1 text-foreground">{item.waitingReviewCount}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.revision")}</dt><dd className={item.revisionCount > 0 ? "mt-1 font-medium text-[hsl(var(--warning))]" : "mt-1 text-foreground"}>{item.revisionCount}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">{translateI18n("copy.overdue")}</dt><dd className={item.overdueCount > 0 ? "mt-1 font-semibold text-destructive" : "mt-1 text-foreground"}>{item.overdueCount}</dd></div>
                      </dl>
                      {expandedSa === item.saId && <div id={`workload-mobile-${item.saId}`}><WorkloadDetails item={item} /></div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
