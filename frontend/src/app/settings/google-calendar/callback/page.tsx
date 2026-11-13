"use client";
import { useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useRepositorySession,requireRepositorySession } from '@/hooks/use-repository-session';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/components/i18n/language-provider';

export default function GoogleCalendarCallback(){
 const scope=useRepositorySession(),client=useQueryClient(),{t}=useLanguage();
 const started=useRef(false),[status,setStatus]=useState<'loading'|'success'|'failed'>('loading');
 useEffect(()=>{
  if(!scope.enabled||started.current)return;
  started.current=true;
  const params=new URLSearchParams(window.location.search),code=params.get('code'),state=params.get('state');
  window.history.replaceState(null,'',window.location.pathname);
  if(!code||!state||params.has('error')){setStatus('failed');return;}
  void apiClient('/google-calendar/complete',{method:'POST',body:JSON.stringify({code,state})})
   .then(()=>{requireRepositorySession(scope);void client.invalidateQueries({queryKey:['google-calendar']});setStatus('success');})
   .catch(()=>setStatus('failed'));
 },[scope,client]);
 return <section className="mx-auto my-8 max-w-xl space-y-4 rounded-xl border bg-card p-6"><h1 className="text-xl font-semibold">Google Calendar</h1>
  <p role={status==='failed'?'alert':'status'}>{t(status==='loading'?'common.loading':status==='success'?'googleCalendar.complete':'googleCalendar.failed')}</p>
  <Link href="/settings#google-calendar" className="inline-flex rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t('googleCalendar.back')}</Link>
 </section>;
}
