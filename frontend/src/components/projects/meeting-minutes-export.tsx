"use client";
import {useEffect,useRef,useState} from 'react';
import {Download} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useLanguage} from '@/components/i18n/language-provider';
import {SessionChangedError} from '@/lib/api-client';
import {isCurrentSession} from '@/lib/auth';
import {loadMeetingMinutes} from '@/lib/meeting-minutes-request';
import type {Meeting} from '@/hooks/use-calendar';
export function MeetingMinutesExport({meeting}:{meeting:Meeting}){
 const {t,locale}=useLanguage();const [pending,setPending]=useState(false),[error,setError]=useState(false);
 const operation=useRef<AbortController|null>(null);
 useEffect(()=>()=>operation.current?.abort(),[]);
 const download=async()=>{
 if(operation.current)return;
 const controller=new AbortController();operation.current=controller;setPending(true);setError(false);
 try{
 const {meeting:saved,session}=await loadMeetingMinutes(meeting.projectId,meeting.id,controller.signal);
 const {createMeetingMinutesPdf,meetingMinutesFilename}=await import('@/lib/meeting-minutes-pdf');
 const blob=await createMeetingMinutesPdf(saved,locale);controller.signal.throwIfAborted();
 if(!isCurrentSession(session))throw new SessionChangedError();
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=meetingMinutesFilename(saved);document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch{if(!controller.signal.aborted)setError(true);}finally{if(operation.current===controller){operation.current=null;if(!controller.signal.aborted)setPending(false);}}
 };
 return <div><Button type="button" size="sm" variant="outline" disabled={pending} onClick={()=>void download()}><Download className="mr-1 h-4 w-4"/>{t(pending?'meetings.exportingMinutes':'meetings.exportMinutes')}</Button>{error&&<p role="alert" className="mt-2 text-xs text-destructive">{t('meetings.exportMinutesFailed')}</p>}</div>;
}
