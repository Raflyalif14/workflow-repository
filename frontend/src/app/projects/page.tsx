"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, FolderKanban, Layers3, Plus, Search, X } from "lucide-react";
import { ListSummary } from '@/components/list-summary';
import { useLanguage } from "@/components/i18n/language-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjects, useScenarios } from "@/hooks/use-projects";
import { ProjectListRow } from "@/components/projects/project-list-row";
import { PageDataFeedback } from "@/components/navigation-feedback";
import { isProjectDeliveryCompleted } from "@/lib/project-list-status";
import { translate as translateI18n } from "@/i18n";
import type { ProjectListStatusFilter } from "@/types/project";
import {
  PROJECT_LIST_STATUS_TABS,
  ROLE_PAGE_COPY,
  getProjectPriority,
} from "@/lib/project-list-format";

export default function ProjectsPage() {
  useLanguage();
  const { user } = useAuth();
  const userRole = user?.role || "GUEST";
  const pageCopy = ROLE_PAGE_COPY[userRole] || ROLE_PAGE_COPY.SUPER_ADMIN;

  // Filter & pagination state
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectListStatusFilter>("ALL");
  const [scenarioId, setScenarioId] = useState("");

  const { data, isLoading, isError, isFetching } = useProjects({
    page,
    limit: 10,
    search,
    status,
    scenarioId: scenarioId || undefined,
  });
  const { data: scenarios = [] } = useScenarios();

  const projects = data?.projects || [];
  const pagination = data?.pagination;

  const orderedProjects = useMemo(
    () =>
      (data?.projects ?? [])
        .map((project, index) => ({ project, index }))
        .sort(
          (left, right) =>
            getProjectPriority(left.project, userRole) -
              getProjectPriority(right.project, userRole) ||
            left.index - right.index
        )
        .map(({ project }) => project),
    [data?.projects, userRole]
  );

  const snapshot = [
    { label: translateI18n("listSummary.projectTotal"), value: pagination?.total ?? '—', scope: translateI18n('listSummary.allResults'), icon: Layers3, primary: true },
    { label: translateI18n("listSummary.projectActive"), value: projects.filter((item) => item.status === "ACTIVE").length, scope: translateI18n('listSummary.thisPage'), icon: FolderKanban },
    { label: translateI18n("listSummary.projectPlanning"), value: projects.filter((item) => item.status === "DRAFT").length, scope: translateI18n('listSummary.thisPage'), icon: ClipboardList },
    { label: translateI18n("listSummary.projectComplete"), value: projects.filter((item) => isProjectDeliveryCompleted(item.status)).length, scope: translateI18n('listSummary.thisPage'), icon: CheckCircle2 },
  ];

  const hasFilters = Boolean(search || scenarioId || status !== "ALL");

  const resetFilters = () => {
    setSearch("");
    setScenarioId("");
    setStatus("ALL");
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 xl:px-8">
      {/* Page Header */}
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {translateI18n(pageCopy.eyebrow)}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {translateI18n(pageCopy.title)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {translateI18n(pageCopy.description)}
          </p>
          <PageDataFeedback refreshing={isFetching && !isLoading} />
        </div>
        {userRole === "SALES" && (
          <Link href="/projects/new" className="self-start sm:self-auto">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              {translateI18n("project.create")}
            </Button>
          </Link>
        )}
      </header>

      {/* Snapshot Summary Cards */}
      <ListSummary aria-label={translateI18n('projectsList.snapshot')} description={translateI18n('listSummary.projectHelp')}
        items={snapshot} loading={isLoading} hasError={isError} refreshing={isFetching && !isLoading} />
      <p className="px-2 text-xs leading-5 text-muted-foreground">{translateI18n('listSummary.projectCompleteHelp')}</p>

      {/* Project Table & Filters */}
      <section className="overflow-hidden page-surface">
        <div className="space-y-4 border-b border-border/60 p-4 sm:p-5">
          {/* Header & Status Tabs */}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">{translateI18n("nav.projects")}</h2>
              <p className="text-xs text-muted-foreground">
                {translateI18n("projectsList.matches", { count: pagination?.total || 0 })}
              </p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 xl:pb-0">
              {PROJECT_LIST_STATUS_TABS.map((item) => (
                <Button
                  key={item.key}
                  variant={status === item.key ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={status === item.key}
                  className={status === item.key ? "shrink-0 bg-primary-soft text-primary" : "shrink-0"}
                  onClick={() => {
                    setStatus(item.key);
                    setPage(1);
                  }}
                >
                  {translateI18n(item.label)}
                </Button>
              ))}
            </div>
          </div>

          {/* Search Bar & Scenario Filter */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={translateI18n("projectsList.searchPlaceholder")}
                aria-label={translateI18n("projectsList.search")}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              aria-label={translateI18n("projectsList.scenarioFilter")}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={scenarioId}
              onChange={(event) => {
                setScenarioId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{translateI18n("copy.allScenarios")}</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 gap-1.5"
              disabled={!hasFilters}
              onClick={resetFilters}
            >
              <X className="h-3.5 w-3.5" />
              {translateI18n("projectsList.reset")}
            </Button>
          </div>
        </div>

        {/* Table Column Headers (Desktop) */}
        {!isLoading && !isError && projects.length > 0 && (
          <div className="hidden grid-cols-[minmax(220px,2fr)_minmax(130px,1fr)_minmax(150px,1.1fr)_minmax(150px,1fr)_auto] gap-4 border-b border-border/60 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground xl:grid">
            <span>{translateI18n("copy.projectLabel")}</span>
            <span>{translateI18n("copy.state")}</span>
            <span>{translateI18n("copy.progress")}</span>
            <span>{translateI18n("copy.responsible")}</span>
            <span className="text-right">{translateI18n("copy.action")}</span>
          </div>
        )}

        {/* Project Rows or States */}
        {isLoading ? (
          <div role="status" aria-live="polite" className="space-y-0">
            <p className="px-5 py-3 text-sm text-muted-foreground">{translateI18n("common.loading")}</p>
            {[1, 2, 3, 4].map((item) => (
              <div key={item} aria-hidden="true" className="h-24 motion-safe:animate-pulse border-t border-border/60 bg-muted/20" />
            ))}
          </div>
        ) : isError ? (
          <div className="px-5 py-14 text-center">
            <p className="font-medium text-destructive">{translateI18n("project.loadError")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{translateI18n("copy.refreshTryAgain")}</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium text-foreground">{translateI18n("project.noProjects")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {translateI18n(hasFilters ? "projectsList.adjustFilters" : "projectsList.empty")}
            </p>
          </div>
        ) : (
          <div>
            {orderedProjects.map((project) => (
              <ProjectListRow key={project.id} project={project} role={userRole} />
            ))}
          </div>
        )}

        {/* Pagination Bar */}
        {!isLoading && !isError && projects.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span>
              {translateI18n("projectsList.showing", { shown: projects.length, total: pagination?.total || 0 })}
            </span>
            <div className="flex gap-2 self-end sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination?.hasPrevPage}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {translateI18n("projectsList.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination?.hasNextPage}
                onClick={() => setPage((current) => current + 1)}
              >
                {translateI18n("common.next")}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
