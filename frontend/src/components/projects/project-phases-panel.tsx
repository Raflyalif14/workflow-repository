"use client";
import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, Layers } from 'lucide-react';
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

  if (closed) {
    return (
      <section
        tabIndex={-1}
        id="project-phase-panel"
        className="scroll-mt-20 rounded-xl border border-emerald-500/25 bg-emerald-50/50 p-4 sm:p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-emerald-500/20 dark:bg-emerald-950/20"
      >
        <div className="flex items-start gap-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">
                {translate('projectPhase.closed')}
              </h2>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Pra-Tender
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {translate('projectPhase.closedHelp')}
            </p>
            {active.sales_decided_at && (
              <p className="text-xs text-muted-foreground/80">
                {translate('projectPhase.decidedAt', { date: formatDate(active.sales_decided_at) })}
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (deciding) {
    return (
      <section
        tabIndex={-1}
        id="project-phase-panel"
        className="scroll-mt-20 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 sm:p-5 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-primary/25 dark:bg-primary/10"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-xs">
              <Layers className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {translate('projectPhase.praCompleted')}
                </span>
                <span className="text-xs text-muted-foreground">· Pra-Tender</span>
              </div>
              <h2 className="text-base font-semibold text-foreground">
                {translate('projectPhase.question')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {translate('salesPhaseTask.help')}
              </p>
            </div>
          </div>
        </div>

        {canDecide ? (
          <div className="mt-4 flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:flex-wrap border-t border-primary/15">
            <Button
              type="button"
              disabled={pending || closeMutation.isSuccess}
              onClick={() => openDialog('tender')}
              className="gap-2 shadow-xs"
            >
              {translate('projectPhase.yes')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || closeMutation.isSuccess}
              onClick={() => openDialog('close')}
              className="gap-2 bg-background hover:bg-muted/60"
            >
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {translate('projectPhase.no')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending || closeMutation.isSuccess}
              onClick={() => setDeferred(true)}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {translate('projectPhase.undecided')}
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{translate('projectPhase.waitingDecision')}</span>
          </div>
        )}

        {deferred && canDecide && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            {translate('projectPhase.waitingDecision')}
          </p>
        )}

        <Dialog open={dialog !== null} onOpenChange={value => !value && !pending && setDialog(null)}>
          <DialogHeader>
            <DialogTitle>{translate(dialog === 'close' ? 'projectPhase.confirmClose' : 'projectPhase.continue')}</DialogTitle>
            <DialogDescription>
              {project.name}. {translate(dialog === 'close' ? 'projectPhase.closeHelp' : 'projectPhase.setup')}
            </DialogDescription>
          </DialogHeader>
          {dialog === 'tender' && (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {getScenarioDocuments('ON_SUBMISSION_TENDER').map(item => (
                <label
                  key={item.key}
                  className={`flex items-center gap-3 rounded-lg border p-2.5 text-sm transition-colors ${
                    item.isRequired
                      ? 'border-border/60 bg-muted/40 cursor-not-allowed opacity-80'
                      : 'border-border hover:bg-muted/50 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.isRequired || keys.includes(item.key)}
                    disabled={item.isRequired || pending}
                    onChange={() => setKeys(current => current.includes(item.key) ? current.filter(key => key !== item.key) : [...current, item.key])}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                  <span className="flex-1 font-medium text-foreground">
                    {translateOutputName(item.key, item.name)} {item.isRequired && <span className="text-xs text-muted-foreground font-normal">({translate('outputScope.required')})</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{translate(dialog === 'close' ? 'projectPhase.closeFailed' : 'projectPhase.failed')}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setDialog(null)}>
              {translate('common.cancel')}
            </Button>
            <Button disabled={pending || !canDecide} onClick={() => void save()}>
              {translate(pending ? 'common.saving' : dialog === 'close' ? 'projectPhase.confirmNo' : 'projectPhase.create')}
            </Button>
          </DialogFooter>
        </Dialog>
      </section>
    );
  }

  return (
    <section
      tabIndex={-1}
      id="project-phase-panel"
      className="scroll-mt-20 rounded-xl border border-border bg-card p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-2.5 w-2.5 rounded-full bg-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          {translate('projectPhase.active', { phase: active.phase_key === 'PRA_TENDER' ? 'Pra-Tender' : 'On Submission Tender' })}
        </h2>
      </div>
    </section>
  );
}
