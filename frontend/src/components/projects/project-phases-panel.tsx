"use client";

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Layers,
  Trophy,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '@/components/i18n/language-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useClosePraTender, useContinueTenderPhase } from '@/hooks/use-projects';
import { getScenarioDocuments } from '@/constants/scenarios';
import { canContinueTenderPhase, isPraTenderDecisionPending, isProjectClosedAtPraTender, runConfirmedDecision } from '@/lib/phase-review';
import { formatDate, translate, translateOutputName } from '@/i18n';
import type { Project } from '@/types/project';

interface StepItem {
  id: string;
  stepNumber: number;
  title: string;
  status: 'completed' | 'active' | 'waiting' | 'skipped' | 'upcoming' | 'won' | 'lost';
  statusLabel: string;
}

function getProjectSteps(project: Project, closed: boolean, deciding: boolean): StepItem[] {
  const hasPraTender = Boolean(
    project.phases?.some(phase => phase.phase_key === 'PRA_TENDER') ||
    (project.initial_scenario?.code && /pra[- ]?tender/i.test(project.initial_scenario.code)) ||
    (project.initial_scenario?.name && /pra[- ]?tender/i.test(project.initial_scenario.name)) ||
    (project.scenario?.name && /pra[- ]?tender/i.test(project.scenario.name))
  );

  const activePhase = project.phases?.find(phase => phase.id === project.active_phase_id);
  const isPraActive = activePhase?.phase_key === 'PRA_TENDER';
  const isWon = project.status === 'WON';
  const isLost = project.status === 'LOST';
  const isCompleted = project.status === 'COMPLETED';
  const isWaitingResult = project.status === 'WAITING_RESULT';

  if (!hasPraTender) {
    // 2-step journey: On Submission Tender -> Hasil Tender
    const step1Status: StepItem['status'] = (isWon || isLost || isCompleted || isWaitingResult)
      ? 'completed'
      : 'active';
    const step1Label = step1Status === 'completed'
      ? translate('projectPhase.statusCompleted')
      : translate('projectPhase.statusActive');

    let step2Status: StepItem['status'] = 'upcoming';
    let step2Label = translate('projectPhase.statusPending');
    if (isWon) {
      step2Status = 'won';
      step2Label = translate('projectPhase.statusWon');
    } else if (isLost) {
      step2Status = 'lost';
      step2Label = translate('projectPhase.statusLost');
    } else if (isWaitingResult) {
      step2Status = 'waiting';
      step2Label = translate('projectPhase.statusWaitingOutcome');
    } else if (isCompleted) {
      step2Status = 'completed';
      step2Label = translate('projectPhase.statusCompleted');
    }

    return [
      {
        id: 'submission',
        stepNumber: 1,
        title: translate('projectPhase.stepSubmission'),
        status: step1Status,
        statusLabel: step1Label,
      },
      {
        id: 'outcome',
        stepNumber: 2,
        title: translate('projectPhase.stepOutcome'),
        status: step2Status,
        statusLabel: step2Label,
      },
    ];
  }

  // 3-step journey: Pra-Tender -> On Submission Tender -> Hasil Tender
  let praStatus: StepItem['status'] = 'completed';
  let praLabel = translate('projectPhase.statusCompleted');

  let subStatus: StepItem['status'] = 'upcoming';
  let subLabel = translate('projectPhase.statusPending');

  let outStatus: StepItem['status'] = 'upcoming';
  let outLabel = translate('projectPhase.statusPending');

  if (closed) {
    praStatus = 'completed';
    praLabel = translate('projectPhase.statusCompleted');
    subStatus = 'skipped';
    subLabel = translate('projectPhase.statusSkipped');
    outStatus = 'skipped';
    outLabel = translate('projectPhase.statusSkipped');
  } else if (deciding) {
    praStatus = 'completed';
    praLabel = translate('projectPhase.statusCompleted');
    subStatus = 'waiting';
    subLabel = translate('projectPhase.statusWaitingDecision');
    outStatus = 'upcoming';
    outLabel = translate('projectPhase.statusPending');
  } else if (isPraActive) {
    praStatus = 'active';
    praLabel = translate('projectPhase.statusActive');
    subStatus = 'upcoming';
    subLabel = translate('projectPhase.statusPending');
    outStatus = 'upcoming';
    outLabel = translate('projectPhase.statusPending');
  } else {
    // In On Submission Tender or beyond
    praStatus = 'completed';
    praLabel = translate('projectPhase.statusCompleted');

    if (isWon || isLost || isCompleted || isWaitingResult) {
      subStatus = 'completed';
      subLabel = translate('projectPhase.statusCompleted');
    } else {
      subStatus = 'active';
      subLabel = translate('projectPhase.statusActive');
    }

    if (isWon) {
      outStatus = 'won';
      outLabel = translate('projectPhase.statusWon');
    } else if (isLost) {
      outStatus = 'lost';
      outLabel = translate('projectPhase.statusLost');
    } else if (isWaitingResult) {
      outStatus = 'waiting';
      outLabel = translate('projectPhase.statusWaitingOutcome');
    } else if (isCompleted) {
      outStatus = 'completed';
      outLabel = translate('projectPhase.statusCompleted');
    } else {
      outStatus = 'upcoming';
      outLabel = translate('projectPhase.statusPending');
    }
  }

  return [
    {
      id: 'pra_tender',
      stepNumber: 1,
      title: translate('projectPhase.stepPraTender'),
      status: praStatus,
      statusLabel: praLabel,
    },
    {
      id: 'submission',
      stepNumber: 2,
      title: translate('projectPhase.stepSubmission'),
      status: subStatus,
      statusLabel: subLabel,
    },
    {
      id: 'outcome',
      stepNumber: 3,
      title: translate('projectPhase.stepOutcome'),
      status: outStatus,
      statusLabel: outLabel,
    },
  ];
}

function PhaseStepperView({ steps }: { steps: StepItem[] }) {
  return (
    <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isCompleted = step.status === 'completed';
        const isActive = step.status === 'active';
        const isWaiting = step.status === 'waiting';
        const isWon = step.status === 'won';
        const isLost = step.status === 'lost';
        const isSkipped = step.status === 'skipped';

        const nextStep = steps[index + 1];
        const connectorColored = isCompleted && nextStep && (nextStep.status === 'completed' || nextStep.status === 'active' || nextStep.status === 'won');

        return (
          <div key={step.id} className="flex flex-1 items-center">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isWon
                    ? 'bg-emerald-600 text-white shadow-xs ring-4 ring-emerald-500/20'
                    : isLost
                    ? 'bg-muted text-muted-foreground ring-2 ring-border'
                    : isCompleted
                    ? 'bg-emerald-500/15 text-emerald-600 ring-2 ring-emerald-500/30 dark:text-emerald-400'
                    : isActive
                    ? 'bg-primary text-primary-foreground shadow-xs ring-4 ring-primary/20'
                    : isWaiting
                    ? 'bg-amber-500/15 text-amber-600 ring-2 ring-amber-500/30 dark:text-amber-400'
                    : isSkipped
                    ? 'border border-dashed border-border bg-muted/40 text-muted-foreground/60'
                    : 'border border-border bg-muted/40 text-muted-foreground'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                {isWon ? (
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                ) : isLost ? (
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                ) : isCompleted ? (
                  <Check className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
                ) : isWaiting ? (
                  <Clock3 className="h-4 w-4 animate-pulse" aria-hidden="true" />
                ) : isSkipped ? (
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <span>{step.stepNumber}</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm ${
                    isActive
                      ? 'font-bold text-foreground'
                      : isCompleted || isWon
                      ? 'font-semibold text-foreground'
                      : 'font-medium text-muted-foreground'
                  }`}
                >
                  {step.title}
                </p>
                <p
                  className={`text-[11px] leading-tight ${
                    isWon
                      ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                      : isLost
                      ? 'text-muted-foreground'
                      : isCompleted
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isActive
                      ? 'font-medium text-primary'
                      : isWaiting
                      ? 'font-medium text-amber-600 dark:text-amber-400'
                      : isSkipped
                      ? 'italic text-muted-foreground/70'
                      : 'text-muted-foreground/70'
                  }`}
                >
                  {step.statusLabel}
                </p>
              </div>
            </div>

            {!isLast && (
              <div
                className={`hidden sm:block mx-3 h-0.5 flex-1 transition-colors ${
                  connectorColored
                    ? 'bg-emerald-500'
                    : isSkipped
                    ? 'border-t border-dashed border-border'
                    : 'bg-border/60'
                }`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ProjectPhasesPanel({ project, role, userId }: { project: Project; role?: string; userId?: string }) {
  useLanguage();
  const [dialog, setDialog] = useState<'tender' | 'close' | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const mutation = useContinueTenderPhase(project.id);
  const closeMutation = useClosePraTender(project.id);
  const active = project.phases?.find(phase => phase.id === project.active_phase_id)
    || (project.phases && project.phases.length > 0 ? project.phases[project.phases.length - 1] : undefined);
  const pending = mutation.isPending || closeMutation.isPending;
  const deciding = Boolean(isPraTenderDecisionPending(project));
  const closed = Boolean(isProjectClosedAtPraTender(project));
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

  if (!active) {
    return project.phase_migration_state === 'LEGACY_REVIEW'
      ? <p className="text-sm text-muted-foreground">{translate('projectPhase.legacy')}</p>
      : null;
  }

  const openDialog = (value: 'tender' | 'close') => { setError(false); setDialog(value); };
  const save = async () => {
    if (!canDecide || pending || !dialog) return;
    setError(false);
    try {
      await runConfirmedDecision({ confirmed: true, current: Boolean(canDecide) }, async () => {
        if (dialog === 'tender') await mutation.mutateAsync(keys);
        else await closeMutation.mutateAsync();
      });
      setDialog(null);
      window.location.hash = 'project-phase-panel';
      document.getElementById('project-phase-panel')?.focus();
    } catch (err) {
      console.error('[ProjectPhasesPanel] save error:', err);
      setError(true);
    }
  };

  const steps = getProjectSteps(project, closed, deciding);

  return (
    <section
      tabIndex={-1}
      id="project-phase-panel"
      className="scroll-mt-20 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Stepper Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {translate('projectPhase.stepperTitle')}
          </h2>
        </div>
        {active && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            {translate('projectPhase.label', {
              phase: active.phase_key === 'PRA_TENDER'
                ? translate('projectPhase.stepPraTender')
                : translate('projectPhase.stepSubmission'),
            })}
          </span>
        )}
      </div>

      {/* Stepper Flow */}
      <div className="pt-3.5 pb-1">
        <PhaseStepperView steps={steps} />
      </div>

      {/* State-specific Section */}
      {closed && (
        <div className="mt-4 rounded-lg border border-emerald-500/25 bg-emerald-50/50 p-4 dark:border-emerald-500/20 dark:bg-emerald-950/20">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {translate('projectPhase.closed')}
                </h3>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                  Pra-Tender
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {translate('projectPhase.closedHelp')}
              </p>
              {active.sales_decided_at && (
                <p className="text-[11px] text-muted-foreground/80">
                  {translate('projectPhase.decidedAt', { date: formatDate(active.sales_decided_at) })}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {deciding && (
        <div className="mt-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 sm:p-5 shadow-xs dark:border-primary/25 dark:bg-primary/10">
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-xs">
                <Layers className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {translate('projectPhase.praCompleted')}
                  </span>
                  <span className="text-xs text-muted-foreground">· Pra-Tender</span>
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  {translate('projectPhase.question')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {translate('salesPhaseTask.help')}
                </p>
              </div>
            </div>

            {canDecide ? (
              <div className="mt-2 flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:flex-wrap border-t border-primary/15">
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
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{translate('projectPhase.waitingDecision')}</span>
              </div>
            )}

            {deferred && canDecide && (
              <p role="status" className="mt-1 text-xs text-muted-foreground">
                {translate('projectPhase.waitingDecision')}
              </p>
            )}
          </div>
        </div>
      )}

      {!closed && !deciding && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span>
              {translate('projectPhase.active', {
                phase: active.phase_key === 'PRA_TENDER'
                  ? translate('projectPhase.stepPraTender')
                  : translate('projectPhase.stepSubmission'),
              })}
            </span>
          </div>
          {project.scenario?.name && (
            <span className="text-[11px] text-muted-foreground/75">
              {project.scenario.name}
            </span>
          )}
        </div>
      )}

      {/* Decision Dialog */}
      {deciding && (
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
            <Button className="text-white" disabled={pending || !canDecide} onClick={() => void save()}>
              {translate(pending ? 'common.saving' : dialog === 'close' ? 'projectPhase.confirmNo' : 'projectPhase.create')}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </section>
  );
}
