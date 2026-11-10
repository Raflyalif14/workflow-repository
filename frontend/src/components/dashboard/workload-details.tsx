"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { translate as t, translateMilestoneStatus } from "@/i18n";
import { formatDashboardDeadline } from "@/lib/dashboard-ux";
import type { DashboardSaWorkload } from "@/types/dashboard";

export function WorkloadDetails({ item }: { item: DashboardSaWorkload }) {
  return <div className="space-y-3">
    <p className="text-xs leading-relaxed text-muted-foreground">{t("workloadDetail.help")}</p>
    {!item.workItems ? <p className="text-sm text-muted-foreground">{t("workloadDetail.unavailable")}</p>
      : !item.workItems.length ? <p className="text-sm text-muted-foreground">{t("workloadDetail.empty")}</p>
      : <ul aria-label={item.saName} tabIndex={0} className="max-h-80 space-y-2 overflow-y-auto overscroll-contain rounded-lg pr-2 [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-ring">
        {item.workItems.map(work => <li key={work.id}>
          <Link href={`/projects/${work.projectId}#project-milestone-${work.id}`} className="group flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="min-w-0 space-y-1.5">
              <p className="break-words text-xs font-medium text-muted-foreground">{work.projectName}</p>
              <p className="break-words text-sm font-semibold text-foreground">{work.name}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-muted px-2 py-1 text-foreground">{translateMilestoneStatus(work.status)}</span>
                {work.activeWork && <span className="rounded-md bg-primary/10 px-2 py-1 text-primary">{t("copy.activeWork")}</span>}
              </div>
              <p className="text-xs text-muted-foreground">{t("copy.startDate")}: {formatDashboardDeadline(work.startDate) || t("dashboardPage.noDeadline")}</p>
              <p className="text-xs text-muted-foreground">{t("copy.deadline")}: {formatDashboardDeadline(work.dueDate) || t("dashboardPage.noDeadline")}</p>
            </div>
            <span className="shrink-0 text-primary"><ArrowUpRight aria-hidden="true" className="h-4 w-4" /><span className="sr-only">{t("workloadDetail.open")}</span></span>
          </Link>
        </li>)}
      </ul>}
  </div>;
}
