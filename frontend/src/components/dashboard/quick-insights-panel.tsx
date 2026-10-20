"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Clock3 } from "lucide-react";
import { translate as translateI18n } from "@/i18n";
import type { getDashboardInsights } from "@/lib/dashboard-ux";
import { displayWorkState } from "@/lib/dashboard-overview";

export function QuickInsightsPanel({
  insights,
  loading,
  viewAllHref,
  hasMore,
}: {
  insights: ReturnType<typeof getDashboardInsights>;
  loading: boolean;
  viewAllHref: string;
  hasMore: boolean;
}) {
  return (
    <section aria-labelledby="quick-insights-heading" className="dashboard-surface p-4 sm:p-5">
      <div>
        <h2 id="quick-insights-heading" className="text-base font-semibold text-foreground">{translateI18n("copy.needsAttention")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{translateI18n("copy.actionItems")}</p>
      </div>

      {loading && insights.length === 0 ? (
        <div className="mt-4 space-y-3" aria-label={translateI18n("dashboardPage.loadingInsights")}>
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded bg-muted" />)}
        </div>
      ) : insights.length > 0 ? (
        <div className="mt-4 divide-y divide-border">
          {insights.map((insight) => {
            const isRisk = insight.tone === "risk";
            const isWaiting = insight.tone === "waiting";
            const Icon = isRisk ? AlertTriangle : isWaiting ? Clock3 : ChevronRight;
            const iconClassName = isRisk
              ? "bg-destructive/10 text-destructive"
              : isWaiting
              ? "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]"
              : "bg-primary/10 text-primary";
            const content = (
              <div className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className={["mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconClassName].join(" ")}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">{translateI18n(isWaiting ? "dashboardPage.waitingOnOthers" : "dashboardPage.actionableNow")}</p>
                  <p className="break-words text-sm font-medium text-foreground">{insight.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{insight.description}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {[insight.label, insight.meta, displayWorkState(insight.state)].filter(Boolean).join(" - ")}
                  </p>
                </div>
                {insight.href && <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
              </div>
            );

            return insight.href ? (
              <Link
                key={insight.id}
                href={insight.href}
                className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {content}
              </Link>
            ) : (
              <div key={insight.id}>{content}</div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 flex items-start gap-3 py-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--success))]" />
          <div>
            <p className="text-sm font-medium text-foreground">{translateI18n("copy.noAttention")}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{translateI18n("copy.queueClear")}</p>
          </div>
        </div>
      )}

      {hasMore && (
        <Link href={viewAllHref} className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {translateI18n("dashboardPage.fullQueue")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}
