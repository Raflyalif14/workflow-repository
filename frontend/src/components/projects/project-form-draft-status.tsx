"use client";
import { useState } from 'react';
import { CloudOff, FileClock, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { translate as t } from '@/i18n';
import { useLanguage } from '@/components/i18n/language-provider';
import { Button } from '@/components/ui/button';
import type { ProjectDraftStatus } from '@/hooks/use-project-form-draft';

export function ProjectFormDraftStatus({ status, restored, savedAt, frozen, retry, reload, discard }: {
  status: ProjectDraftStatus; restored: boolean; savedAt: number | null; frozen: boolean;
  retry: () => Promise<unknown>; reload: () => Promise<unknown>; discard: () => Promise<unknown>;
}) {
  const { formatDate } = useLanguage();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const failed = status === 'error' || status === 'conflict';
  const Icon = status === 'loading' ? Loader2 : failed ? CloudOff : FileClock;
  return <section data-project-draft className={`mb-6 rounded-xl border p-4 ${failed ? 'border-warning/30 bg-warning/10' : 'border-primary/20 bg-primary-soft/50'}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${status === 'loading' ? 'animate-spin' : ''} ${failed ? 'text-warning' : 'text-primary'}`} aria-hidden="true" />
        <div className="min-w-0">
          <div className="grid text-sm font-semibold leading-5 text-foreground">
            {/* Reserve the largest normal status at the actual viewport/font width. */}
            {(['empty', 'loading', 'saving', 'saved'] as const).map(state => <span key={state} aria-hidden="true" className="invisible col-start-1 row-start-1">{t(`formDraft.${state}`)}</span>)}
            <p role={failed ? 'alert' : 'status'} className="col-start-1 row-start-1">{t(`formDraft.${status}`)}</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(status === 'conflict' ? 'formDraft.conflictHelp' : status === 'error' ? 'formDraft.errorHelp' : 'formDraft.localHelp')}</p>
          {restored && <p className="mt-1 text-xs font-medium text-primary">{t(frozen ? 'formDraft.restoredPending' : 'formDraft.restored')}</p>}
          <p aria-hidden={!savedAt} className="mt-1 min-h-4 text-[11px] leading-4 tabular-nums text-muted-foreground">{savedAt ? t('formDraft.savedTime', { time: formatDate(savedAt, { dateStyle: 'short', timeStyle: 'short' }) }) : '\u00a0'}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {status === 'error' && <Button type="button" size="sm" variant="outline" onClick={() => void retry()}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />{t('common.retry')}</Button>}
        {status === 'conflict' && <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>{t('formDraft.reload')}</Button>}
        {!frozen && status !== 'conflict' && <Button type="button" size="sm" variant="ghost" disabled={deleting || status === 'loading' || status === 'empty'} onClick={() => setConfirmDiscard(true)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />{t('formDraft.discard')}</Button>}
      </div>
    </div>
    {confirmDiscard && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-primary/20 pt-3">
      <p className="w-full text-xs text-foreground">{t('formDraft.discardHelp')}</p>
      <Button type="button" size="sm" variant="destructive" disabled={deleting} onClick={async () => { setDeleting(true); try { await discard(); setConfirmDiscard(false); } catch { /* Status banner displays the storage error. */ } finally { setDeleting(false); } }}>{t('formDraft.confirmDiscard')}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirmDiscard(false)}>{t('common.cancel')}</Button>
    </div>}
  </section>;
}
