"use client";

import { translate as translateI18n, getIntlLocale } from "@/i18n";

import { useState } from "react";
import Link from "next/link";
import { Plus, Workflow, ArrowRight, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RoleGuard } from "@/components/auth/role-guard";
import { useAuth } from "@/components/auth/auth-provider";
import { useCreateScenario, useScenarios, useUpdateScenario, useUpdateScenarioStatus } from "@/hooks/use-scenarios";
import { SYSTEM_SETTINGS_ALLOWED_ROLES } from "@/lib/settings-access";

export default function WorkflowManagementPage() {
  return <RoleGuard allowedRoles={SYSTEM_SETTINGS_ALLOWED_ROLES}><WorkflowManagement /></RoleGuard>;
}

function WorkflowManagement() {
  const { user } = useAuth();
  const { data: scenarios = [], isLoading, isError } = useScenarios();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const create = useCreateScenario();
  const isAdmin = user?.role === "SUPER_ADMIN";
  const visible = scenarios.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  const submit = async () => { if (!name.trim()) return; await create.mutateAsync({ name, description }); setName(""); setDescription(""); setShowCreate(false); };

  return <div className="container space-y-6 py-8">
    <div className="flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><Workflow className="h-4 w-4" />{translateI18n("settings.workflowTemplates")}</div><h1 className="text-3xl font-bold tracking-tight">{translateI18n("copy.workflowManagement")}</h1><p className="mt-1 text-sm text-muted-foreground">{translateI18n("copy.manageScenario")}</p></div>
      {isAdmin && <Button onClick={() => setShowCreate(!showCreate)} className="gap-2"><Plus className="h-4 w-4" />{translateI18n("copy.newScenario")}</Button>}
    </div>
    {showCreate && isAdmin && <Card><CardHeader><CardTitle className="text-base">{translateI18n("copy.createScenario")}</CardTitle></CardHeader><CardContent className="space-y-3"><Input placeholder={translateI18n("ui.scenarioName")} value={name} onChange={(event) => setName(event.target.value)} /><Input placeholder={translateI18n("ui.description")} value={description} onChange={(event) => setDescription(event.target.value)} /><Button onClick={() => void submit()} disabled={create.isPending || !name.trim()}>{translateI18n("copy.createScenario")}</Button></CardContent></Card>}
    <Input placeholder="Search scenarios" value={search} onChange={(event) => setSearch(event.target.value)} />
    {isLoading ? <p className="py-12 text-center text-muted-foreground">{translateI18n("copy.loadingScenarios")}</p> : isError ? <p className="py-12 text-center text-destructive">{translateI18n("copy.scenarioLoadError")}</p> : visible.length === 0 ? <Card><CardContent className="py-12 text-center"><p className="font-medium">{translateI18n("copy.noScenarios")}</p><p className="mt-1 text-sm text-muted-foreground">{translateI18n("copy.createFirstScenario")}</p></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2">{visible.map((scenario) => <ScenarioCard key={scenario.id} scenario={scenario} isAdmin={isAdmin} />)}</div>}
  </div>;
}

function ScenarioCard({ scenario, isAdmin }: { scenario: any; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(scenario.name);
  const [description, setDescription] = useState(scenario.description || "");
  const update = useUpdateScenario(scenario.id);
  const updateStatus = useUpdateScenarioStatus(scenario.id);
  return <Card><CardHeader className="flex flex-row items-start justify-between space-y-0"><div className="min-w-0 flex-1">{editing ? <div className="space-y-2"><Input value={name} onChange={(event) => setName(event.target.value)} /><Input value={description} onChange={(event) => setDescription(event.target.value)} /></div> : <><CardTitle className="text-lg">{scenario.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{scenario.description || translateI18n("ui.noDescription")}</p></>}</div><Badge variant={scenario.is_active ? "success" : "outline"}>{translateI18n(scenario.is_active ? "common.active" : "common.inactive")}</Badge></CardHeader><CardContent><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{translateI18n("ui.steps", { count: scenario.total_steps })}</span><span>{new Date(scenario.created_at).toLocaleDateString(getIntlLocale())}</span></div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/settings/workflows/${scenario.id}`}><Button variant="outline" className="gap-2">{translateI18n("copy.manageWorkflow")}<ArrowRight className="h-4 w-4" /></Button></Link>{isAdmin && (editing ? <Button onClick={() => { update.mutate({ name, description }); setEditing(false); }} disabled={update.isPending}>{translateI18n("common.save")}</Button> : <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>{translateI18n("common.edit")}</Button>)}{isAdmin && <Button variant="ghost" size="icon" title={translateI18n(scenario.is_active ? "ui.deactivate" : "ui.activate")} onClick={() => updateStatus.mutate({ is_active: !scenario.is_active })}><Power className="h-4 w-4" /></Button>}</div></CardContent></Card>;
}
