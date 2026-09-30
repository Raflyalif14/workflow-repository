"use client";

import { useEffect, useState } from "react";
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
  const documents = output.data?.documents || [];
  const editable = user?.role === "SALES" && user.id === project.sales_id
    && project.status === "DRAFT" && !output.data?.isScopeLocked;

  useEffect(() => {
    if (output.data) setSelected(output.data.documents.filter((item) => item.isSelected).map((item) => item.key));
  }, [output.data]);

  const save = async () => {
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync(selected);
      setSaved(true);
    } catch (cause) {
      setError("outputScope.saveFailed");
    }
  };

  return <Card className="border-border/60 bg-card/70 shadow-none">
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
            onChange={() => setSelected((current) => current.includes(item.key)
              ? current.filter((key) => key !== item.key) : [...current, item.key])}
            aria-label={translateOutputName(item.key, item.name)} className="h-4 w-4 accent-primary" />
          <span className="min-w-0 flex-1">{translateOutputName(item.key, item.name)}</span>
          <Badge variant="secondary">{translate(item.isRequired ? "outputScope.required" : "outputScope.optional")}</Badge>
        </label>)}
      </div>}
      {output.data?.isScopeLocked && <p className="text-sm text-muted-foreground">{translate("outputScope.locked")}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{translate("outputScope.saveFailed")}</p>}
      {saved && <p role="status" className="text-sm text-emerald-500">{translate("outputScope.saved")}</p>}
      {editable && <Button type="button" disabled={update.isPending || output.isLoading || output.isError}
        onClick={() => void save()}>{translate("outputScope.save")}</Button>}
    </CardContent>
  </Card>;
}
