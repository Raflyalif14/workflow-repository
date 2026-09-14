"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, FolderKanban, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjects, useScenarios } from "@/hooks/use-projects";
import {
  formatActorRoleLabel,
  formatProjectStatusLabel,
} from "@/lib/workflow-ux-helpers";
import { Project, ProjectStatus } from "@/types/project";

const statuses: Array<{ key: ProjectStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "All projects" },
  { key: "ACTIVE", label: "Active" },
  { key: "DRAFT", label: "Planning" },
  { key: "POSTPONED", label: "Postponed" },
  { key: "COMPLETED", label: "Completed" },
];

const rolePageCopy: Record<string, { eyebrow: string; title: string; description: string }> = {
  SALES: {
    eyebrow: "Sales workspace",
    title: "Your projects",
    description: "Move customer projects from planning into active delivery.",
  },
  HEAD_SA: {
    eyebrow: "Delivery oversight",
    title: "Project oversight",
    description: "Review planning progress, ownership, and delivery health across projects.",
  },
  SA: {
    eyebrow: "Delivery workspace",
    title: "Assigned projects",
    description: "Open your assigned projects and continue the work that is ready for you.",
  },
  SUPER_ADMIN: {
    eyebrow: "Operations overview",
    title: "Project portfolio",
    description: "Monitor planning and delivery activity across the organization.",
  },
};

function getStatusBadge(projectStatus: ProjectStatus) {
  switch (projectStatus) {
    case "ACTIVE":
      return <Badge variant="default">Active</Badge>;
    case "DRAFT":
      return <Badge variant="outline">Planning</Badge>;
    case "POSTPONED":
      return <Badge variant="warning">Postponed</Badge>;
    case "COMPLETED":
      return <Badge variant="success">Completed</Badge>;
    case "CANCELLED":
      return <Badge variant="destructive">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{formatProjectStatusLabel(projectStatus)}</Badge>;
  }
}

function getProjectState(project: Project, role: string) {
  if (project.status === "DRAFT") {
    return project.currentRole === "HEAD_SA" ? "Awaiting plan approval" : "Planning in progress";
  }
  if (project.status === "ACTIVE" && !project.pic && role === "HEAD_SA") {
    return "Waiting for project assignment";
  }
  if (project.status === "ACTIVE") return "Delivery in progress";
  return formatProjectStatusLabel(project.status);
}

function getProgressPresentation(project: Project) {
  if (project.status === "DRAFT") {
    return project.currentRole === "HEAD_SA"
      ? {
          label: "Awaiting plan approval",
          detail: "Head SA is reviewing the project plan",
          showDeliveryProgress: false,
        }
      : {
          label: "Project planning",
          detail: "Delivery begins after plan approval",
          showDeliveryProgress: false,
        };
  }
  if (project.status === "POSTPONED" || project.status === "ON_HOLD") {
    return {
      label: "Delivery paused",
      detail: "Resume the project to continue delivery",
      showDeliveryProgress: false,
    };
  }
  if (project.status === "ACTIVE" || project.status === "COMPLETED") {
    return {
      label: project.status === "COMPLETED" ? "Delivery complete" : "Delivery progress",
      detail: null,
      showDeliveryProgress: true,
    };
  }
  return {
    label: "Project progress",
    detail: "Progress is not available for this project state",
    showDeliveryProgress: false,
  };
}

function getProjectPriority(project: Project, role: string) {
  const priorityFrom = (values: Partial<Record<ProjectStatus, number>>, fallback: number) =>
    values[project.status] ?? fallback;

  if (role === "SALES") {
    return priorityFrom(
      { DRAFT: 0, ACTIVE: 1, POSTPONED: 2, COMPLETED: 3, CANCELLED: 4 },
      5
    );
  }
  if (role === "HEAD_SA") {
    if (project.status === "ACTIVE" && !project.pic) return 0;
    return priorityFrom(
      { DRAFT: 1, ACTIVE: 2, POSTPONED: 3, COMPLETED: 4, CANCELLED: 5 },
      6
    );
  }
  if (role === "SA") {
    return priorityFrom(
      { ACTIVE: 0, POSTPONED: 1, DRAFT: 2, COMPLETED: 3, CANCELLED: 4 },
      5
    );
  }
  if (project.status === "POSTPONED") return 0;
  if (project.status === "ACTIVE" && !project.pic) return 1;
  return priorityFrom({ ACTIVE: 2, DRAFT: 3, COMPLETED: 4, CANCELLED: 5 }, 6);
}

function getResponsibleLabel(project: Project) {
  if (project.pic) {
    return {
      role: formatActorRoleLabel(project.pic.role || "SA"),
      name: project.pic.fullName || project.pic.full_name || "Assigned architect",
    };
  }

  if (project.sales) {
    return {
      role: formatActorRoleLabel(project.sales.role || "SALES"),
      name: project.sales.fullName || project.sales.full_name || "Project owner",
    };
  }

  return { role: "Responsibility", name: "Not assigned" };
}

function ProjectRow({ project, role }: { project: Project; role: string }) {
  const progress = typeof project.progress === "number" ? project.progress : null;
  const responsible = getResponsibleLabel(project);
  const progressPresentation = getProgressPresentation(project);

  return (
    <div className="grid gap-4 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5 lg:grid-cols-[minmax(220px,2fr)_minmax(130px,1fr)_minmax(150px,1.1fr)_minmax(150px,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <Link
          href={`/projects/${project.id}`}
          className="font-semibold text-foreground transition-colors hover:text-primary"
        >
          {project.name}
        </Link>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {project.customer}
          {project.scenario?.name ? ` | ${project.scenario.name}` : ""}
        </p>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 lg:block">
        <span className="text-[11px] font-medium text-muted-foreground lg:hidden">State</span>
        <div className="min-w-0 text-right lg:text-left">
          {getStatusBadge(project.status)}
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {getProjectState(project, role)}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{progressPresentation.label}</span>
          {progressPresentation.showDeliveryProgress && (
            <span className="font-medium text-foreground">
              {progress === null ? "Not available" : `${progress}%`}
            </span>
          )}
        </div>
        {progressPresentation.showDeliveryProgress && progress !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
            />
          </div>
        )}
        {progressPresentation.showDeliveryProgress &&
          typeof project.totalMilestones === "number" &&
          typeof project.completedMilestones === "number" && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {project.completedMilestones} of {project.totalMilestones} stages completed
          </p>
        )}
        {progressPresentation.detail && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {progressPresentation.detail}
          </p>
        )}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 lg:block">
        <span className="text-[11px] font-medium text-muted-foreground lg:hidden">Responsible</span>
        <div className="min-w-0 text-right lg:text-left">
          <p className="truncate text-sm font-medium text-foreground">{responsible.name}</p>
          <p className="truncate text-xs text-muted-foreground">{responsible.role}</p>
        </div>
      </div>

      <Link href={`/projects/${project.id}`} className="justify-self-stretch lg:justify-self-end">
        <Button variant="ghost" size="sm" className="w-full gap-1.5 lg:w-auto">
          Open
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </Link>
    </div>
  );
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const userRole = user?.role || "GUEST";
  const pageCopy = rolePageCopy[userRole] || rolePageCopy.SUPER_ADMIN;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "ALL">("ALL");
  const [scenarioId, setScenarioId] = useState("");

  const { data, isLoading, isError } = useProjects({
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
      projects
        .map((project, index) => ({ project, index }))
        .sort(
          (left, right) =>
            getProjectPriority(left.project, userRole) -
              getProjectPriority(right.project, userRole) ||
            left.index - right.index
        )
        .map(({ project }) => project),
    [projects, userRole]
  );
  const snapshot = useMemo(
    () => [
      { label: "Matching projects", value: pagination?.total || 0 },
      { label: "Active on this page", value: projects.filter((item) => item.status === "ACTIVE").length },
      { label: "Planning on this page", value: projects.filter((item) => item.status === "DRAFT").length },
      { label: "Completed on this page", value: projects.filter((item) => item.status === "COMPLETED").length },
    ],
    [pagination?.total, projects]
  );
  const hasFilters = Boolean(search || scenarioId || status !== "ALL");

  const resetFilters = () => {
    setSearch("");
    setScenarioId("");
    setStatus("ALL");
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase text-primary">{pageCopy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{pageCopy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{pageCopy.description}</p>
        </div>
        {userRole === "SALES" && (
          <Link href="/projects/new" className="self-start sm:self-auto">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create project
            </Button>
          </Link>
        )}
      </header>

      <section
        aria-label="Project snapshot"
        className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/60 bg-card lg:grid-cols-4"
      >
        {snapshot.map((item, index) => (
          <div
            key={item.label}
            className={`border-border/60 px-4 py-3.5 sm:px-5 ${
              index % 2 === 1 ? "border-l" : ""
            } ${index >= 2 ? "border-t" : ""} ${
              index > 0 ? "lg:border-l" : ""
            } lg:border-t-0`}
          >
            <p className="text-2xl font-semibold text-foreground">{item.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <div className="space-y-4 border-b border-border/60 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Projects</h2>
              <p className="text-xs text-muted-foreground">
                {pagination?.total || 0} projects match the current view
              </p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
              {statuses.map((item) => (
                <Button
                  key={item.key}
                  variant={status === item.key ? "secondary" : "ghost"}
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setStatus(item.key);
                    setPage(1);
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search project or customer"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              value={scenarioId}
              onChange={(event) => {
                setScenarioId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All scenarios</option>
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
              Reset
            </Button>
          </div>
        </div>

        {!isLoading && !isError && projects.length > 0 && (
          <div className="hidden grid-cols-[minmax(220px,2fr)_minmax(130px,1fr)_minmax(150px,1.1fr)_minmax(150px,1fr)_auto] gap-4 border-b border-border/60 px-5 py-2.5 text-[11px] font-semibold uppercase text-muted-foreground lg:grid">
            <span>Project</span>
            <span>State</span>
            <span>Progress</span>
            <span>Responsible</span>
            <span className="text-right">Action</span>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-0">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-24 animate-pulse border-t border-border/60 bg-muted/20 first:border-t-0" />
            ))}
          </div>
        ) : isError ? (
          <div className="px-5 py-14 text-center">
            <p className="font-medium text-destructive">Unable to load projects.</p>
            <p className="mt-1 text-xs text-muted-foreground">Refresh the page and try again.</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium text-foreground">No projects found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasFilters ? "Adjust the current filters to broaden the results." : "No projects are available in this workspace yet."}
            </p>
          </div>
        ) : (
          <div>
            {orderedProjects.map((project) => (
              <ProjectRow key={project.id} project={project} role={userRole} />
            ))}
          </div>
        )}

        {!isLoading && !isError && projects.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span>
              Showing {projects.length} of {pagination?.total || 0} projects
            </span>
            <div className="flex gap-2 self-end sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination?.hasPrevPage}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination?.hasNextPage}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
