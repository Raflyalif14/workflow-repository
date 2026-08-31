"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Briefcase,
  Plus,
  Search,
  ArrowUpRight,
  FolderKanban,
  Filter,
  CheckCircle2,
  Calendar,
  Layers,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useProjects, useScenarios } from "@/hooks/use-projects";
import { ProjectStatus } from "@/types/project";
import { formatProjectStatusLabel } from "@/lib/workflow-ux-helpers";

const statuses: Array<{ key: ProjectStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "All Projects" },
  { key: "ACTIVE", label: "Active" },
  { key: "DRAFT", label: "Draft" },
  { key: "POSTPONED", label: "Postponed" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default function ProjectsPage() {
  const { user } = useAuth();
  const userRole = user?.role || "GUEST";
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

  const getStatusBadge = (projectStatus: string) => {
    switch (projectStatus) {
      case "ACTIVE":
        return <Badge variant="default">Active</Badge>;
      case "DRAFT":
        return <Badge variant="outline">Draft</Badge>;
      case "POSTPONED":
        return <Badge variant="warning">Postponed</Badge>;
      case "COMPLETED":
        return <Badge variant="success">Completed</Badge>;
      case "CANCELLED":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{projectStatus}</Badge>;
    }
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 80) return "bg-emerald-500";
    if (pct >= 50) return "bg-blue-500";
    if (pct >= 25) return "bg-amber-500";
    return "bg-slate-500";
  };

  return (
    <div className="container space-y-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Briefcase className="h-4 w-4" />
            <span>Workflow Repository System</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Project Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage customer workflow projects, track current stages, and monitor timeline progress.
          </p>
        </div>

        {userRole === "SALES" && (
          <Link href="/projects/new">
            <Button className="gap-2 shadow-md">
              <Plus className="h-4 w-4" />
              <span>Create Project</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Filter Tabs & Search Toolbar */}
      <div className="space-y-3">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {statuses.map((s) => (
            <Button
              key={s.key}
              variant={status === s.key ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs font-medium shrink-0"
              onClick={() => {
                setStatus(s.key);
                setPage(1);
              }}
            >
              {s.label}
            </Button>
          ))}
        </div>

        {/* Search & Scenario Filter */}
        <div className="grid gap-3 sm:grid-cols-12">
          <div className="relative sm:col-span-8">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 text-sm"
              placeholder="Search by project name or customer..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="sm:col-span-4">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={scenarioId}
              onChange={(event) => {
                setScenarioId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All Scenarios</option>
              {scenarios.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Projects Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-card/40 border border-border/40 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-16 text-center text-destructive">
            Failed to load projects. Please try again.
          </CardContent>
        </Card>
      ) : projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <FolderKanban className="h-10 w-10 text-muted-foreground mx-auto" />
            <div>
              <h3 className="text-base font-semibold text-foreground">No projects found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {userRole === "SALES"
                  ? "You haven't created any projects yet, or no projects match your filter criteria."
                  : "No projects match your current filter settings."}
              </p>
            </div>
            {userRole === "SALES" && (
              <Link href="/projects/new" className="inline-block pt-2">
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  <span>Create First Project</span>
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border/60">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/60 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3.5">Project & Customer</th>
                  <th className="px-4 py-3.5">Scenario</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5">Progress</th>
                  <th className="px-4 py-3.5">Current Stage</th>
                  <th className="px-4 py-3.5">Responsible</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {projects.map((project) => {
                  const progressPct = project.progress ?? (project.status === "COMPLETED" ? 100 : 0);
                  const totalMilestones = project.totalMilestones ?? 0;
                  const completedMilestones = project.completedMilestones ?? (project.status === "COMPLETED" ? totalMilestones : 0);
                  const currentStage = project.currentStage || (project.status === "DRAFT" ? "Project Plan Setup" : project.status === "COMPLETED" ? "Workflow Completed" : "-");
                  const currentRole = project.currentRole || (project.status === "DRAFT" ? "SALES" : project.pic?.full_name ? `SA (${project.pic.full_name})` : "-");

                  return (
                    <tr key={project.id} className="hover:bg-muted/20 transition duration-150">
                      {/* Project Name & Customer */}
                      <td className="px-4 py-4 min-w-[220px]">
                        <div className="space-y-0.5">
                          <Link
                            href={`/projects/${project.id}`}
                            className="font-semibold text-foreground hover:text-primary transition"
                          >
                            {project.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono">{project.id.slice(0, 8)}</span> • {project.customer}
                          </p>
                        </div>
                      </td>

                      {/* Scenario */}
                      <td className="px-4 py-4 min-w-[140px] text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{project.scenario?.name || "-"}</span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 text-center min-w-[100px]">
                        {getStatusBadge(project.status)}
                      </td>

                      {/* Progress Bar & Counter */}
                      <td className="px-4 py-4 min-w-[160px]">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-foreground">{progressPct}%</span>
                            {totalMilestones > 0 && (
                              <span className="text-muted-foreground font-mono text-[10px]">
                                {completedMilestones}/{totalMilestones} stages
                              </span>
                            )}
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${getProgressColor(progressPct)}`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Current Stage */}
                      <td className="px-4 py-4 min-w-[170px] text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">{currentStage}</span>
                        </div>
                      </td>

                      {/* Responsible Role */}
                      <td className="px-4 py-4 min-w-[140px] text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded bg-muted/40 px-2 py-0.5 font-medium text-foreground">
                          {currentRole}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-4 text-right">
                        <Link href={`/projects/${project.id}`}>
                          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs">
                            <span>Open</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
            <span>
              Showing <strong className="text-foreground">{projects.length}</strong> of{" "}
              <strong className="text-foreground">{pagination?.total || 0}</strong> projects
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={!pagination?.hasNextPage}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
