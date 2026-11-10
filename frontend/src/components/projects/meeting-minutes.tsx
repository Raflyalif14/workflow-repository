"use client";
import {MeetingMinutesExport} from './meeting-minutes-export';
import {useRef,useState} from 'react';
import {useAuth} from '@/components/auth/auth-provider';
import {useLanguage} from '@/components/i18n/language-provider';
import {Button} from '@/components/ui/button';
import {Dialog,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {ApiError} from '@/lib/api-client';
import {Meeting,useMeetingMutation} from '@/hooks/use-calendar';
export function MeetingMinutes({meeting}:{meeting:Meeting}){
 const {user}=useAuth(),{t,formatDate}=useLanguage();
 const [open,setOpen]=useState(false);
 const eligible=meeting.status==='APPROVED'&&!meeting.proposedSchedule&&Date.parse(meeting.endsAt||meeting.startsAt)<=Date.now();
 const canEdit=eligible&&['SALES','SA','HEAD_SA'].includes(user?.role||'');
 return <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
 <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{t('meetings.minutesTitle')}</h4>{meeting.minutes&&<MeetingMinutesExport meeting={meeting}/>} {canEdit&&<Button size="sm" variant="outline" onClick={()=>setOpen(true)}>{t(meeting.minutes?'meetings.editMinutes':'meetings.addMinutes')}</Button>}</div>
 {meeting.minutes?<><div className="grid gap-3">{(['notes','decisions','followUp'] as const).map(field=><div key={field}><p className="text-xs font-medium text-muted-foreground">{t(`meetings.${field}`)}</p><p className="whitespace-pre-wrap break-words text-sm">{meeting.minutes?.[field]||'—'}</p></div>)}</div>{meeting.minutesUpdatedAt&&<p className="text-xs text-muted-foreground">{t('meetings.minutesUpdated',{name:meeting.minutesAuthor||'—',date:formatDate(meeting.minutesUpdatedAt,{dateStyle:'medium',timeStyle:'short'})})}</p>}</>:<p className="text-xs text-muted-foreground">{t(eligible?'meetings.noMinutes':'meetings.minutesAfterMeeting')}</p>}
 {open&&<MinutesEditor meeting={meeting} onClose={()=>setOpen(false)}/>}
 </section>;
}
function MinutesEditor({meeting,onClose}:{meeting:Meeting;onClose:()=>void}){
 const {t}=useLanguage(),mutation=useMeetingMutation(true);
 const [snapshot]=useState(meeting),[notes,setNotes]=useState(meeting.minutes?.notes||''),[decisions,setDecisions]=useState(meeting.minutes?.decisions||''),[followUp,setFollowUp]=useState(meeting.minutes?.followUp||''),[completed,setCompleted]=useState(false);
 const request=useRef('');
 const uncertain=mutation.isError&&(!(mutation.error instanceof ApiError)||mutation.error.status>=500);
 const disabled=mutation.isPending||uncertain;
 const submit=async()=>{request.current||=crypto.randomUUID();try{await mutation.mutateAsync({projectId:snapshot.projectId,meetingId:snapshot.id,body:{requestId:request.current,revision:snapshot.revision,completed,notes,decisions,followUp}});onClose();}catch{}};
 return <Dialog open onOpenChange={value=>{if(!value&&!mutation.isPending)onClose();}}><DialogHeader><DialogTitle>{t('meetings.minutesTitle')}</DialogTitle></DialogHeader>
 <form className="space-y-4" onSubmit={e=>{e.preventDefault();void submit();}}><p className="text-sm font-medium">{snapshot.title}</p><p className="text-xs text-muted-foreground">{t('meetings.requiredHelp')}</p>
 {([{key:'notes',value:notes,set:setNotes},{key:'decisions',value:decisions,set:setDecisions},{key:'followUp',value:followUp,set:setFollowUp}] as const).map(field=><label key={field.key} className="block space-y-1 text-sm"><span>{t(`meetings.${field.key}`)} {field.key==='notes'&&<span aria-hidden="true" className="text-destructive">*</span>}</span><textarea required={field.key==='notes'} maxLength={10000} disabled={disabled} value={field.value} onChange={e=>{field.set(e.target.value);request.current='';}} className="min-h-24 w-full rounded-lg border border-input bg-background p-3"/></label>)}
 <p className="text-xs text-muted-foreground">{t('meetings.followUpHelp')}</p>
 <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={completed} disabled={disabled} onChange={e=>{setCompleted(e.target.checked);request.current='';}}/>{t('meetings.confirmCompleted')} <span aria-hidden="true" className="text-destructive">*</span></label>
 {mutation.isError&&<p role="alert" className="text-sm text-destructive">{t(uncertain?'meetings.uncertain':mutation.error instanceof ApiError&&mutation.error.status===409?'meetings.conflict':'meetings.error')}</p>}
 <Button type="submit" disabled={mutation.isPending||!notes.trim()||!completed}>{t(mutation.isPending?'common.saving':'meetings.saveMinutes')}</Button>
 </form></Dialog>;
}
