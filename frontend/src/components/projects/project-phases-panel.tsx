"use client";
import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/i18n/language-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useClosePraTender, useContinueTenderPhase } from '@/hooks/use-projects';
import { getScenarioDocuments } from '@/constants/scenarios';
import { canContinueTenderPhase, isPraTenderDecisionPending, isProjectClosedAtPraTender, runConfirmedDecision } from '@/lib/phase-review';
import { formatDate, translate, translateOutputName } from '@/i18n';
import type { Project } from '@/types/project';

export function ProjectPhasesPanel({ project, role, userId }: { project: Project; role?: string; userId?: string }) {
  useLanguage();
  const [dialog, setDialog] = useState<'tender' | 'close' | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const mutation = useContinueTenderPhase(project.id);
  const closeMutation = useClosePraTender(project.id);
  const active = project.phases?.find(phase => phase.id === project.active_phase_id);
  const pending = mutation.isPending || closeMutation.isPending;
  const deciding = isPraTenderDecisionPending(project);
  const closed = isProjectClosedAtPraTender(project);
  const canDecide = canContinueTenderPhase(project, role, userId);
  useEffect(() => {
    const focusPanel = () => {
      if (window.location.hash !== '#project-phase-panel') return;
      const panel = document.getElementById('project-phase-panel');
      panel?.scrollIntoView({ block: 'start' });
      panel?.focus({ preventScroll: true });
    };
    focusPanel();
    window.addEventListener('hashchange', focusPanel);
    return () => window.removeEventListener('hashchange', focusPanel);
  }, [project.id]);
  if (!active) return project.phase_migration_state === 'LEGACY_REVIEW'
    ? <p className="text-sm text-muted-foreground">{translate('projectPhase.legacy')}</p> : null;
  const openDialog = (value: 'tender' | 'close') => { setError(false); setDialog(value); };
  const save = async () => {
    if (!canDecide || pending || !dialog) return;
    setError(false);
    try {
      await runConfirmedDecision({ confirmed: true, current: canDecide }, async () => {
        if (dialog === 'tender') await mutation.mutateAsync(keys);
        else await closeMutation.mutateAsync();
      });
      setDialog(null);
      window.location.hash = 'project-phase-panel';
      document.getElementById('project-phase-panel')?.focus();
    } catch { setError(true); }
  };
  return <section tabIndex={-1} id="project-phase-panel" className="scroll-mt-20 space-y-2 rounded-md border border-border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <h2 className="text-sm font-semibold">{translate(closed ? 'projectPhase.closed' : deciding ? 'projectPhase.praCompleted' : 'projectPhase.active', { phase: active.phase_key === 'PRA_TENDER' ? 'Pra-Tender' : 'On Submission Tender' })}</h2>
    {closed ? <>
      <p className="text-sm text-muted-foreground">{translate('projectPhase.closedHelp')}</p>
      {active.sales_decided_at && <p className="text-xs text-muted-foreground">{translate('projectPhase.decidedAt', { date: formatDate(active.sales_decided_at) })}</p>}
    </> : deciding ? <>
      <p className="text-sm text-muted-foreground">{translate('projectPhase.question')}</p>
      {canDecide ? <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button disabled={pending || closeMutation.isSuccess} onClick={() => openDialog('tender')}>{translate('projectPhase.yes')}</Button>
        <Button variant="outline" disabled={pending || closeMutation.isSuccess} onClick={() => openDialog('close')}>{translate('projectPhase.no')}</Button>
        <Button variant="ghost" disabled={pending || closeMutation.isSuccess} onClick={() => setDeferred(true)}>{translate('projectPhase.undecided')}</Button>
      </div> : <p className="text-xs text-muted-foreground">{translate('projectPhase.waitingDecision')}</p>}
      {deferred && canDecide && <p role="status" className="text-xs text-muted-foreground">{translate('projectPhase.waitingDecision')}</p>}
    </> : null}
    <Dialog open={dialog !== null} onOpenChange={value => !value && !pending && setDialog(null)}>
      <DialogHeader><DialogTitle>{translate(dialog === 'close' ? 'projectPhase.confirmClose' : 'projectPhase.continue')}</DialogTitle>
        <DialogDescription>{project.name}. {translate(dialog === 'close' ? 'projectPhase.closeHelp' : 'projectPhase.setup')}</DialogDescription></DialogHeader>
      {dialog === 'tender' && <div className="max-h-[55vh] space-y-2 overflow-y-auto">
        {getScenarioDocuments('ON_SUBMISSION_TENDER').map(item => <label key={item.key} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={item.isRequired || keys.includes(item.key)} disabled={item.isRequired || pending}
            onChange={() => setKeys(current => current.includes(item.key) ? current.filter(key => key !== item.key) : [...current, item.key])} />
          <span>{translateOutputName(item.key, item.name)} {item.isRequired && `(${translate('outputScope.required')})`}</span>
        </label>)}
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{translate(dialog === 'close' ? 'projectPhase.closeFailed' : 'projectPhase.failed')}</p>}
      <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setDialog(null)}>{translate('common.cancel')}</Button>
        <Button disabled={pending || !canDecide} onClick={() => void save()}>{translate(pending ? 'common.saving' : dialog === 'close' ? 'projectPhase.confirmNo' : 'projectPhase.create')}</Button></DialogFooter>
    </Dialog>
  </section>;
}
