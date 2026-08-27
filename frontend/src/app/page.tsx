"use client";

import React from "react";
import Link from "next/link";
import {
  BarChart3,
  Layers,
  Activity,
  AlertTriangle,
  ShieldCheck,
  Clock,
  CheckCircle2,
  TrendingUp,
  ArrowUpRight,
  FolderKanban,
  Sparkles,
  PauseCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useDashboard } from "@/hooks/use-dashboard";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// Custom Recharts tooltip styling
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="font-mono">
          {entry.name}: <strong>{entry.value}</strong>
        </p>
      ))}
    </div>
  );
};

// Custom label for Pie chart
const renderPieLabel = ({ name, percent }: any) =>
  `${name} ${(percent * 100).toFixed(0)}%`;

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();

  const summary = data?.summary;
  const scenarioDistribution = data?.scenarioDistribution || [];
  const statusDistribution = data?.statusDistribution || [];
  const projectProgress = data?.projectProgress || [];
  const recentActivity = data?.recentActivity || [];

  const statusColors: Record<string, string> = {
    IN_PROGRESS: "#3b82f6",
    COMPLETED: "#22c55e",
    ON_HOLD: "#f59e0b",
    CANCELLED: "#ef4444",
  };

  const statusLabels: Record<string, string> = {
    IN_PROGRESS: "Active",
    COMPLETED: "Completed",
    ON_HOLD: "On Hold",
    CANCELLED: "Cancelled",
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 80) return "text-emerald-400";
    if (pct >= 50) return "text-blue-400";
    if (pct >= 25) return "text-amber-400";
    return "text-red-400";
  };

  const getProgressBarColor = (pct: number) => {
    if (pct >= 80) return "bg-emerald-500";
    if (pct >= 50) return "bg-blue-500";
    if (pct >= 25) return "bg-amber-500";
    return "bg-red-500";
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "APPROVE":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
      case "REJECT":
        return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />;
      case "UPLOAD_DOCUMENT":
        return <ArrowUpRight className="h-3.5 w-3.5 text-blue-400" />;
      default:
        return <Activity className="h-3.5 w-3.5 text-primary" />;
    }
  };

  if (isLoading) {
    return (
      <div className="container py-20 text-center text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
        <p className="font-medium">Loading Dashboard...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container py-20 text-center text-destructive">
        <AlertTriangle className="h-8 w-8 mx-auto mb-3" />
        <p className="font-medium">Failed to load dashboard data.</p>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            <Sparkles className="h-4 w-4" />
            <span>Workflow Repository Management System</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time operational metrics, project progression, and approval pipeline status.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <Link href="/approvals">
            <Button variant="outline" className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span>Approval Center</span>
            </Button>
          </Link>
          <Link href="/projects">
            <Button className="gap-2 shadow-md">
              <FolderKanban className="h-4 w-4" />
              <span>Projects</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* ─── KPI Summary Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Projects */}
        <Card className="bg-card/50 backdrop-blur border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Projects
            </CardTitle>
            <FolderKanban className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary?.totalProjects ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              All registered projects across scenarios
            </p>
          </CardContent>
        </Card>

        {/* Active Projects */}
        <Card className="bg-card/50 backdrop-blur border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Projects
            </CardTitle>
            <Activity className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-400">
              {summary?.activeProjects ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Currently in-progress workflows
            </p>
          </CardContent>
        </Card>

        {/* Overdue Milestones */}
        <Card className="bg-card/50 backdrop-blur border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Overdue Milestones
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-400">
              {summary?.overdueMilestones ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Stages past their deadline
            </p>
          </CardContent>
        </Card>

        {/* Waiting Approval */}
        <Card className="bg-card/50 backdrop-blur border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Waiting Approval
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-400">
              {summary?.waitingApproval ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pending Head SA sign-off
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Charts Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project by Scenario — Bar Chart */}
        <Card className="bg-card/50 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Project by Scenario</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Distribution of projects across workflow scenarios
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scenarioDistribution.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground">
                No scenario data available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={scenarioDistribution}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="scenarioName"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="count"
                    name="Projects"
                    fill="hsl(var(--primary))"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={60}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Project Status Distribution — Pie Chart */}
        <Card className="bg-card/50 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Status Distribution</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Current status breakdown across all projects
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusDistribution.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground">
                No projects to display.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statusDistribution.map((d) => ({
                      ...d,
                      name: statusLabels[d.status] || d.status,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={4}
                    dataKey="count"
                    label={renderPieLabel}
                    labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={statusColors[entry.status] || entry.color}
                        stroke="hsl(var(--card))"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Progress Project Table ─── */}
      <Card className="bg-card/50 backdrop-blur">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Project Progress Tracker</CardTitle>
            </div>
            <Link href="/projects">
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground hover:text-foreground">
                <span>View All</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
          <CardDescription className="text-xs">
            Active and on-hold projects with milestone completion percentage
          </CardDescription>
        </CardHeader>
        <CardContent>
          {projectProgress.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No active projects to track.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Table Header */}
              <div className="hidden sm:grid sm:grid-cols-12 gap-3 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-3 pb-1 border-b border-border/40">
                <div className="col-span-4">Project</div>
                <div className="col-span-2 text-center">Status</div>
                <div className="col-span-2 text-center">Milestones</div>
                <div className="col-span-3">Progress</div>
                <div className="col-span-1 text-center">Overdue</div>
              </div>

              {projectProgress.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center px-3 py-3 rounded-lg border border-border/40 hover:border-primary/40 hover:bg-muted/20 transition cursor-pointer">
                    {/* Project Name */}
                    <div className="col-span-4 space-y-0.5">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-mono">{p.projectCode}</span> • {p.clientName}
                      </p>
                    </div>

                    {/* Status */}
                    <div className="col-span-2 text-center">
                      <Badge
                        variant={
                          p.status === "IN_PROGRESS"
                            ? "default"
                            : p.status === "ON_HOLD"
                            ? "warning"
                            : "outline"
                        }
                        className="text-[10px]"
                      >
                        {statusLabels[p.status] || p.status}
                      </Badge>
                    </div>

                    {/* Milestones */}
                    <div className="col-span-2 text-center text-xs text-muted-foreground">
                      <span className="font-bold text-foreground">{p.completedMilestones}</span>
                      <span> / {p.totalMilestones}</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="col-span-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`font-bold ${getProgressColor(p.percentage)}`}>
                          {p.percentage}%
                        </span>
                        {p.targetEndDate && (
                          <span className="text-muted-foreground font-mono text-[10px]">
                            Due {new Date(p.targetEndDate).toLocaleDateString("id-ID", { dateStyle: "short" })}
                          </span>
                        )}
                      </div>
                      <div className="w-full h-2 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(p.percentage)}`}
                          style={{ width: `${p.percentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Overdue Count */}
                    <div className="col-span-1 text-center">
                      {p.overdueMilestones > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400">
                          <AlertTriangle className="h-3 w-3" />
                          {p.overdueMilestones}
                        </span>
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto" />
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Recent Activity Feed ─── */}
      <Card className="bg-card/50 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Latest actions across the workflow management system
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No activity recorded yet.
            </div>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border/30 hover:bg-muted/10 transition text-xs"
                >
                  <div className="mt-0.5">{getActionIcon(a.action)}</div>
                  <div className="flex-1 space-y-0.5">
                    <p className="text-foreground">
                      <span className="font-semibold">{a.user.fullName}</span>
                      <span className="text-muted-foreground"> ({a.user.role}) </span>
                      <span className="text-muted-foreground">{a.details}</span>
                    </p>
                    {a.project && (
                      <p className="text-[11px] text-muted-foreground">
                        Project: <span className="font-mono">{a.project.projectCode}</span> — {a.project.name}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {new Date(a.createdAt).toLocaleString("id-ID", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
