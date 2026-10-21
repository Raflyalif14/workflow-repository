"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { translate, translateStoredError } from "@/i18n";
import { Button } from "@/components/ui/button";

export interface ProjectCreateActionsProps {
  isPending: boolean;
  creationFrozen: boolean;
  creationRequestId?: string;
  submitError: string | null;
  fileSelectionError: string | null;
  onCancel: () => void;
  disabled?: boolean;
}

export function ProjectCreateActions({
  isPending,
  creationFrozen,
  creationRequestId,
  submitError,
  fileSelectionError,
  onCancel,
  disabled = false,
}: ProjectCreateActionsProps) {
  const isSubmitDisabled = disabled || isPending || Boolean(fileSelectionError);

  return (
    <div className="border-t border-border bg-muted/15 px-5 py-5 sm:px-7">
      {creationFrozen && (
        <p className="mb-3 text-sm text-muted-foreground">
          {translate("createReceipt.locked")}
          {creationRequestId && (
            <span className="mt-1 block break-all font-mono text-xs">
              {translate("createReceipt.operation", { id: creationRequestId })}
            </span>
          )}
        </p>
      )}

      {submitError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{translateStoredError(submitError)}</span>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={onCancel}
          disabled={isPending}
        >
          {translate("common.cancel")}
        </Button>
        <Button
          type="submit"
          className="w-full gap-2 sm:w-auto"
          disabled={isSubmitDisabled}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {translate("projectCreate.creating")}
            </>
          ) : (
            translate(creationFrozen ? "createReceipt.retry" : "project.create")
          )}
        </Button>
      </div>
    </div>
  );
}
