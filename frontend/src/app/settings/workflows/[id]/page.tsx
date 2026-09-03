"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { GripVertical, Plus, Pencil, Power, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RoleGuard } from "@/components/auth/role-guard";
import { useAuth } from "@/components/auth/auth-provider";
import { useCreateStage, useDeleteStage, useReorderStages, useUpdateStage, useWorkflow } from "@/hooks/use-scenarios";
import { ScenarioRole, WorkflowStage } from "@/types/scenario";
import { SYSTEM_SETTINGS_ALLOWED_ROLES } from "@/lib/settings-access";

export default function WorkflowDetailPage() { return <RoleGuard allowedRoles={SYSTEM_SETTINGS_ALLOWED_ROLES}><WorkflowDetail /></RoleGuard>; }
function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, isLoading, isError } = useWorkflow(id);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [role, setRole] = useState<ScenarioRole>("SA"); const [duration, setDuration] = useState("0");
  const [dragged, setDragged] = useState<string | null>(null);
  const create = useCreateStage(id); const reorder = useReorderStages(id); const isAdmin = user?.role === "SUPER_ADMIN";
  if (isLoading) return <p className="container py-12 text-center text-muted-foreground">Loading workflow...</p>;
  if (isError || !data) return <p className="container py-12 text-center text-destructive">Workflow not found.</p>;
  const stages = data.stages.filter((stage) => stage.is_active);
  const add = async () => { if (!name.trim()) return; await create.mutateAsync({ name, description, default_role: role, default_duration_working_days: Number(duration), is_required: true }); setName(""); setDescription(""); setShowAdd(false); };
  const move = async (targetId: string) => { if (!dragged || dragged === targetId || !isAdmin) return; const next = [...stages]; const from = next.findIndex((stage) => stage.id === dragged); const to = next.findIndex((stage) => stage.id === targetId); const [item] = next.splice(from, 1); next.splice(to, 0, item); await reorder.mutateAsync({ stages: next.map((stage, index) => ({ id: stage.id, step_order: index + 1 })) }); setDragged(null); };
  return <div className="container space-y-6 py-8"><div className="flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-3xl font-bold tracking-tight">{data.scenario.name}</h1><p className="mt-1 text-sm text-muted-foreground">{stages.length} workflow stages</p></div>{isAdmin && <Button onClick={() => setShowAdd(!showAdd)} className="gap-2"><Plus className="h-4 w-4" />Add Stage</Button>}</div>
    {showAdd && isAdmin && <Card><CardHeader><CardTitle className="text-base">Add Workflow Stage</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Input placeholder="Stage name" value={name} onChange={(event) => setName(event.target.value)} /><Input placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} /><select className="h-9 rounded-md border border-input bg-card px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value as ScenarioRole)}><option value="SUPER_ADMIN">SUPER_ADMIN</option><option value="SALES">SALES</option><option value="HEAD_SA">HEAD_SA</option><option value="SA">SA</option></select><Input type="number" min="0" placeholder="Working days" value={duration} onChange={(event) => setDuration(event.target.value)} /><Button onClick={() => void add()} disabled={create.isPending || !name.trim()} className="sm:col-span-2">Save Stage</Button></CardContent></Card>}
    {stages.length === 0 ? <Card><CardContent className="py-12 text-center"><p className="font-medium">No workflow stages</p><p className="mt-1 text-sm text-muted-foreground">Add the first stage to this scenario.</p></CardContent></Card> : <div className="space-y-3">{stages.map((stage) => <StageRow key={stage.id} stage={stage} isAdmin={isAdmin} onDragStart={() => setDragged(stage.id)} onDrop={() => void move(stage.id)} />)}</div>}
  </div>;
}
function StageRow({ stage, isAdmin, onDragStart, onDrop }: { stage: WorkflowStage; isAdmin: boolean; onDragStart: () => void; onDrop: () => void }) {
  const [editing, setEditing] = useState(false); const [name, setName] = useState(stage.name); const [role, setRole] = useState(stage.default_role); const update = useUpdateStage(stage.id); const remove = useDeleteStage(stage.id);
  const save = async () => { await update.mutateAsync({ name, default_role: role }); setEditing(false); };
  return <Card draggable={isAdmin} onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><CardContent className="flex items-center gap-3 py-4"><GripVertical className="h-5 w-5 shrink-0 text-muted-foreground" /><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{stage.step_order}</span>{editing && isAdmin ? <div className="flex flex-1 gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} /><select className="rounded-md border border-input bg-card px-2 text-xs" value={role} onChange={(event) => setRole(event.target.value as ScenarioRole)}><option>SUPER_ADMIN</option><option>SALES</option><option>HEAD_SA</option><option>SA</option></select><Button size="icon" onClick={() => void save()}><Save className="h-4 w-4" /></Button></div> : <div className="min-w-0 flex-1"><p className="font-medium">{stage.name}</p><p className="truncate text-xs text-muted-foreground">{stage.description || "No description"}</p></div>}<Badge variant="outline">{stage.default_role}</Badge>{isAdmin && !editing && <><Button variant="ghost" size="icon" title="Edit stage" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Deactivate stage" onClick={() => remove.mutate({})}><Power className="h-4 w-4" /></Button></>}</CardContent></Card>;
}
