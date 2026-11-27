"use client";
import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useRepositorySession,requireRepositorySession } from '@/hooks/use-repository-session';
import { useLanguage } from '@/components/i18n/language-provider';
import { Button } from '@/components/ui/button';
import { Card,CardHeader,CardTitle,CardDescription,CardContent } from '@/components/ui/card';

export function GoogleCalendarSettings(){
 const scope=useRepositorySession(),client=useQueryClient(),{t,formatDate}=useLanguage();
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[confirm,setConfirm]=useState(false);
 const key=['google-calendar',...scope.key];
 const query=useQuery({queryKey:key,enabled:scope.enabled,
  refetchInterval:(q)=>(q.state.data?.status==='DISCONNECTING'?3000:30000),
  queryFn:()=>{requireRepositorySession(scope);return apiClient<{configured:boolean;status:string;lastSyncedAt:string|null;lastError:string|null}>('/google-calendar/status');}});
 const data=query.data;
 async function action(name:'connect'|'disconnect'){
  setBusy(true);setFailed(false);
  try{requireRepositorySession(scope);const result=await apiClient<{url?:string}>(`/google-calendar/${name}`,{method:'POST',body:'{}'});
   requireRepositorySession(scope);
   if(name==='connect'&&result.url){const url=new URL(result.url);if(url.origin!=='https://accounts.google.com')throw Error();window.location.assign(url.href);}
   else{setConfirm(false);await client.invalidateQueries({queryKey:key});await query.refetch();}
  }catch{setFailed(true);}finally{setBusy(false);}
 }
 return <Card id="google-calendar"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary"/>Google Calendar</CardTitle><CardDescription>{t('googleCalendar.help')}</CardDescription></CardHeader>
 <CardContent className="space-y-3">
  {query.isLoading&&<p role="status">{t('common.loading')}</p>}
  {(failed||query.isError)&&<p role="alert" className="text-sm text-destructive">{t('googleCalendar.failed')}</p>}
  {query.isError&&<Button variant="outline" onClick={()=>void query.refetch()}>{t('common.retry')}</Button>}
  {data&&!data.configured&&<p className="text-sm text-muted-foreground">{t('googleCalendar.setup')}</p>}
  {data?.configured&&<>
   <p role="status" className="text-sm font-medium">{t(data.status==='NOT_CONNECTED'?'googleCalendar.notConnected':data.status==='DISCONNECTING'?'googleCalendar.disconnecting':data.status==='RECONNECT'?'googleCalendar.reconnect':'googleCalendar.connected')}</p>
   {data.lastSyncedAt&&<p className="text-xs text-muted-foreground">{t('googleCalendar.lastSync')} {formatDate(data.lastSyncedAt,{dateStyle:'medium',timeStyle:'short'})}</p>}
   {data.lastError&&data.status!=='RECONNECT'&&<p className="text-sm text-destructive">{t('googleCalendar.syncFailed')}</p>}
   <p className="text-xs text-muted-foreground">{t('googleCalendar.estimate')}</p>
   {data.status==='NOT_CONNECTED'?<Button disabled={busy} onClick={()=>void action('connect')}>{t('googleCalendar.connect')}</Button>:
    data.status==='DISCONNECTING'?<Button variant="outline" disabled={busy} onClick={()=>void action('disconnect')}>{t('googleCalendar.retryDisconnect')}</Button>:
    <Button variant="outline" disabled={busy} onClick={()=>setConfirm(true)}>{t('googleCalendar.disconnect')}</Button>}
   {confirm&&<div className="space-y-3 rounded-lg border p-3"><p className="text-sm">{t('googleCalendar.disconnectHelp')}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>{t('common.cancel')}</Button><Button disabled={busy} onClick={()=>void action('disconnect')}>{t('googleCalendar.disconnect')}</Button></div></div>}
  </>}
 </CardContent></Card>;
}
