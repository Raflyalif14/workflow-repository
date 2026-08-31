"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useCreateProject } from "@/hooks/use-projects";
import { useScenarios } from "@/hooks/use-scenarios";

export default function NewProjectPage() {
  const router = useRouter(); const { user } = useAuth(); const { data: scenarios = [], isLoading } = useScenarios(); const create = useCreateProject();
  const [name, setName] = useState(""); const [customer, setCustomer] = useState(""); const [scenario_id, setScenarioId] = useState("");
  if (!user || user.role !== "SALES") return <div className="container py-12 text-center text-destructive">You do not have permission to create projects.</div>;
  const submit = async () => { if (!name.trim() || !customer.trim() || !scenario_id) return; const project = await create.mutateAsync({ name, customer, scenario_id }); router.push(`/projects/${project.id}`); };
  return <div className="container max-w-2xl space-y-6 py-8"><Button variant="ghost" className="gap-2" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" />Back</Button><Card><CardHeader><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><Briefcase className="h-4 w-4" />New Project</div><CardTitle>Create Project</CardTitle></CardHeader><CardContent className="space-y-4"><div><label className="mb-1 block text-sm font-medium">Project Name</label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Sistem Tiket" /></div><div><label className="mb-1 block text-sm font-medium">Customer</label><Input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="PT ABC" /></div><div><label className="mb-1 block text-sm font-medium">Scenario</label><select className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" value={scenario_id} onChange={(event) => setScenarioId(event.target.value)} disabled={isLoading}><option value="">Select active scenario</option>{scenarios.filter((scenario) => scenario.is_active).map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></div><Button onClick={() => void submit()} disabled={create.isPending || !name.trim() || !customer.trim() || !scenario_id}>{create.isPending ? "Creating..." : "Create Project"}</Button></CardContent></Card></div>;
}
