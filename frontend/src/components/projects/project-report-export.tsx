"use client";

import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2, ArrowDownToLine, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/components/i18n/language-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isCurrentSession } from '@/lib/auth';
import { SessionChangedError } from '@/lib/api-client';
import { loadProjectReport } from '@/lib/project-report-request';
import { createProjectReportBlob } from '@/lib/project-report-files';
import { projectReportFilename } from '@/lib/project-report';

export function ProjectReportExport({ projectId }: { projectId: string }) {
  const { locale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<'xlsx' | 'pdf' | null>(null);
  const [feedback, setFeedback] = useState<'ready' | 'failed' | null>(null);
  const operation = useRef<AbortController | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  useEffect(() => () => { operation.current?.abort(); operation.current = null; }, [projectId]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    firstChoice.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { operation.current?.abort(); setOpen(false); }
      if (event.key !== 'Tab') return;
      // Include the shared Dialog's close button in the focus loop.
      const buttons = Array.from(content.current?.parentElement?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open]);

  const close = () => { operation.current?.abort(); setOpen(false); };
  const download = async (format: 'xlsx' | 'pdf') => {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    setPending(format); setFeedback(null);
    try {
      const { report, session } = await loadProjectReport(projectId, locale, controller.signal);
      const blob = await createProjectReportBlob(report, format);
      controller.signal.throwIfAborted();
      if (!isCurrentSession(session)) throw new SessionChangedError();
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = projectReportFilename(report, format);
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setFeedback('ready');
    } catch {
      if (!controller.signal.aborted) setFeedback('failed');
    } finally {
      if (operation.current === controller) { operation.current = null; setPending(null); }
    }
  };

  return <>
    <Button size="sm" variant="outline" className="h-9 gap-2 rounded-lg" onClick={() => { setFeedback(null); setOpen(true); }}>
      <Download className="h-4 w-4" aria-hidden="true" />{t('reportExport.button')}
    </Button>
    <Dialog open={open} onOpenChange={value => value ? setOpen(true) : close()}>
      <div ref={content} role="dialog" aria-modal="true" aria-label={t('reportExport.button')}>
        <DialogHeader>
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-primary"><Download className="h-5 w-5" aria-hidden="true" /></span>
          <DialogTitle>{t('reportExport.button')}</DialogTitle>
          <DialogDescription>{t('reportExport.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {(['xlsx', 'pdf'] as const).map(format => {
            const Icon = format === 'xlsx' ? FileSpreadsheet : FileText;
            return <button key={format} ref={format === 'xlsx' ? firstChoice : undefined} type="button" data-report-format={format} disabled={pending !== null}
              onClick={() => void download(format)} className="group flex w-full items-center gap-3 rounded-xl border border-border bg-white p-4 text-left transition hover:border-primary/50 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60">
              <span className={`rounded-lg p-2.5 ${format === 'xlsx' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{t(format === 'xlsx' ? 'reportExport.excel' : 'reportExport.pdf')}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{t(format === 'xlsx' ? 'reportExport.excelHelp' : 'reportExport.pdfHelp')}</span></span>
              {pending === format ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" /> : <ArrowDownToLine className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />}
            </button>;
          })}
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">{t('reportExport.scope')}</p>
        {pending && <p role="status" className="mt-3 text-sm text-primary">{t('reportExport.preparing')}</p>}
        {feedback && <p role={feedback === 'failed' ? 'alert' : 'status'} className={`mt-3 flex items-center gap-2 text-sm ${feedback === 'failed' ? 'text-destructive' : 'text-emerald-700'}`}>{feedback === 'ready' && <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}{t(`reportExport.${feedback}`)}</p>}
        {pending && <Button variant="ghost" size="sm" className="mt-3" onClick={close}>{t('reportExport.cancel')}</Button>}
      </div>
    </Dialog>
  </>;
}
