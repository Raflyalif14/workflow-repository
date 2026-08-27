"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, CirclePlay, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useProject, useProjectMilestones, useProjectProgress, useInitializeWorkflow, useTriggerProjectMilestone, useStartProjectMilestone, useCompleteProjectMilestone } from "@/hooks/use-projects";
import { ProjectMilestonePhase4 } from "@/types/project";
import { PicAssignmentCard } from "@/components/projects/pic-assignment-card";
import { AssignmentHistoryCard } from "@/components/projects/assignment-history-card";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: project, isLoading: projectLoading, isError } = useProject(id);
  const { data: milestones = [], isLoading: milestonesLoading } = useProjectMilestones(id);
  const { data: progress } = useProjectProgress(id);
  const initialize = useInitializeWorkflow(id);
  const canOperate = user?.role === "SUPER_ADMIN" || (user?.role === "SALES" && project?.sales_id === user.id);

  if (projectLoading) return <p className="container py-12 text-center text-muted-foreground">Loading project...</p>;
  if (isError || !project) return <p className="container py-12 text-center text-destructive">Project not found.</p>;

  return <div className="container space-y-6 py-8">
    <Button variant="ghost" className="gap-2" onClick={() => router.push("/projects")}><ArrowLeft className="h-4 w-4" />Projects</Button>
    <div className="flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-3xl font-bold tracking-tight">{project.name}</h1><p className="mt-1 text-sm text-muted-foreground">{project.customer} | {project.scenario?.name || "No scenario"}</p></div>{canOperate && milestones.length === 0 && <Button onClick={() => initialize.mutate()} disabled={initialize.isPending}>{initialize.isPending ? "Initializing..." : "Initialize Workflow"}</Button>}</div>
    <div className="grid gap-4 sm:grid-cols-3"><Info label="Scenario" value={project.scenario?.name || "-"} /><Info label="Sales" value={project.sales?.full_name || project.sales?.fullName || "-"} /><Info label="Status" value={project.status} badge /></div><div className="grid gap-6 lg:grid-cols-2"><PicAssignmentCard project={project} canAssign={user?.role === "HEAD_SA"} /><AssignmentHistoryCard projectId={id} /></div>
    <Card><CardHeader><CardTitle className="text-base">Workflow Progress</CardTitle></CardHeader><CardContent><div className="flex items-end justify-between"><span className="text-2xl font-bold">{progress?.completed || 0} / {progress?.total || milestones.length} Steps</span><span className="font-mono text-primary">{progress?.percentage || 0}%</span></div><div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress?.percentage || 0}%` }} /></div></CardContent></Card>
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]"><Card><CardHeader><CardTitle className="text-base">Workflow Milestones</CardTitle></CardHeader><CardContent className="space-y-3">{milestonesLoading ? <p className="py-8 text-center text-muted-foreground">Loading milestones...</p> : milestones.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No workflow milestones. Initialize the workflow to create them.</p> : milestones.map((milestone) => <MilestoneRow key={milestone.id} milestone={milestone} canOperate={canOperate} projectId={id} />)}</CardContent></Card><Card><CardHeader className="flex flex-row items-center gap-2"><Activity className="h-4 w-4 text-primary" /><CardTitle className="text-base">Activity Log</CardTitle></CardHeader><CardContent className="space-y-3">{project.activity_logs?.length ? project.activity_logs.map((log) => <div key={log.id} className="border-b border-border/40 pb-2 text-sm"><p>{log.details}</p><p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p></div>) : <p className="text-sm text-muted-foreground">No activity logs recorded yet.</p>}</CardContent></Card></div>
  </div>;
}

function MilestoneRow({ milestone, canOperate, projectId }: { milestone: ProjectMilestonePhase4; canOperate: boolean; projectId: string }) {
  const trigger = useTriggerProjectMilestone(projectId, milestone.id); const start = useStartProjectMilestone(projectId, milestone.id); const complete = useCompleteProjectMilestone(projectId, milestone.id);
  const picLabel = milestone.pic?.full_name || (milestone.workflow_stage?.default_role === "SALES" ? "Sales / Project Owner" : null);
  return <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{String(milestone.step_order).padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="font-medium">{milestone.name}</p><p className="text-xs text-muted-foreground">{milestone.description || "No description"}</p>{picLabel && <p className="mt-1 text-xs text-muted-foreground">PIC: <span className="text-foreground">{picLabel}</span></p>}</div><Badge variant={milestone.status === "COMPLETED" ? "success" : milestone.status === "IN_PROGRESS" ? "warning" : "outline"}>{milestone.status}</Badge>{canOperate && milestone.status === "PENDING" && <Button size="sm" onClick={() => trigger.mutate()} disabled={trigger.isPending}><CirclePlay className="mr-1 h-3.5 w-3.5" />Trigger</Button>}{canOperate && milestone.status === "TRIGGERED" && <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending}>Start</Button>}{canOperate && milestone.status === "IN_PROGRESS" && <Button size="sm" onClick={() => complete.mutate()} disabled={complete.isPending}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Complete</Button>}</div>;
}
function Info({ label, value, badge }: { label: string; value: string; badge?: boolean }) { return <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>{badge ? <Badge className="mt-2" variant={value === "ACTIVE" ? "success" : "outline"}>{value}</Badge> : <p className="mt-2 text-lg font-semibold">{value}</p>}</CardContent></Card>; }
