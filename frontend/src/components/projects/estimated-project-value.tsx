"use client";
import { useRef, useState } from 'react';
import { useLanguage } from '@/components/i18n/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpdateEstimatedValue } from '@/hooks/use-projects';
import { useQueryClient } from '@tanstack/react-query';
import { projectKeys } from '@/lib/query-keys';
import { ApiError } from '@/lib/api-client';
import { canEditEstimatedValue, estimatedValueErrorKey, formatEstimatedValue, normalizeEstimatedValue } from '@/lib/project-estimated-value';
import { translate, type TranslationKey } from '@/i18n';
import type { Project } from '@/types/project';

export function EstimatedProjectValue({ project, role, userId }: { project: Project; role?: string; userId?: string }) {
  useLanguage();
  const [step, setStep] = useState<'edit' | 'confirm' | null>(null);
  const [value, setValue] = useState('');
  const [baseline, setBaseline] = useState<{ value: string | null; updatedAt: string } | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [reloading, setReloading] = useState(false);
  const busy = useRef(false);
  const intent = useRef<{ signature: string; id: string } | null>(null);
  const mutation = useUpdateEstimatedValue(project.id);
  const client = useQueryClient();
  const eligible = canEditEstimatedValue(project, role, userId);
  const ready = project.estimated_revenue_exact !== undefined && !!project.updated_at;
  const stale = error === 'estimatedValue.stale';
  const open = () => {
    if (!eligible || !ready) return;
    setBaseline({ value: project.estimated_revenue_exact ?? null, updatedAt: project.updated_at! });
    setValue(project.estimated_revenue_exact ?? ''); setError(null); intent.current = null; setStep('edit');
  };
  const close = () => { if (!busy.current && !mutation.isPending) setStep(null); };
  const review = () => {
    if (!normalizeEstimatedValue(value)) { setError('estimatedValue.invalid'); return; }
    setError(null); setStep('confirm');
  };
  const reload = async () => {
    if (busy.current) return;
    busy.current = true;
    setReloading(true);
    try {
      await client.refetchQueries({ queryKey: projectKeys.detail(project.id), type: 'active', stale: false }, { throwOnError: true });
      const latest = client.getQueryData<Project>(projectKeys.detailWithoutActivity(project.id)) || client.getQueryData<Project>(projectKeys.detail(project.id));
      if (!latest || !latest.updated_at || latest.estimated_revenue_exact === undefined) throw new Error('Unavailable');
      setBaseline({ value: latest.estimated_revenue_exact, updatedAt: latest.updated_at });
      intent.current = null; setError(null); setStep('edit');
    } catch { setError('estimatedValue.stale'); }
    finally { busy.current = false; setReloading(false); }
  };
  const save = async () => {
    const next = normalizeEstimatedValue(value);
    if (busy.current || mutation.isPending || !eligible || !baseline || !next || step !== 'confirm' || stale) return;
    busy.current = true;
    setError(null);
    try {
      const signature = `${baseline.updatedAt}:${next}`;
      if (intent.current?.signature !== signature) intent.current = { signature, id: crypto.randomUUID() };
      await mutation.mutateAsync({ estimated_revenue: next, expected_updated_at: baseline.updatedAt, request_id: intent.current.id });
      setStep(null);
    } catch (failure) { setError(estimatedValueErrorKey(failure instanceof ApiError ? failure.code : undefined)); }
    finally { busy.current = false; }
  };
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
    <p className="text-muted-foreground">{translate('projectDetail.estimatedRevenue')} <strong className="text-foreground">{formatEstimatedValue(project.estimated_revenue_exact)}</strong></p>
    {eligible && <Button size="sm" variant="ghost" disabled={!ready} onClick={open}>{translate('estimatedValue.edit')}</Button>}
    <Dialog open={step !== null} onOpenChange={open => { if (!open) close(); }}>
      <DialogHeader><DialogTitle>{translate('estimatedValue.edit')}</DialogTitle><DialogDescription>{project.name}</DialogDescription></DialogHeader>
      <p className="text-sm">{translate('estimatedValue.current', { value: formatEstimatedValue(baseline?.value) })}</p>
      {step === 'edit' ? <div className="space-y-1">
        <label htmlFor={`estimate-${project.id}`} className="text-sm font-medium">{translate('estimatedValue.new')}</label>
        <Input id={`estimate-${project.id}`} type="text" inputMode="decimal" value={value} onChange={event => { setValue(event.target.value); setError(null); }} aria-invalid={error === 'estimatedValue.invalid'} aria-describedby={`estimate-help-${project.id}`} />
        <p id={`estimate-help-${project.id}`} className="text-xs text-muted-foreground">{translate('estimatedValue.help')}</p>
      </div> : <p className="text-sm font-medium">{translate('estimatedValue.confirm', { before: formatEstimatedValue(baseline?.value), after: formatEstimatedValue(normalizeEstimatedValue(value)) })}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{translate(error)}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={mutation.isPending || reloading} onClick={close}>{translate('common.cancel')}</Button>
        {stale ? <Button disabled={reloading} onClick={() => void reload()}>{translate('estimatedValue.reload')}</Button> : step === 'edit'
          ? <Button disabled={!eligible} onClick={review}>{translate('estimatedValue.review')}</Button>
          : <><Button variant="ghost" disabled={mutation.isPending} onClick={() => setStep('edit')}>{translate('estimatedValue.back')}</Button>
            <Button disabled={mutation.isPending || !eligible} onClick={() => void save()}>{translate(mutation.isPending ? 'estimatedValue.saving' : 'estimatedValue.save')}</Button></>}
      </DialogFooter>
    </Dialog>
  </div>;
}
