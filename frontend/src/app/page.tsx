"use client";

import { useLanguage } from "@/components/i18n/language-provider";
import { translate as translateI18n } from "@/i18n";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, Clock3 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { PhaseWorkStatusPanel } from "@/components/dashboard/phase-work-status-panel";
import { HeadSaProjectValuesPanel } from "@/components/dashboard/head-sa-project-values-panel";
import { RecentActivityPanel } from "@/components/dashboard/recent-activity-panel";
import { useApprovals, useApprovalStats } from "@/hooks/use-approvals";
import { canReadApprovalOverview } from "@/lib/approval-overview-access";
import { useDashboard } from "@/hooks/use-dashboard";
import { useMyAssignedMilestones, useProjects } from "@/hooks/use-projects";
import {
  type DashboardProjectHealth,
  getDashboardGreeting,
  getDashboardGreetingSubject,
  getDashboardInsights,
  getDashboardKpiLabels,
  getDashboardRoleContent,
  getHeadSaOutputReviewItems,
  getSaDashboardItems,
  getSaOutputRevisionItems,
  getSalesDashboardItems,
  sortDashboardItems,
  sortDashboardProjectHealth,
  sortSaWorkload,
  shouldShowSaWorkload,
} from "@/lib/dashboard-ux";
import type { DashboardSummary } from "@/types/dashboard";
import {
  displayWorkState,
  formatRevenue,
  getHeadSaItems,
  getSuperAdminItems,
  getRoleSummary,
  getViewAllHref,
} from "@/lib/dashboard-overview";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ProjectDeliveryRow } from "@/components/dashboard/project-delivery-row";
import { QuickInsightsPanel } from "@/components/dashboard/quick-insights-panel";
import { SolutionArchitectWorkloadPanel } from "@/components/dashboard/solution-architect-workload-panel";

export default function DashboardPage() {
  useLanguage();
  const { user } = useAuth();
  const greeting = getDashboardGreeting(new Date().getHours());
  const userRole = user?.role || "GUEST";
  const isHeadSa = userRole === "HEAD_SA";
  const isSa = userRole === "SA";
  const canLoadApprovalOverview = canReadApprovalOverview(user?.role);

  const dashboardQuery = useDashboard();
  const approvalStatsQuery = useApprovalStats(canLoadApprovalOverview);
  const approvalsQuery = useApprovals({}, isHeadSa);
  const assignedMilestonesQuery = useMyAssignedMilestones(isSa || isHeadSa);
  const projectsQuery = useProjects({ limit: 100 });

  const summary = dashboardQuery.data?.summary;
  const summaryForMetrics: DashboardSummary = {
    totalProjects: summary?.totalProjects || 0,
    activeProjects: summary?.activeProjects || 0,
    completedProjects: summary?.completedProjects || 0,
    onHoldProjects: summary?.onHoldProjects || 0,
    postponedProjects: summary?.postponedProjects || 0,
    overdueMilestones: summary?.overdueMilestones || 0,
    waitingApproval: (canLoadApprovalOverview ? approvalStatsQuery.data?.totalPending : undefined) ?? summary?.waitingApproval ?? 0,
  };
  const projectProgress = dashboardQuery.data?.projectProgress || [];
  const recentActivity = dashboardQuery.data?.recentActivity || [];
  const outputDocuments = dashboardQuery.data?.outputDocuments || { reviewQueue: [], revisionQueue: [], salesProgress: [] };
  const saWorkload = sortSaWorkload(dashboardQuery.data?.saWorkload || []);
  const projects = projectsQuery.data?.projects || [];
  const approvals = approvalsQuery.data || [];
  const assignedMilestones = assignedMilestonesQuery.data || [];
  const roleContent = getDashboardRoleContent(userRole);
  const greetingSubject = getDashboardGreetingSubject(user?.fullName, userRole);

  const roleItems =
    userRole === "SALES"
      ? getSalesDashboardItems(projects, user?.id)
      : userRole === "HEAD_SA"
      ? [...getHeadSaItems(approvals, projects), ...getHeadSaOutputReviewItems(outputDocuments.reviewQueue)]
      : userRole === "SA"
      ? [...getSaDashboardItems(assignedMilestones, user?.id), ...getSaOutputRevisionItems(outputDocuments.revisionQueue)]
      : userRole === "SUPER_ADMIN"
      ? getSuperAdminItems(summaryForMetrics, projectProgress)
      : [];
  const actionItems = sortDashboardItems(roleItems.filter((item) => item.group === "action"));
  const nextTask = actionItems[0];
  const quickInsights = getDashboardInsights(roleItems, nextTask?.id, 5);
  const remainingItemCount = Math.max(0, roleItems.length - (nextTask ? 1 : 0));
  const viewAllHref = getViewAllHref(userRole);
  const salesResults = userRole === "SALES" ? dashboardQuery.data?.salesResults : null;
  const calculatedMetrics = salesResults ? [
    { label: "Total estimated revenue", value: salesResults.totalEstimatedRevenue },
    { label: "Waiting result", value: salesResults.waitingResult.count },
    { label: "Won", value: salesResults.won.count },
    { label: "Lost", value: salesResults.lost.count },
  ] : getRoleSummary({
    role: userRole,
    projects,
    approvals,
    milestones: assignedMilestones,
    summary: summaryForMetrics,
    outputReviewCount: approvalStatsQuery.data?.pendingDocs ?? outputDocuments.reviewQueue.reduce((total, item) => total + item.count, 0),
  });
  const metricValues = new Map(calculatedMetrics.map((metric) => [metric.label, metric.value]));
  const metrics = getDashboardKpiLabels(userRole).map((label) => ({
    label,
    value: metricValues.get(label) || 0,
  }));
  const isRoleDataLoading =
    (userRole === "SALES" && (projectsQuery.isLoading || dashboardQuery.isLoading)) ||
    (isHeadSa && (approvalsQuery.isLoading || projectsQuery.isLoading)) ||
    (isSa && assignedMilestonesQuery.isLoading) ||
    (userRole === "SUPER_ADMIN" && dashboardQuery.isLoading);
  const hasPartialError =
    dashboardQuery.isError ||
    projectsQuery.isError ||
    (canLoadApprovalOverview && approvalStatsQuery.isError) ||
    (isHeadSa && approvalsQuery.isError) ||
    (isSa && assignedMilestonesQuery.isError);

  const combineEmptySalesPanels = userRole === "SALES" && !isRoleDataLoading && !hasPartialError
    && !nextTask && remainingItemCount === 0;

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const salesOutputProgressByProject = new Map(outputDocuments.salesProgress.map((item) => [item.projectId, item]));
  const healthSource: DashboardProjectHealth[] = (
    projectProgress.length > 0
      ? projectProgress
      : projects.map((project) => ({
          id: project.id,
          name: project.name,
          clientName: project.customer,
          status: project.status,
          targetEndDate: project.currentMilestone?.due_date || project.targetEndDate || null,
          totalMilestones: project.totalMilestones || 0,
          completedMilestones: project.completedMilestones || 0,
          overdueMilestones: 0,
          percentage: typeof project.progress === "number" ? project.progress : null,
        }))
  ).map((project) => {
    const matchingProject = projectsById.get(project.id);
    const outputProgress = salesOutputProgressByProject.get(project.id);
    const owner = matchingProject?.pic || matchingProject?.sales || matchingProject?.salesPIC || null;

    return {
      id: project.id,
      name: project.name,
      clientName: project.clientName || matchingProject?.customer,
      status: project.status,
      percentage: project.percentage,
      completedMilestones: project.completedMilestones,
      totalMilestones: project.totalMilestones,
      overdueMilestones: project.overdueMilestones,
      targetEndDate: project.targetEndDate || matchingProject?.currentMilestone?.due_date || null,
      ownerName: owner?.fullName || owner?.full_name || null,
      ownerKnown: Boolean(matchingProject),
      hasPic: matchingProject ? Boolean(matchingProject.pic) : undefined,
      currentRole: matchingProject?.currentRole,
      currentStage: matchingProject?.currentStage,
      currentDeadline: matchingProject?.currentMilestone?.due_date || null,
      picName: matchingProject?.pic?.fullName || matchingProject?.pic?.full_name || null,
      estimatedRevenue: matchingProject?.estimated_revenue ?? null,
      outputApprovedCount: outputProgress?.approvedCount,
      outputSelectedCount: outputProgress?.selectedCount,
    };
  });
  const projectDelivery = sortDashboardProjectHealth(healthSource, userRole).slice(0, 8);
  const projectDeliveryTitle = userRole === "SALES"
    ? translateI18n("dashboardPage.revenueOpportunity")
    : userRole === "HEAD_SA"
    ? translateI18n("dashboardPage.projectDelivery")
    : userRole === "SA"
    ? translateI18n("dashboardPage.yourDeadlines")
    : translateI18n("dashboardPage.projectDelivery");
  const projectDeliveryDescription = userRole === "SALES"
    ? translateI18n("dashboardPage.salesDeliveryDescription")
    : userRole === "HEAD_SA"
    ? translateI18n("dashboardPage.headDeliveryDescription")
    : userRole === "SA"
    ? translateI18n("dashboardPage.saDeliveryDescription")
    : translateI18n("dashboardPage.adminDeliveryDescription");
  const projectProgressIds = new Set(projectProgress.map((project) => project.id));
  const isProjectDeliveryLoading = dashboardQuery.isLoading && projectsQuery.isLoading;
  const hasProjectDeliveryError = dashboardQuery.isError && projectsQuery.isError;

  const retryVisibleQueries = () => {
    void dashboardQuery.refetch();
    void projectsQuery.refetch();
    if (canLoadApprovalOverview) void approvalStatsQuery.refetch();
    if (isSa) void assignedMilestonesQuery.refetch();
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">{roleContent.eyebrow}</p>
          <h1 className="mt-1.5 break-words text-[26px] font-semibold leading-tight tracking-tight text-foreground">
            {greeting}, {greetingSubject}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-5 text-muted-foreground">{roleContent.description}</p>

        </div>

        <Link href="/projects" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-primary-soft hover:text-primary">
          {translateI18n("dashboardPage.viewAllProjects")}<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      {hasPartialError && (
        <div className="flex flex-col gap-3 rounded-lg border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.08)] p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
            <p>{translateI18n("copy.partialLoad")}</p>
          </div>
          <button
            type="button"
            onClick={retryVisibleQueries}
            className="text-left text-sm font-medium text-foreground underline underline-offset-4 hover:text-primary sm:text-right"
          >
            {translateI18n("common.retry")}
          </button>
        </div>
      )}

      <div className={`grid min-w-0 gap-4 ${combineEmptySalesPanels ? "" : "xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] xl:items-start"}`}>
        <section aria-labelledby="next-task-heading" className="dashboard-surface p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><ClipboardCheck className="h-5 w-5" aria-hidden="true" /></span>
            <h2 id="next-task-heading" className="text-base font-semibold">{roleContent.title}</h2>
          </div>
          {isRoleDataLoading && !nextTask ? (
            <div role="status" aria-label={translateI18n("dashboardPage.loadingNext")} className="mt-4 space-y-3"><div className="h-6 w-3/4 animate-pulse rounded bg-muted" /><div className="h-16 animate-pulse rounded-xl bg-muted" /></div>
          ) : nextTask ? (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-primary">{nextTask.label}</p>
                <h3 className="mt-2 break-words text-xl font-semibold">{nextTask.title}</h3>
                <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{nextTask.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {nextTask.state && <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{displayWorkState(nextTask.state)}</span>}
                {nextTask.meta && <span className="break-words">{nextTask.meta}</span>}
              </div>
              <Link href={nextTask.href || viewAllHref} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep sm:w-auto">
                {nextTask.actionLabel}<ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : hasPartialError ? (
            <div role="alert" className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>{translateI18n("copy.partialLoad")}</p>
              <button type="button" onClick={retryVisibleQueries} className="min-h-10 rounded-lg border border-border px-4 text-primary hover:bg-primary-soft">{translateI18n("common.retry")}</button>
            </div>
          ) : combineEmptySalesPanels ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />{translateI18n("copy.queueClear")}</p>
              <Link href={viewAllHref} className="inline-flex min-h-9 items-center gap-2 font-medium text-primary">{translateI18n("dashboardPage.fullQueue")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-muted/60 p-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--success))]" aria-hidden="true" /><div><p className="text-sm font-medium">{translateI18n(userRole === "SALES" && remainingItemCount > 0 ? "dashboardPage.noDirectSalesAction" : "copy.noAttention")}</p>{!(userRole === "SALES" && remainingItemCount > 0) && <p className="mt-1 text-sm text-muted-foreground">{translateI18n("copy.queueClear")}</p>}<Link href={viewAllHref} className="mt-3 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-primary">{translateI18n("dashboardPage.fullQueue")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div></div>
          )}
        </section>
        {!combineEmptySalesPanels && <QuickInsightsPanel
          insights={quickInsights}
          loading={isRoleDataLoading}
          viewAllHref={viewAllHref}
          hasMore={remainingItemCount > quickInsights.length}
        />}
      </div>

      <section aria-labelledby="project-delivery-heading" className="project-delivery-layout dashboard-surface">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 id="project-delivery-heading" className="text-base font-semibold text-foreground">{projectDeliveryTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{projectDeliveryDescription}</p>
          </div>
          {projectDelivery.length > 0 && (
            <Link href="/projects" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              {translateI18n("dashboardPage.viewAllProjects")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        <div className="dashboard-table">
        {userRole === "SALES" ? (
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.85fr)] gap-4 border-b border-border bg-muted/40 px-5 py-2.5 text-xs font-medium text-muted-foreground lg:grid">
            <span>{translateI18n("nav.projects")}</span><span>{translateI18n("copy.estimatedRevenue")}</span><span>{translateI18n("copy.stage")}</span><span>PIC</span>
          </div>
        ) : (
          <div className="delivery-columns border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
            <span>{translateI18n("nav.projects")}</span><span>PIC</span><span>{translateI18n("copy.currentWork")}</span><span>{translateI18n("common.status")}</span><span>{translateI18n("copy.progress")}</span><span className="text-right">{translateI18n("common.open")}</span>
          </div>
        )}

        {isProjectDeliveryLoading && projectDelivery.length === 0 ? (
          <div className="space-y-3 p-5" aria-label={translateI18n("dashboardPage.loadingProjects")}>
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded bg-muted" />)}
          </div>
        ) : projectDelivery.length > 0 ? (
          <div className="divide-y divide-border">
            {projectDelivery.map((project) => (
              <ProjectDeliveryRow
                key={project.id}
                project={project}
                role={userRole}
                hasOverdueData={projectProgressIds.has(project.id)}
              />
            ))}
          </div>
        ) : hasProjectDeliveryError ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            {translateI18n("dashboardPage.projectsFailed")}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 px-5 py-8">
            <p className="text-sm font-medium text-foreground">{translateI18n("copy.noProjectData")}</p>
            <p className="text-sm text-muted-foreground">{translateI18n("copy.accessibleProjects")}</p>
            <Link href="/projects" className="text-sm font-medium text-primary hover:underline">{translateI18n("copy.viewProject")}</Link>
          </div>
        )}
        </div>
      </section>

      <HeadSaProjectValuesPanel
        role={userRole}
        values={dashboardQuery.data?.headSaProjectValues}
        loading={dashboardQuery.isLoading}
        hasError={dashboardQuery.isError}
      />

      {shouldShowSaWorkload(userRole) && (
        <SolutionArchitectWorkloadPanel
          workload={saWorkload}
          loading={dashboardQuery.isLoading}
          hasError={dashboardQuery.isError}
        />
      )}

      <section aria-labelledby="dashboard-summary-heading" className="space-y-3">
        <h2 id="dashboard-summary-heading" className="text-base font-semibold">{translateI18n("dashboardPage.summary")}</h2>
        {isRoleDataLoading ? (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(4,minmax(0,1fr))]" aria-label={translateI18n("dashboardPage.loadingMetrics")}>
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-xl border border-border bg-muted sm:h-32" />
            ))}
          </div>
        ) : hasPartialError ? (
          <div role="alert" className="dashboard-surface p-5 text-sm text-muted-foreground"><p>{translateI18n("copy.partialLoad")}</p><button type="button" onClick={retryVisibleQueries} className="mt-2 min-h-9 rounded-lg px-3 text-primary hover:bg-primary-soft">{translateI18n("common.retry")}</button></div>
        ) : (
          <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(4,minmax(0,1fr))]">
            {metrics.map((metric) => (
              <div key={metric.label} className="min-w-0">
                <dt className="sr-only">{metric.label}</dt>
                <dd className="min-w-0"><MetricCard metric={metric} /></dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {userRole === "SALES" && !dashboardQuery.isLoading && !dashboardQuery.isError && salesResults && (
        <section aria-label={translateI18n("dashboardPage.salesResults")} className="dashboard-surface grid gap-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-muted-foreground">{translateI18n("projectStatus.WAITING_RESULT")}</p><p className="font-semibold">{translateI18n("dashboardPage.projectCount", { count: salesResults.waitingResult.count })}</p><p className="text-xs text-muted-foreground">{translateI18n("dashboardPage.estimate", { value: formatRevenue(salesResults.waitingResult.estimatedRevenue) })}</p></div>
          <div><p className="text-muted-foreground">{translateI18n("projectStatus.WON")}</p><p className="font-semibold">{translateI18n("dashboardPage.projectCount", { count: salesResults.won.count })}</p><p className="text-xs text-muted-foreground">{translateI18n("dashboardPage.estimate", { value: formatRevenue(salesResults.won.estimatedRevenue) })}</p></div>
          <div><p className="text-muted-foreground">{translateI18n("projectStatus.LOST")}</p><p className="font-semibold">{translateI18n("dashboardPage.projectCount", { count: salesResults.lost.count })}</p><p className="text-xs text-muted-foreground">{translateI18n("dashboardPage.estimate", { value: formatRevenue(salesResults.lost.estimatedRevenue) })}</p></div>
          <div><p className="text-muted-foreground">{translateI18n("copy.finalContract")}</p><p className="font-semibold">{formatRevenue(salesResults.finalContractValueTotal)}</p><p className="text-xs text-muted-foreground">{translateI18n("copy.wonOnly")}</p></div>
        </section>
      )}

      <div className="min-w-0">
        <PhaseWorkStatusPanel
          summary={dashboardQuery.data?.phaseWorkStatus}
          allSummary={dashboardQuery.data?.allWorkStatus}
          loading={dashboardQuery.isLoading}
          hasError={dashboardQuery.isError}
          refreshing={dashboardQuery.isFetching}
          onRetry={() => { void dashboardQuery.refetch(); }}
        />
      </div>

      <RecentActivityPanel
        activities={recentActivity}
        pagination={dashboardQuery.data?.recentActivityPagination}
        refreshing={dashboardQuery.isFetching}
        scopeKey={`${user?.id || "guest"}:${userRole}`}
        loading={dashboardQuery.isLoading}
        hasError={dashboardQuery.isError}
        onRetry={() => { void dashboardQuery.refetch(); }}
      />
    </div>
  );
}
