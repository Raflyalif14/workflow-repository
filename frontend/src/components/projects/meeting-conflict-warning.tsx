"use client";
import {useEffect,useState} from 'react';
import {useLanguage} from '@/components/i18n/language-provider';
import {useMeetingConflicts} from '@/hooks/use-calendar';
import {Button} from '@/components/ui/button';
export function MeetingConflictWarning({projectId,startsAt,endsAt,meetingId}:{projectId:string;startsAt:string;endsAt:string|null;meetingId?:string}){
 const {t}=useLanguage();
 const valid=!!startsAt&&Number.isFinite(Date.parse(startsAt))&&(!endsAt||Number.isFinite(Date.parse(endsAt))&&Date.parse(endsAt)>Date.parse(startsAt));
 const key=valid?JSON.stringify([new Date(startsAt).toISOString(),endsAt?new Date(endsAt).toISOString():null]):'';
 const [settled,setSettled]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>setSettled(key),400);return()=>clearTimeout(timer);},[key]);
 const dates=settled?JSON.parse(settled) as [string,string|null]:['',null] as const;
 const query=useMeetingConflicts(projectId,dates[0],dates[1],meetingId);
 if(!valid)return null;
 if(key!==settled||query.isPending||query.isFetching)return <p role="status" className="text-xs text-muted-foreground">{t('meetings.checkingConflicts')}</p>;
 if(query.isError)return <div role="status" className="text-sm text-warning"><p>{t('meetings.conflictCheckFailed')}</p><Button type="button" size="sm" variant="outline" onClick={()=>query.refetch()}>{t('common.retry')}</Button></div>;
 return <div role="status" className={`space-y-1 rounded-lg border p-3 text-sm ${query.data.count?'border-warning/40 bg-warning/10':'border-border bg-muted/30'}`}>
 <p>{t(query.data.noPic?'meetings.picRequired':query.data.count?'meetings.overlapWarning':'meetings.noOverlap',{count:query.data.count})}</p>
 {query.data.limited&&<p className="text-xs text-muted-foreground">{t('meetings.limitedCheck')}</p>}
 <details className="pt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">{t('meetings.aboutCheck')}</summary><p className="pt-1">{t('meetings.conflictAdvisory')}</p></details>
 </div>;
}
