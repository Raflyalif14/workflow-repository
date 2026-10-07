"use client";
import { useEffect,useRef,useState } from 'react';
import { useLanguage } from '@/components/i18n/language-provider';
import { translate } from '@/i18n';
import { ApiError } from '@/lib/api-client';
import { isCurrentSession } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Dialog,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from '@/components/ui/dialog';
import { useProjectDocumentSharing,useSaveProjectDocumentSharing,useRepositorySession,canManageDocumentAccess,type AccessMode } from '@/hooks/use-document-access';
type Props={ project:{ id:string;name:string } };
export function ProjectDocumentSharing({ project }:Props) {
  const scope=useRepositorySession();
  return scope.enabled && canManageDocumentAccess(scope.user) ? <ProjectSharingForm key={`${project.id}:${scope.key.join(':')}`} project={project} /> : null;
}
export function ProjectSharingForm({ project }:Props) {
  useLanguage();const scope=useRepositorySession();
  const settings=useProjectDocumentSharing(project.id);const save=useSaveProjectDocumentSharing(project.id);
  const [draft,setDraft]=useState<{ mode:AccessMode;revision:number;before:AccessMode }|null>(null);
  const [confirm,setConfirm]=useState(false);const [error,setError]=useState<'failed'|'conflict'|null>(null);
  const pending=useRef(false);const receipt=useRef<{ key:string;id:string }|null>(null);
  useEffect(() => { if (!draft && settings.data) setDraft({ mode:settings.data.mode,before:settings.data.mode,revision:settings.data.revision }); },[draft,settings.data]);
  const currentSession=() => scope.session && isCurrentSession(scope.session);
  const reload=async () => {
    if (!scope.enabled || !currentSession()) return;
    const result=await settings.refetch();
    if (currentSession() && result.data && !result.isError) {
      setDraft({ mode:draft?.mode ?? result.data.mode,before:result.data.mode,revision:result.data.revision });
      setConfirm(false);setError(null);receipt.current=null;
    }
  };
  const submit=async () => {
    if (!confirm || !draft || pending.current || error==='conflict' || !currentSession()) return;
    pending.current=true;setError(null);
    const input={ mode:draft.mode,expected_revision:draft.revision };const key=JSON.stringify(input);
    if (receipt.current?.key !== key) receipt.current={ key,id:crypto.randomUUID() };
    try {
      await save.mutateAsync({ ...input,request_id:receipt.current.id });
      if (currentSession()) {setDraft(null);setConfirm(false);receipt.current=null;}
    } catch(failure) { if (currentSession()) setError(failure instanceof ApiError && failure.status===409 ? 'conflict':'failed'); }
    finally { pending.current=false; }
  };
  const errors=error && <div role="alert" className="text-sm text-destructive"><p>{translate(error==='conflict' ? 'projectSharing.conflict':'projectSharing.saveFailed')}</p>
    {error==='conflict' && <Button variant="outline" size="sm" onClick={() => void reload()}>{translate('projectSharing.reload')}</Button>}</div>;
  return <section className="space-y-3 rounded-lg border border-border/60 bg-card p-4" aria-label={translate('projectSharing.title')}>
    <div><h2 className="text-sm font-semibold">{translate('projectSharing.title')}</h2><p className="mt-1 break-words text-sm">{project.name}</p>
      <p className="mt-1 text-xs text-muted-foreground">{translate('projectSharing.description')}</p></div>
    {settings.isLoading ? <p className="text-sm">{translate('common.loading')}</p> : settings.isError ? <div role="alert"><p>{translate('projectSharing.loadFailed')}</p>
      <Button variant="outline" size="sm" onClick={() => void reload()}>{translate('common.retry')}</Button></div> : draft && <>
      <p className="text-xs text-muted-foreground">{translate('projectSharing.reviewedSetting',{ mode:translate(draft.before==='SHARED_INTERNAL' ? 'projectSharing.share':'projectSharing.doNotShare') })}</p>
      <div role="group" aria-label={translate('projectSharing.title')} className="grid grid-cols-2 gap-2">
        {(['SHARED_INTERNAL','RESTRICTED'] as const).map(mode => <Button key={mode} type="button" variant={draft.mode===mode ? 'secondary':'outline'}
          aria-pressed={draft.mode===mode} disabled={save.isPending || pending.current || error==='conflict'} className="h-auto min-h-10 min-w-0 whitespace-normal"
          onClick={() => { if (!pending.current && error!=='conflict') { setDraft({ ...draft,mode }); } }}>{translate(mode==='SHARED_INTERNAL' ? 'projectSharing.share':'projectSharing.doNotShare')}</Button>)}
      </div>
      <Button size="sm" disabled={save.isPending || error==='conflict' || (draft.mode===draft.before && !error)} onClick={() => { if (!pending.current) setConfirm(true); }}>{translate('projectSharing.review')}</Button>
    </>}
    {!confirm && errors}
    <Dialog open={confirm} onOpenChange={open => { if (!pending.current) setConfirm(open); }}>
      <DialogHeader><DialogTitle>{translate('projectSharing.confirm')}</DialogTitle><DialogDescription>{project.name}</DialogDescription></DialogHeader>
      {draft && <p className="text-sm">{translate(draft.before==='SHARED_INTERNAL' ? 'projectSharing.share':'projectSharing.doNotShare')}{' -> '}
        {translate(draft.mode==='SHARED_INTERNAL' ? 'projectSharing.share':'projectSharing.doNotShare')}</p>}
      <p className="mt-2 text-xs text-muted-foreground">{translate('projectSharing.description')}</p>
      {errors}
      <DialogFooter><Button variant="outline" disabled={save.isPending} onClick={() => { if (!pending.current) setConfirm(false); }}>{translate('projectSharing.confirmNo')}</Button>
        <Button disabled={save.isPending || error==='conflict' || settings.isError || !draft} onClick={() => void submit()}>{translate(save.isPending ? 'common.saving':'projectSharing.confirmYes')}</Button></DialogFooter>
    </Dialog>
  </section>;
}
