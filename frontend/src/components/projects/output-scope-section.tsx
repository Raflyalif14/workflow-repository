"use client";
import { BusinessConfirmation } from "./business-confirmation";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOutputDocuments, useUpdateOutputChecklist } from "@/hooks/use-output-documents";
import { translate, translateOutputName } from "@/i18n";
import type { Project } from "@/types/project";

export function OutputScopeSection({ project }: { project: Project }) {
  useLanguage();
  const { user } = useAuth();
  const output = useOutputDocuments(project.id);
  const update = useUpdateOutputChecklist(project.id);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dirty, setDirty] = useState(false);
  const phaseKey = project.phases?.find(phase => phase.id === project.active_phase_id)?.phase_key;
  const documents = (output.data?.documents || []).filter(item => !phaseKey || item.group === phaseKey);
  const identity = `${project.id}/${project.active_phase_id || "legacy"}`;
  const previousIdentity = useRef(identity);
  useEffect(() => { if (previousIdentity.current !== identity) { previousIdentity.current = identity; setDirty(false); setConfirming(false); setError(null); } }, [identity]);
  const editable = user?.role === "SALES" && user.id === project.sales_id
    && project.status === "DRAFT" && !output.data?.isScopeLocked;

  useEffect(() => {
    if (output.data && !dirty) setSelected(output.data.documents.filter((item) => item.isSelected && (!phaseKey || item.group === phaseKey)).map((item) => item.key));
  }, [output.data, phaseKey, dirty]);

  const save = async () => {
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync(selected);
      setSaved(true); setDirty(false);
    } catch (cause) {
      setError("outputScope.saveFailed"); throw cause;
    }
  };

  return <Card>
    <CardHeader>
      <CardTitle className="text-base">{translate("outputScope.title")}</CardTitle>
      <CardDescription>{translate("outputScope.help")}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {output.isLoading && <p className="text-sm text-muted-foreground">{translate("outputScope.loading")}</p>}
      {output.isError && <p className="text-sm text-destructive">{translate("outputScope.loadFailed")}</p>}
      {!output.isLoading && !output.isError && <div className="grid gap-2 sm:grid-cols-2">
        {documents.map((item) => <label key={item.key} className="flex items-center gap-3 rounded-md border border-border/60 p-3 text-sm">
          <input type="checkbox" checked={item.isRequired || selected.includes(item.key)}
            disabled={!editable || item.isRequired || update.isPending}
            onChange={() => { update.prepare?.(); setDirty(true); setSelected((current) => current.includes(item.key)
              ? current.filter((key) => key !== item.key) : [...current, item.key]); }}
            aria-label={translateOutputName(item.key, item.name)} className="h-4 w-4 accent-primary" />
          <span className="min-w-0 flex-1">{translateOutputName(item.key, item.name)}</span>
          <Badge variant="secondary">{translate(item.isRequired ? "outputScope.required" : "outputScope.optional")}</Badge>
        </label>)}
      </div>}
      {output.data?.isScopeLocked && <p className="text-sm text-muted-foreground">{translate("outputScope.locked")}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{translate("outputScope.saveFailed")}</p>}
      {saved && <p role="status" className="text-sm text-emerald-500">{translate("outputScope.saved")}</p>}
      {editable && <Button type="button" disabled={update.isPending || output.isLoading || output.isError}
        onClick={() => setConfirming(true)}>{translate("outputScope.save")}</Button>}
      <BusinessConfirmation open={confirming} onOpenChange={setConfirming} title={project.name}
        changes={[translate("businessAudit.scope"), documents.filter(item => item.isSelected).map(item => translateOutputName(item.key,item.name)).join(", ") + " -> " + documents.filter(item => item.isRequired || selected.includes(item.key)).map(item => translateOutputName(item.key,item.name)).join(", ")]}
        action={translate("businessAudit.save")} onConfirm={save} />
    </CardContent>
  </Card>;
}
