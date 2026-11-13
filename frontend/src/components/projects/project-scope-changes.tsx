"use client";
import {useRef,useState} from 'react';
import {useAuth} from '@/components/auth/auth-provider';
import {useLanguage} from '@/components/i18n/language-provider';
import {useScopeChanges,useScopeChangeMutation,ScopeChange} from '@/hooks/use-scope-changes';
import {useOutputDocuments} from '@/hooks/use-output-documents';
import {translateOutputName,type TranslationKey} from '@/i18n';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Dialog,DialogHeader,DialogTitle,DialogFooter} from '@/components/ui/dialog';
import {getLocalDateOnlyKey} from '@/lib/dates';
import type {Project} from '@/types/project';

export function ProjectScopeChanges({project,milestones}:{project:Project;milestones?:{id:string;status:string}[]}){
 const {user}=useAuth();
 return project.active_phase_id ? <ScopeChangeForm key={`${project.id}:${project.active_phase_id}:${user?.id}`} project={project} milestones={milestones}/> : null;
}
function ScopeChangeForm({project,milestones}:{project:Project;milestones?:{id:string;status:string}[]}){
 const {user}=useAuth(),{t,formatDate}=useLanguage();
 const query=useScopeChanges(project.id),output=useOutputDocuments(project.id),mutation=useScopeChangeMutation(project.id);
 const [open,setOpen]=useState(false),[keys,setKeys]=useState<string[]>([]),[reason,setReason]=useState('');
 const [schedules,setSchedules]=useState<Record<string,{start_date:string;duration_working_days:number}>>({});
 const [reject,setReject]=useState<ScopeChange|null>(null),[note,setNote]=useState('');
 const [failure,setFailure]=useState<TranslationKey|''>(''),[saved,setSaved]=useState(false),[history,setHistory]=useState(false);
 const receipt=useRef<{payload:string;id:string}|null>(null),expected=useRef(project.updated_at);
 const phaseKey=project.phases?.find(phase=>phase.id===project.active_phase_id)?.phase_key || output.data?.scenarioKey;
 const documents=(output.data?.scopeCatalog || (output.data?.documents||[]).map(item=>({
  ...item,protected:!['TO_DO','NOT_REQUIRED'].includes(item.status)||!!item.draftRevision||!!item.draftFiles?.length||!!item.files?.length||!!item.fileName||!!item.currentVersionId,
 }))).filter(item=>item.group===phaseKey);
 const selected=documents.filter(item=>item.isRequired||item.isSelected).map(item=>item.key);
 const added=keys.filter(key=>!selected.includes(key));
 const removed=selected.filter(key=>!keys.includes(key));
 const pending=query.data?.find(item=>item.status==='PENDING');
 const owner=user?.role==='SALES'&&user.id===project.sales_id;
 const active=project.status==='ACTIVE'&&!project.is_postponed;
 const requestId=(body:unknown)=>{const payload=JSON.stringify(body);if(receipt.current?.payload!==payload)receipt.current={payload,id:crypto.randomUUID()};return receipt.current.id;};
 const name=(key:string)=>translateOutputName(key,documents.find(item=>item.key===key)?.name||key);
 const submit=async(changeId:string|undefined,body:Record<string,unknown>)=>{
  setFailure('');setSaved(false);
  try{await mutation.mutateAsync({changeId,body:{...body,request_id:requestId({changeId,body})}});
   receipt.current=null;setOpen(false);setReject(null);setSaved(true);
  }catch(error){const code=(error as {code?:string})?.code;
   setFailure(code==='SCOPE_PROTECTED'?'planChange.protected':code==='SCOPE_CONFLICT'?'planChange.conflict':'planChange.failed');}
 };
 const status=(value:ScopeChange['status'])=>t(value==='CANCELLED'?'meetings.CANCELLED':value==='PENDING'?'approvalStatus.PENDING':value==='APPROVED'?'milestoneStatus.APPROVED':'approvalStatus.REJECTED');
 return <section id="project-scope-changes" className="dashboard-surface scroll-mt-24 p-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">{t('planChange.title')}</h2>
   <p className="mt-1 text-sm text-muted-foreground">{t('planChange.help')}</p></div>
   {owner&&active&&!pending&&!query.isLoading&&!query.isError&&<Button variant="outline" disabled={output.isLoading||output.isError||!milestones} onClick={()=>{expected.current=project.updated_at;setKeys(selected);setReason('');setSchedules({});setFailure('');setSaved(false);setOpen(true);}}>{t('planChange.request')}</Button>}
  </div>
  <p className="mt-3 text-xs text-muted-foreground">{t('planChange.rules')}</p>
  {query.isLoading&&<p role="status" className="mt-3 text-sm">{t('common.loading')}</p>}
  {query.isError&&<div role="alert" className="mt-3 text-sm text-destructive">{t('planChange.loadFailed')} <Button variant="ghost" onClick={()=>void query.refetch()}>{t('common.retry')}</Button></div>}
  {failure&&<p role="alert" className="mt-3 text-sm text-destructive">{t(failure)}</p>}
  {saved&&<p role="status" className="mt-3 text-sm text-primary">{t('planChange.saved')}</p>}
  {(query.data||[]).filter(item=>item.status==='PENDING'||history).map(item=><article key={item.id} className="mt-4 space-y-3 rounded-xl border border-border p-4">
   <div className="flex flex-wrap justify-between gap-2"><p className="text-xs text-muted-foreground">{formatDate(item.requested_at,{dateStyle:'medium',timeStyle:'short'})}</p><Badge variant="outline">{status(item.status)}</Badge></div>
   <p className="break-words text-sm">{item.reason}</p>
   <div className="grid gap-3 text-sm sm:grid-cols-2"><div><p className="font-medium">{t('planChange.added')}</p><ul className="mt-1 space-y-1 text-muted-foreground">{item.proposal.selected_keys.filter(key=>!item.before_keys.includes(key)).map(key=><li key={key}>{name(key)}{item.proposal.additions.find(value=>value.key===key)&&<span className="block text-xs">{item.proposal.additions.find(value=>value.key===key)!.start_date} → {item.proposal.additions.find(value=>value.key===key)!.due_date}</span>}</li>)}</ul></div>
    <div><p className="font-medium">{t('planChange.removed')}</p><ul className="mt-1 space-y-1 text-muted-foreground">{item.before_keys.filter(key=>!item.proposal.selected_keys.includes(key)).map(key=><li key={key}>{name(key)}</li>)}</ul></div></div>
   {item.review_note&&<p className="break-words text-sm">{t('planChange.reviewNote')}: {item.review_note}</p>}
   {item.status==='PENDING'&&<div className="flex flex-wrap gap-2">
    {user?.role==='HEAD_SA'&&<><Button disabled={mutation.isPending||!active||item.phase_id!==project.active_phase_id} onClick={()=>void submit(item.id,{decision:'APPROVED'})}>{t('common.approve')}</Button><Button variant="outline" disabled={mutation.isPending} onClick={()=>{setReject(item);setNote('');setFailure('');}}>{t('common.reject')}</Button></>}
    {owner&&<Button variant="outline" disabled={mutation.isPending} onClick={()=>void submit(item.id,{decision:'CANCELLED'})}>{t('planChange.cancelRequest')}</Button>}
   </div>}
  </article>)}
  {!query.isLoading&&!query.isError&&!pending&&<p className="mt-3 text-sm text-muted-foreground">{t('planChange.noPending')}</p>}
  {(query.data||[]).some(item=>item.status!=='PENDING')&&<Button variant="ghost" className="mt-2" onClick={()=>setHistory(value=>!value)}>{t(history?'planChange.hideHistory':'planChange.history')}</Button>}
  <Dialog open={open} onOpenChange={value=>{if(!mutation.isPending)setOpen(value);}}><DialogHeader><DialogTitle>{t('planChange.request')}</DialogTitle></DialogHeader>
   <form onSubmit={event=>{event.preventDefault();void submit(undefined,{reason,selected_keys:keys,expected_updated_at:expected.current,
    additions:added.map(key=>({key,start_date:schedules[key]?.start_date||getLocalDateOnlyKey(),duration_working_days:schedules[key]?.duration_working_days||1}))});}} className="space-y-4">
    <p className="text-sm text-muted-foreground">{t('planChange.rules')}</p>
    {!documents.length&&<p role="alert" className="text-sm text-destructive">{t('outputScope.loadFailed')} <Button type="button" variant="ghost" onClick={()=>void output.refetch()}>{t('common.retry')}</Button></p>}
    <div className="max-h-[45vh] space-y-3 overflow-y-auto">{documents.map(item=><div key={item.key} className="rounded-lg border border-border p-3"><label className="flex gap-2 text-sm"><input type="checkbox" checked={keys.includes(item.key)} disabled={item.isRequired||mutation.isPending||selected.includes(item.key)&&(!milestones?.some(m=>m.id===item.milestoneId&&m.status==='CREATED')||item.protected)}
     onChange={()=>setKeys(current=>current.includes(item.key)?current.filter(key=>key!==item.key):[...current,item.key])}/>{name(item.key)}{item.isRequired&&<span className="text-xs text-muted-foreground">({t('outputScope.required')})</span>}</label>
     {added.includes(item.key)&&<div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs">{t('planChange.start')} *<Input required type="date" disabled={mutation.isPending} value={schedules[item.key]?.start_date||getLocalDateOnlyKey()} onChange={event=>setSchedules(current=>({...current,[item.key]:{duration_working_days:current[item.key]?.duration_working_days||1,start_date:event.target.value}}))}/></label>
      <label className="text-xs">{t('planChange.duration')} *<Input required type="number" min={1} max={1000} disabled={mutation.isPending} value={schedules[item.key]?.duration_working_days||1} onChange={event=>setSchedules(current=>({...current,[item.key]:{start_date:current[item.key]?.start_date||getLocalDateOnlyKey(),duration_working_days:Number(event.target.value)}}))}/></label></div>}
    </div>)}</div>
    <label className="block text-sm">{t('planChange.reason')} *<textarea required maxLength={2000} disabled={mutation.isPending} value={reason} onChange={event=>setReason(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-3"/></label>
    {failure&&<p role="alert" className="text-sm text-destructive">{t(failure)}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>setOpen(false)}>{t('common.cancel')}</Button><Button type="submit" disabled={mutation.isPending||!reason.trim()||!added.length&&!removed.length}>{t('planChange.submit')}</Button></DialogFooter>
   </form>
  </Dialog>
  <Dialog open={!!reject} onOpenChange={value=>{if(!value&&!mutation.isPending)setReject(null);}}><DialogHeader><DialogTitle>{t('planChange.reject')}</DialogTitle></DialogHeader>
   <form onSubmit={event=>{event.preventDefault();if(reject)void submit(reject.id,{decision:'REJECTED',note});}} className="space-y-4">
    <label className="block text-sm">{t('planChange.rejectReason')} *<textarea required maxLength={2000} value={note} disabled={mutation.isPending} onChange={event=>setNote(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-input bg-background p-3"/></label>
    {failure&&<p role="alert" className="text-sm text-destructive">{t(failure)}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>setReject(null)}>{t('common.cancel')}</Button><Button type="submit" disabled={!note.trim()||mutation.isPending}>{t('common.reject')}</Button></DialogFooter>
   </form>
  </Dialog>
 </section>;
}
