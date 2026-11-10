"use client";

import {useRef,useState} from 'react';

import Link from 'next/link';

import {CalendarDays,Check,Plus,X} from 'lucide-react';

import {useAuth} from '@/components/auth/auth-provider';

import {useLanguage} from '@/components/i18n/language-provider';

import {Button} from '@/components/ui/button';

import {Input} from '@/components/ui/input';

import {Dialog,DialogHeader,DialogTitle} from '@/components/ui/dialog';

import {ApiError} from '@/lib/api-client';

import {localInputValue} from '@/lib/calendar-view';

import {Meeting,useMeetingMutation,useMeetings} from '@/hooks/use-calendar';

import {MeetingConflictWarning} from './meeting-conflict-warning';
import {MeetingMinutes} from './meeting-minutes';
import type {Project} from '@/types/project';



const uncertain=(error:unknown)=>!(error instanceof ApiError)||error.status>=500;

export function MeetingActions({meeting}:{meeting:Meeting}){

 const {user}=useAuth(),{t,formatDate}=useLanguage(),mutation=useMeetingMutation();

 const [action,setAction]=useState<'APPROVE'|'REJECT'|'CANCEL'|null>(null),[note,setNote]=useState('');

 const request=useRef<{fingerprint:string;id:string}|null>(null);

 const locked=mutation.isError&&uncertain(mutation.error);

 const submit=async()=>{

  if(!action||mutation.isPending||action==='REJECT'&&!note.trim())return;

  const reviewNote=action==='CANCEL'?'':note;

  const fingerprint=JSON.stringify([meeting.id,meeting.revision,action,reviewNote]);

  if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,id:crypto.randomUUID()};

  try{await mutation.mutateAsync({projectId:meeting.projectId,meetingId:meeting.id,body:{action:meeting.proposedSchedule&&action!=='CANCEL'?action+'_RESCHEDULE':action,note:reviewNote,revision:meeting.revision,requestId:request.current.id}});setAction(null);}catch{}

 };

 const open=(value:NonNullable<typeof action>)=>{if(mutation.isPending||locked||value===action)return;mutation.reset();request.current=null;setNote('');setAction(value);};

 return <>

  <div className="flex flex-wrap gap-2">

   {user?.role==='SALES'&&meeting.status==='APPROVED'&&!meeting.proposedSchedule&&Date.parse(meeting.startsAt)>Date.now()&&<RescheduleMeeting meeting={meeting}/>} 

   {user?.role==='HEAD_SA'&&(meeting.status==='PENDING'||!!meeting.proposedSchedule)&&<><Button size="sm" onClick={()=>open('APPROVE')}><Check className="mr-1 h-4 w-4"/>{t('meetings.approve')}</Button><Button size="sm" variant="outline" onClick={()=>open('REJECT')}><X className="mr-1 h-4 w-4"/>{t('meetings.reject')}</Button></>}

   {['HEAD_SA','SALES'].includes(user?.role||'')&&['PENDING','APPROVED'].includes(meeting.status)&&(meeting.status==='PENDING'||Date.parse(meeting.startsAt)>Date.now())&&<Button size="sm" variant="outline" onClick={()=>open('CANCEL')}>{t('meetings.cancelMeeting')}</Button>}

  </div>

  <Dialog open={!!action} onOpenChange={value=>{if(!value&&!mutation.isPending&&!locked)setAction(null);}}><DialogHeader><DialogTitle>{t(action==='CANCEL'?'meetings.cancelMeeting':meeting.proposedSchedule?'meetingReview.reviewReschedule':'meetingReview.title')}</DialogTitle></DialogHeader>

   <form className="space-y-4" onSubmit={event=>{event.preventDefault();void submit();}}>

    <p className="font-medium">{meeting.title}</p><p className="text-sm text-muted-foreground">{t('copy.projectLabel')}: {meeting.projectName}</p><p className="text-sm">{formatDate(meeting.startsAt,{dateStyle:"medium",timeStyle:"short"})} &ndash; {meeting.endsAt?formatDate(meeting.endsAt,{dateStyle:"medium",timeStyle:"short"}):t("meetings.endUnknown")}</p><p className="text-xs text-muted-foreground">PIC SA: {meeting.picName||t("meetings.noPic")}</p>

    {meeting.proposedSchedule&&action!=="CANCEL"&&<p className="rounded-lg bg-primary/5 p-3 text-sm">{t("meetings.reschedulePending")}: {formatDate(meeting.proposedSchedule.startsAt,{dateStyle:"medium",timeStyle:"short"})}</p>}

    {action!=='CANCEL'&&<div role="group" aria-label={t('meetingReview.decision')} className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-1"><Button type="button" aria-pressed={action==='APPROVE'} disabled={mutation.isPending||locked} variant={action==='APPROVE'?'default':'ghost'} onClick={()=>open('APPROVE')}><Check className="mr-1 h-4 w-4"/>{t('meetings.approve')}</Button><Button type="button" aria-pressed={action==='REJECT'} disabled={mutation.isPending||locked} variant={action==='REJECT'?'destructive':'ghost'} onClick={()=>open('REJECT')}><X className="mr-1 h-4 w-4"/>{t('meetings.reject')}</Button></div>}
    {action==='APPROVE'&&<MeetingConflictWarning projectId={meeting.projectId} meetingId={meeting.id} startsAt={meeting.proposedSchedule?.startsAt||meeting.startsAt} endsAt={meeting.proposedSchedule?meeting.proposedSchedule.endsAt:meeting.endsAt}/>}
    {action!=="CANCEL"&&<label className="block space-y-2 text-sm"><span>{t(action==='REJECT'?'meetingReview.reason':'meetingReview.optionalNote')}{action==='REJECT'&&<span className="ml-1 text-destructive" aria-hidden="true">*</span>}</span><textarea placeholder={t(action==='REJECT'?'meetingReview.reasonPlaceholder':'meetingReview.notePlaceholder')} required={action==='REJECT'} maxLength={2000} disabled={locked||mutation.isPending} value={note} onChange={e=>setNote(e.target.value)} className="min-h-24 w-full rounded-lg border border-input bg-background p-3"/></label>}

    {mutation.isError&&<p role="alert" className="text-sm text-destructive">{t(locked?'meetings.uncertain':mutation.error instanceof ApiError&&mutation.error.status===409?'meetings.conflict':'meetings.error')}</p>}

    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending||locked} onClick={()=>setAction(null)}>{t('common.close')}</Button><Button type="submit" variant={action==='APPROVE'?'default':'destructive'} disabled={mutation.isPending||action==='REJECT'&&!note.trim()}>{t(mutation.isPending?'common.saving':action==='CANCEL'?'meetings.cancelMeeting':action==='REJECT'?meeting.proposedSchedule?'meetingReview.rejectReschedule':'meetingReview.reject':meeting.proposedSchedule?'meetingReview.approveReschedule':'meetingReview.approve')}</Button></div>

   </form>

  </Dialog>

 </>;

}

export function MeetingList({projectId,pendingOnly=false}:{projectId?:string;pendingOnly?:boolean}){

 const {t,formatDate}=useLanguage(),[page,setPage]=useState(1),query=useMeetings({projectId,status:pendingOnly?'PENDING':undefined,page});
 const [expandedPage,setExpandedPage]=useState<number|null>(null);
 const expanded=expandedPage===page;
 const visible=expanded?query.data?.items:query.data?.items.slice(0,4);
 const listId=`meeting-list-${projectId||(pendingOnly?'pending':'all')}`;

 return <div className="space-y-3">

  {query.isLoading?<p role="status" className="text-sm text-muted-foreground">{t('common.loading')}</p>:query.isError?<div role="alert" className="text-sm text-destructive"><p>{t('meetings.loadError')}</p><Button variant="outline" onClick={()=>query.refetch()}>{t('common.retry')}</Button></div>:!query.data?.items.length?<p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{t(pendingOnly?'meetings.noPending':'meetings.empty')}</p>:

   <div id={listId} className="space-y-3">{visible?.map(meeting=><article key={meeting.id} className="space-y-3 rounded-xl border border-border bg-card p-4">

    <div className="flex flex-wrap items-start justify-between gap-2"><div><Link href={`/projects/${meeting.projectId}#project-meetings`} className="text-xs text-primary hover:underline">{meeting.projectName}</Link><h3 className="mt-1 font-semibold">{meeting.title}</h3></div><span className={`rounded-full px-2 py-1 text-xs font-medium ${meeting.status==='APPROVED'?'bg-success/10 text-success':meeting.status==='PENDING'?'bg-primary/10 text-primary':'bg-muted text-muted-foreground'}`}>{t(`meetings.${meeting.status}`)}</span></div>

    <p className="text-sm">{formatDate(meeting.startsAt,{dateStyle:'medium',timeStyle:'short'})} &ndash; {meeting.endsAt?formatDate(meeting.endsAt,{dateStyle:'medium',timeStyle:'short'}):t("meetings.endUnknown")}</p>

    <p className="text-xs text-muted-foreground">PIC SA: {meeting.picName||t('meetings.noPic')}</p>

    {meeting.location&&<p className="break-words text-sm text-muted-foreground">{meeting.location}</p>}

    {meeting.agenda&&<p className="whitespace-pre-wrap break-words text-sm">{meeting.agenda}</p>}

    {meeting.reviewNote&&<p className="rounded-lg bg-muted p-3 text-sm">{t('meetings.reviewNote')}: {meeting.reviewNote}</p>}

    {meeting.proposedSchedule&&<div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"><p className="font-medium">{t("meetings.reschedulePending")}</p><p>{meeting.proposedSchedule.title}</p><p>{formatDate(meeting.proposedSchedule.startsAt,{dateStyle:"medium",timeStyle:"short"})} – {meeting.proposedSchedule.endsAt?formatDate(meeting.proposedSchedule.endsAt,{dateStyle:"medium",timeStyle:"short"}):t("meetings.endUnknown")}</p><p>{meeting.proposedSchedule.location}</p><p className="whitespace-pre-wrap">{meeting.proposedSchedule.agenda}</p></div>}

    <MeetingActions meeting={meeting}/>
    {meeting.status==='APPROVED'&&<MeetingMinutes meeting={meeting}/>}

   </article>)}</div>}

  {!query.isLoading&&!query.isError&&query.data&&query.data.items.length>4&&<Button type="button" variant="ghost" className="w-full text-primary" aria-expanded={expanded} aria-controls={listId} onClick={()=>setExpandedPage(expanded?null:page)}>{t(expanded?'taskPreview.less':'taskPreview.all',{count:query.data.items.length})}</Button>}

  {query.data&&query.data.totalPages>1&&<div className="flex items-center justify-between gap-3 text-sm"><span>{t('meetings.page',{page,pages:query.data.totalPages})}</span><div className="flex gap-2"><Button variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>{t('meetings.previous')}</Button><Button variant="outline" disabled={page>=query.data.totalPages} onClick={()=>setPage(p=>p+1)}>{t('meetings.next')}</Button></div></div>}

 </div>;

}

export function MeetingApprovalQueue({history=false}:{history?:boolean}={}){

 const {user}=useAuth(),{t}=useLanguage();

 if(!['HEAD_SA','SUPER_ADMIN'].includes(user?.role||''))return null;

 return <section className="page-surface space-y-4 p-5"><h2 className="font-semibold">{t(history?'meetings.historyTitle':'meetings.pendingTitle')}</h2><p className="text-sm text-muted-foreground">{t(history?'meetings.historyHelp':'meetings.pendingHelp')}</p><MeetingList key={history?'history':'pending'} pendingOnly={!history}/></section>;

}

export function ProjectMeetings({project}:{project:Pick<Project,'id'|'sales_id'|'pic'|'status'|'is_postponed'>}){

 const {user}=useAuth(),{t,formatDate}=useLanguage(),mutation=useMeetingMutation();

 const [open,setOpen]=useState(false),[title,setTitle]=useState(''),[agenda,setAgenda]=useState(''),[location,setLocation]=useState(''),[startsAt,setStarts]=useState(''),[endsAt,setEnds]=useState('');

 const requestId=useRef('');const locked=mutation.isError&&uncertain(mutation.error);

 const hasPic=!!project.pic?.id;

 const canCreate=user?.role==='SALES'&&project.sales_id===user.id&&hasPic&&!project.is_postponed&&['DRAFT','ACTIVE','WAITING_RESULT'].includes(project.status);

 const submit=async()=>{

  if(!startsAt||endsAt&&Date.parse(endsAt)<=Date.parse(startsAt))return;

  requestId.current||=crypto.randomUUID();

  try{await mutation.mutateAsync({projectId:project.id,body:{title,agenda,location,startsAt:new Date(startsAt).toISOString(),endsAt:endsAt?new Date(endsAt).toISOString():null,requestId:requestId.current}});setOpen(false);setTitle('');setAgenda('');setLocation('');setStarts('');setEnds('');requestId.current='';}catch{}

 };

 return <section id="project-meetings" className="page-surface scroll-mt-24 space-y-4 p-5">

  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5 text-primary"/>{t('meetings.title')}</h2><div className="flex gap-2"><Link href="/calendar" className="rounded-lg border px-3 py-2 text-sm text-primary">{t('meetings.openCalendar')}</Link>{canCreate&&<Button onClick={()=>{if(!locked)mutation.reset();setOpen(true);}}><Plus className="mr-1 h-4 w-4"/>{t('meetings.request')}</Button>}</div></div>

  <p className="text-sm text-muted-foreground">{t('meetings.help')}</p>

  {user?.role==='SALES'&&!hasPic&&<p className="text-sm text-muted-foreground">{t('meetings.picRequired')}</p>}

  {mutation.isSuccess&&<p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">{t("meetings.requested")}</p>}

  <MeetingList projectId={project.id}/>

  <Dialog open={open} onOpenChange={value=>{if(!mutation.isPending)setOpen(value);}}><DialogHeader><DialogTitle>{t('meetings.request')}</DialogTitle></DialogHeader>

   <form className="space-y-4" onSubmit={e=>{e.preventDefault();void submit();}}>

    <p className="text-xs text-muted-foreground">{t('meetings.requiredHelp')}</p>

    <label className="block space-y-1 text-sm"><span>{t('meetings.name')} <span className="text-destructive" aria-hidden="true">*</span></span><Input required minLength={2} maxLength={150} disabled={locked||mutation.isPending} value={title} onChange={e=>{setTitle(e.target.value);requestId.current='';}}/></label>

    <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>{t('meetings.starts')} <span className="text-destructive" aria-hidden="true">*</span></span><Input type="datetime-local" required min={locked?undefined:localInputValue(new Date())} disabled={locked||mutation.isPending} value={startsAt} onChange={e=>{setStarts(e.target.value);requestId.current='';}}/></label><label className="space-y-1 text-sm"><span>{t('meetings.ends')} ({t('meetings.optional')})</span><Input type="datetime-local" min={startsAt||undefined} disabled={locked||mutation.isPending} value={endsAt} onChange={e=>{setEnds(e.target.value);requestId.current='';}}/></label></div>

    <MeetingConflictWarning projectId={project.id} startsAt={startsAt} endsAt={endsAt||null}/>
    <p className="text-xs text-muted-foreground">{t('meetings.endHelp')}</p>

    <p className="text-xs text-muted-foreground">{t('meetings.timezone',{zone:Intl.DateTimeFormat().resolvedOptions().timeZone})}</p>

    <label className="block space-y-1 text-sm"><span>{t('meetings.location')}</span><Input maxLength={1000} disabled={locked||mutation.isPending} value={location} onChange={e=>{setLocation(e.target.value);requestId.current='';}}/></label>

    <label className="block space-y-1 text-sm"><span>{t('meetings.agenda')}</span><textarea maxLength={3000} disabled={locked||mutation.isPending} value={agenda} onChange={e=>{setAgenda(e.target.value);requestId.current='';}} className="min-h-24 w-full rounded-lg border border-input bg-background p-3"/></label>

    {startsAt&&endsAt&&Date.parse(endsAt)<=Date.parse(startsAt)&&<p role="alert" className="text-sm text-destructive">{t('meetings.invalidEnd')}</p>}

    {mutation.isError&&<p role="alert" className="text-sm text-destructive">{t(locked?'meetings.uncertain':mutation.error instanceof ApiError&&mutation.error.status===409?'meetings.conflict':'meetings.error')}</p>}

    <Button type="submit" disabled={mutation.isPending||title.trim().length<2||!startsAt||!!endsAt&&Date.parse(endsAt)<=Date.parse(startsAt)}>{t(mutation.isPending?'common.saving':'meetings.submit')}</Button>

   </form>

  </Dialog>

 </section>;

}



function RescheduleMeeting({meeting}:{meeting:Meeting}){

 const {t}=useLanguage(),mutation=useMeetingMutation();

 const [open,setOpen]=useState(false),[title,setTitle]=useState(meeting.title),[agenda,setAgenda]=useState(meeting.agenda),[location,setLocation]=useState(meeting.location),[startsAt,setStarts]=useState(localInputValue(new Date(meeting.startsAt))),[endsAt,setEnds]=useState(meeting.endsAt?localInputValue(new Date(meeting.endsAt)):'');

 const requestId=useRef('');const locked=mutation.isError&&uncertain(mutation.error);

 const submit=async()=>{

  if(!startsAt||endsAt&&Date.parse(endsAt)<=Date.parse(startsAt))return;

  requestId.current||=crypto.randomUUID();

  try{await mutation.mutateAsync({projectId:meeting.projectId,meetingId:meeting.id,body:{action:'RESCHEDULE',revision:meeting.revision,requestId:requestId.current,title,agenda,location,startsAt:new Date(startsAt).toISOString(),endsAt:endsAt?new Date(endsAt).toISOString():null}});setOpen(false);}catch{}

 };

 return <><Button size="sm" variant="outline" onClick={()=>setOpen(true)}>{t('meetings.reschedule')}</Button>

 <Dialog open={open} onOpenChange={value=>{if(!mutation.isPending)setOpen(value);}}><DialogHeader><DialogTitle>{t('meetings.reschedule')}</DialogTitle></DialogHeader><p className="mb-4 text-sm text-muted-foreground">{t('meetings.rescheduleHelp')}</p>

   <form className="space-y-4" onSubmit={e=>{e.preventDefault();void submit();}}>

    <p className="text-xs text-muted-foreground">{t('meetings.requiredHelp')}</p>

    <label className="block space-y-1 text-sm"><span>{t('meetings.name')} <span className="text-destructive" aria-hidden="true">*</span></span><Input required minLength={2} maxLength={150} disabled={locked||mutation.isPending} value={title} onChange={e=>{setTitle(e.target.value);requestId.current='';}}/></label>

    <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>{t('meetings.starts')} <span className="text-destructive" aria-hidden="true">*</span></span><Input type="datetime-local" required min={locked?undefined:localInputValue(new Date())} disabled={locked||mutation.isPending} value={startsAt} onChange={e=>{setStarts(e.target.value);requestId.current='';}}/></label><label className="space-y-1 text-sm"><span>{t('meetings.ends')} ({t('meetings.optional')})</span><Input type="datetime-local" min={startsAt||undefined} disabled={locked||mutation.isPending} value={endsAt} onChange={e=>{setEnds(e.target.value);requestId.current='';}}/></label></div>

    <MeetingConflictWarning projectId={meeting.projectId} meetingId={meeting.id} startsAt={startsAt} endsAt={endsAt||null}/>
    <p className="text-xs text-muted-foreground">{t('meetings.endHelp')}</p>

    <p className="text-xs text-muted-foreground">{t('meetings.timezone',{zone:Intl.DateTimeFormat().resolvedOptions().timeZone})}</p>

    <label className="block space-y-1 text-sm"><span>{t('meetings.location')}</span><Input maxLength={1000} disabled={locked||mutation.isPending} value={location} onChange={e=>{setLocation(e.target.value);requestId.current='';}}/></label>

    <label className="block space-y-1 text-sm"><span>{t('meetings.agenda')}</span><textarea maxLength={3000} disabled={locked||mutation.isPending} value={agenda} onChange={e=>{setAgenda(e.target.value);requestId.current='';}} className="min-h-24 w-full rounded-lg border border-input bg-background p-3"/></label>

    {startsAt&&endsAt&&Date.parse(endsAt)<=Date.parse(startsAt)&&<p role="alert" className="text-sm text-destructive">{t('meetings.invalidEnd')}</p>}

    {mutation.isError&&<p role="alert" className="text-sm text-destructive">{t(locked?'meetings.uncertain':mutation.error instanceof ApiError&&mutation.error.status===409?'meetings.conflict':'meetings.error')}</p>}

    <Button type="submit" disabled={mutation.isPending||(startsAt===localInputValue(new Date(meeting.startsAt))&&endsAt===(meeting.endsAt?localInputValue(new Date(meeting.endsAt)):''))||title.trim().length<2||!startsAt||!!endsAt&&Date.parse(endsAt)<=Date.parse(startsAt)}>{t(mutation.isPending?'common.saving':'meetings.submit')}</Button>

   </form>

 </Dialog></>;

}

