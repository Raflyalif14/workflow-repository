"use client";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { translate, type TranslationKey } from "@/i18n";

export function BusinessConfirmation({ open, onOpenChange, title, changes, action, onConfirm, errorKey, allowConflictRetry = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string;
  changes: string[]; action: string; onConfirm: () => Promise<unknown>;
  errorKey?: TranslationKey; allowConflictRetry?: boolean;
}) {
  useLanguage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"businessAudit.failed" | "businessAudit.stale" | null>(null);
  const busy = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) { setError(null); return; }
    const previous = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => previous?.focus();
  }, [open]);
  const save = async () => {
    if (busy.current || error === "businessAudit.stale") return;
    busy.current = true; setPending(true); setError(null);
    try { await onConfirm(); onOpenChange(false); }
    catch (cause) { setError((cause as { status?: number })?.status === 409 && !allowConflictRetry ? "businessAudit.stale" : "businessAudit.failed"); }
    finally { busy.current = false; setPending(false); }
  };
  return <Dialog open={open} onOpenChange={value => !busy.current && onOpenChange(value)}>
    <div ref={container} role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => {
      if (event.key === "Escape" && !busy.current) onOpenChange(false);
      if (event.key === "Tab") {
        const buttons = container.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) return;
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
        if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus(); }
      }
    }}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{translate("businessAudit.check")}</DialogDescription></DialogHeader>
      <ul className="mb-4 max-h-64 space-y-2 overflow-y-auto break-words text-sm">{changes.map((change,index) => <li key={index} className="whitespace-pre-wrap">{change}</li>)}</ul>
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{translate(errorKey || error)}</p>}
      <DialogFooter><Button ref={cancel} type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>{translate("common.cancel")}</Button>
        <Button type="button" disabled={pending || error === "businessAudit.stale"} onClick={() => void save()}>{pending ? translate("common.saving") : action}</Button></DialogFooter>
    </div>
  </Dialog>;
}
