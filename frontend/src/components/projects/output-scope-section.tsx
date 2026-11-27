"use client";
import { BusinessConfirmation } from "./business-confirmation";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOutputDocuments, useUpdateOutputChecklist } from "@/hooks/use-output-documents";
import { translate, translateOutputName } from "@/i18n";
import type { Project } from "@/types/project";

function useOutputScopeState(project: Project, onSaved?: () => Promise<unknown> | void) {
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

  const resetDraft = useCallback(() => {
    setDirty(false);
    setConfirming(false);
    setError(null);
    setSaved(false);
    if (output.data) {
      setSelected(output.data.documents.filter((item) => item.isSelected && (!phaseKey || item.group === phaseKey)).map((item) => item.key));
    }
  }, [output.data, phaseKey]);

  const save = async () => {
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync(selected);
      setSaved(true); setDirty(false);
      await onSaved?.();
    } catch (cause) {
      setError("outputScope.saveFailed"); throw cause;
    }
  };

  const auditChanges = [
    translate("businessAudit.scope"),
    documents.filter(item => item.isSelected).map(item => translateOutputName(item.key, item.name)).join(", ")
      + " -> "
      + documents.filter(item => item.isRequired || selected.includes(item.key)).map(item => translateOutputName(item.key, item.name)).join(", "),
  ];

  return {
    output, update, documents, selected, setSelected,
    error, saved, confirming, setConfirming, setDirty,
    editable, save, resetDraft, auditChanges,
  };
}

function OutputScopeFormBody({
  scope,
  onCancel,
  showSavedStatus = true,
}: {
  scope: ReturnType<typeof useOutputScopeState>;
  onCancel?: () => void;
  showSavedStatus?: boolean;
}) {
  const { output, update, documents, selected, setSelected, error, saved, setConfirming, setDirty, editable } = scope;

  return (
    <div className="space-y-4">
      {output.isLoading && <p className="text-sm text-muted-foreground">{translate("outputScope.loading")}</p>}
      {output.isError && <p className="text-sm text-destructive">{translate("outputScope.loadFailed")}</p>}
      {!output.isLoading && !output.isError && (
        <div className="grid gap-2 sm:grid-cols-2">
          {documents.map((item) => (
            <label key={item.key} className="flex items-center gap-3 rounded-md border border-border/60 p-3 text-sm">
              <input
                type="checkbox"
                checked={item.isRequired || selected.includes(item.key)}
                disabled={!editable || item.isRequired || update.isPending}
                onChange={() => {
                  update.prepare?.();
                  setDirty(true);
                  setSelected((current) =>
                    current.includes(item.key)
                      ? current.filter((key) => key !== item.key)
                      : [...current, item.key]
                  );
                }}
                aria-label={translateOutputName(item.key, item.name)}
                className="h-4 w-4 accent-primary"
              />
              <span className="min-w-0 flex-1">{translateOutputName(item.key, item.name)}</span>
              <Badge variant="secondary">{translate(item.isRequired ? "outputScope.required" : "outputScope.optional")}</Badge>
            </label>
          ))}
        </div>
      )}
      {output.data?.isScopeLocked && <p className="text-sm text-muted-foreground">{translate("outputScope.locked")}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{translate("outputScope.saveFailed")}</p>}
      {showSavedStatus && saved && <p role="status" className="text-sm text-emerald-500">{translate("outputScope.saved")}</p>}
      {(editable || onCancel) && (
        <div className={onCancel ? "flex items-center justify-end gap-2 pt-2" : ""}>
          {onCancel && (
            <Button type="button" variant="outline" disabled={update.isPending} onClick={onCancel}>
              {translate("common.cancel")}
            </Button>
          )}
          {editable && (
            <Button
              type="button"
              disabled={update.isPending || output.isLoading || output.isError}
              onClick={() => setConfirming(true)}
            >
              {translate("outputScope.save")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function OutputScopeSection({ project }: { project: Project }) {
  const scope = useOutputScopeState(project);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{translate("outputScope.title")}</CardTitle>
        <CardDescription>{translate("outputScope.help")}</CardDescription>
      </CardHeader>
      <CardContent>
        <OutputScopeFormBody scope={scope} />
        <BusinessConfirmation
          open={scope.confirming}
          onOpenChange={scope.setConfirming}
          title={project.name}
          changes={scope.auditChanges}
          action={translate("businessAudit.save")}
          onConfirm={scope.save}
        />
      </CardContent>
    </Card>
  );
}

export function OutputScopeDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onSaved?: () => Promise<unknown> | void;
}) {
  const scope = useOutputScopeState(project, async () => {
    await onSaved?.();
    onOpenChange(false);
  });

  useEffect(() => {
    if (!open) scope.resetDraft();
  }, [open, scope.resetDraft]);

  return (
    <>
      <Dialog
        open={open && !scope.confirming}
        onOpenChange={(nextOpen) => {
          if (!scope.update.isPending) onOpenChange(nextOpen);
        }}
        contentClassName="max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{translate("outputScope.title")}</DialogTitle>
          <DialogDescription>{translate("outputScope.help")}</DialogDescription>
        </DialogHeader>
        <OutputScopeFormBody
          scope={scope}
          onCancel={() => onOpenChange(false)}
          showSavedStatus={false}
        />
      </Dialog>
      <BusinessConfirmation
        open={open && scope.confirming}
        onOpenChange={scope.setConfirming}
        title={project.name}
        changes={scope.auditChanges}
        action={translate("businessAudit.save")}
        onConfirm={scope.save}
      />
    </>
  );
}
