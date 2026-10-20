"use client";

import { translate as translateI18n, translateRole } from "@/i18n";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useProjectActivities } from "@/hooks/use-projects";
import {
  flattenActivityPages,
  formatActivityAction,
  formatActivityDescription,
  formatBusinessAudit,
} from "@/lib/activity-timeline";
import { Project, ProjectMilestonePhase4 } from "@/types/project";
import { formatDateTime } from "@/lib/project-detail-format";

export function ActivityTimeline({ project, milestones }: { project: Project; milestones: ProjectMilestonePhase4[] }) {
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useProjectActivities(project.id);
  const activities = flattenActivityPages(data?.pages);
  const auditContext = { projectName: project.name, milestones,
    scenarios: [project.scenario, project.active_scenario].filter((scenario): scenario is NonNullable<typeof scenario> => Boolean(scenario)) };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold tracking-tight">{translateI18n("copy.activity")}</CardTitle>
          <CardDescription className="text-xs">{translateI18n("copy.recentEvents")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {isLoading ? (
          <div className="space-y-2 py-1" aria-label={translateI18n("projectDetail.loadingActivity")}>
            {[0, 1, 2].map((index) => <div key={index} className="h-12 rounded-lg bg-muted/30 animate-pulse" />)}
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{translateI18n("copy.projectActivityError")}</p>
        ) : activities.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{translateI18n("copy.noActivity")}</p>
        ) : (
          <>
            <div className="space-y-0">
              <ol className="space-y-0">
                {activities.map((activity, index) => (
                  <li key={activity.id} className="relative pl-7 pb-3 last:pb-0">
                    {index < activities.length - 1 && <span className="absolute bottom-[-0.75rem] left-[7px] top-4 w-px bg-border/70" aria-hidden="true" />}
                    <span className="absolute left-0 top-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                      <Activity className="h-2.5 w-2.5" aria-hidden="true" />
                    </span>
                    <div className="rounded-md border border-border/40 bg-muted/15 px-2.5 py-2">
                      <p className="text-xs font-semibold text-foreground">{formatActivityAction(activity.action)}</p>
                      {(activity.businessChange || activity.description || activity.estimatedValueChange || activity.picAssignmentChange) && <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{activity.businessChange ? formatBusinessAudit(activity.businessChange, auditContext) : formatActivityDescription(activity.action, activity.description, activity.estimatedValueChange, activity.picAssignmentChange)}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground/85">
                        {activity.actor ? (
                          <>
                            <span className="font-medium text-foreground/80">{activity.actor.name}</span>
                            <span aria-hidden="true">•</span>
                            <span>{translateRole(activity.actor.role)}</span>
                          </>
                        ) : (
                          <span>{translateI18n("copy.unknownActor")}</span>
                        )}
                        <span aria-hidden="true">•</span>
                        <time dateTime={activity.createdAt}>{formatDateTime(activity.createdAt)}</time>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            {hasNextPage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mx-auto"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {translateI18n(isFetchingNextPage ? "common.loading" : "projectDetail.loadMore")}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
