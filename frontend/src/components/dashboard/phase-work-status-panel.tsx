"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatNumber, translate } from "@/i18n";
import { getWorkStatusDistribution, DEFAULT_WORK_STATUS_FILTER, type AllWorkStatus, type PhaseWorkStatus, type WorkStatusPhase } from "@/lib/dashboard-phase-status";

type Props = { summary?: PhaseWorkStatus | null; allSummary?: AllWorkStatus | null; loading: boolean; hasError: boolean; refreshing?: boolean; onRetry: () => void };

export function PhaseWorkStatusPanel({ summary, allSummary, loading, hasError, refreshing, onRetry }: Props) {
  // Query refresh and locale changes update props without replacing the selection.
  const [phase, setPhase] = useState<WorkStatusPhase>(DEFAULT_WORK_STATUS_FILTER);
  const distribution = getWorkStatusDistribution(allSummary, summary, phase);
  const message = distribution ? null : loading ? translate("dashboardPage.loadingHealth")
    : hasError ? translate("dashboardPage.workStatusError") : translate("dashboardPage.workStatusUnavailable");
  const data = distribution?.rows.map(row => ({ ...row, value: row.count })) || [];
  const totalLabel = translate(phase === "ALL" ? "dashboardPage.allProjectsTotal"
    : phase === "PRA_TENDER" ? "dashboardPage.praProjectsTotal" : "dashboardPage.tenderResultsTotal");
  const scopeLabel = translate(phase === "ALL" ? "dashboardPage.allWorkStatusScope"
    : phase === "PRA_TENDER" ? "dashboardPage.praWorkStatusScope" : "dashboardPage.tenderWorkStatusScope");

  return (
    <section aria-labelledby="delivery-health-heading" className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="min-w-0">
        <h2 id="delivery-health-heading" className="text-base font-semibold text-foreground">{translate("copy.workCondition")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{scopeLabel}</p>
      </div>
      <div role="group" aria-label={translate("dashboardPage.workStatusPhase")} className="mt-4 grid grid-cols-1 gap-1 sm:grid-cols-3 rounded-lg bg-muted p-1">
        {(["ALL", "PRA_TENDER", "ON_SUBMISSION_TENDER"] as const).map(key => (
          <button key={key} type="button" aria-pressed={phase === key} onClick={() => setPhase(key)}
            className={["min-w-0 rounded-md px-3 py-2 text-sm font-medium whitespace-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              phase === key ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"].join(" ")}>
            {translate(key === "ALL" ? "dashboardPage.allScenarios" : key === "PRA_TENDER" ? "dashboardPage.praTender" : "dashboardPage.onSubmissionTender")}
          </button>
        ))}
      </div>
      {distribution && (hasError || refreshing) && <div role={hasError ? "alert" : "status"} className="mt-3 text-xs text-muted-foreground">
        {translate(hasError ? "dashboardPage.workStatusStale" : "dashboardPage.workStatusRefreshing")}
        {hasError && <button type="button" onClick={onRetry} className="ml-2 rounded px-2 py-1 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{translate("common.retry")}</button>}
      </div>}
      {message ? (
        <div className="mt-5" role={hasError ? "alert" : "status"}>
          <p className="text-sm text-muted-foreground">{message}</p>
          {!loading && (hasError || !distribution) && <button type="button" onClick={onRetry} className="mt-2 rounded-md px-3 py-2 text-sm text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{translate("common.retry")}</button>}
        </div>
      ) : distribution && distribution.total === 0 ? (
        <div role="status" className="mt-5 text-sm text-muted-foreground"><p>{totalLabel}: {formatNumber(0)}</p><p>{translate(phase === "ALL" ? "dashboardPage.allWorkStatusEmpty" : phase === "PRA_TENDER" ? "dashboardPage.workStatusEmpty" : "dashboardPage.workStatusEmptyTender")}</p></div>
      ) : distribution ? (
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:items-center" aria-live="polite">
          <p className="sr-only">{totalLabel}: {formatNumber(distribution.total)}</p>
          <div className="relative mx-auto h-48 w-full max-w-[240px]" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={57} outerRadius={78} paddingAngle={2} stroke="none" isAnimationActive={false}>
                  {data.map(row => <Cell key={row.status} fill={row.color} />)}
                </Pie>
                <Tooltip formatter={value => [formatNumber(Number(value)), translate("dashboardPage.chartProjects")]}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--popover-foreground))", fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold text-foreground">{formatNumber(distribution.total)}</span>
              <span className="max-w-[112px] text-center text-xs leading-tight text-muted-foreground">{totalLabel}</span>
            </div>
          </div>
          <dl className="min-w-0 divide-y divide-border">
            {data.map(row => (
              <div key={row.status} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
                <dt className="inline-flex items-center gap-2 text-sm text-foreground">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />{row.name}
                </dt>
                <dd className="text-sm tabular-nums text-muted-foreground">{formatNumber(row.count)} ({formatNumber(row.percentage / 100, { style: "percent", maximumFractionDigits: 1 })})</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
