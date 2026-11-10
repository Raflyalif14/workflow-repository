"use client";
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {CalendarDays,ChevronLeft,ChevronRight,Clock,Flag,Video} from 'lucide-react';
import {useLanguage} from '@/components/i18n/language-provider';
import {useAuth} from '@/components/auth/auth-provider';
import {Button} from '@/components/ui/button';
import {MeetingApprovalQueue} from '@/components/projects/project-meetings';
import {useCalendarEvents,CalendarEvent} from '@/hooks/use-calendar';
import {dateKey,eventsOnDay,monthGrid,offsetDate} from '@/lib/calendar-view';
import {getIntlLocale,translateMilestoneStatus} from '@/i18n';

const tone=(kind:CalendarEvent['kind'])=>kind==='meeting'?'border-primary/20 bg-primary/10 text-primary':kind==='milestone-start'?'border-success/20 bg-success/10 text-success':'border-warning/20 bg-warning/10 text-warning';
const dotColor=(kind:CalendarEvent['kind'])=>kind==='meeting'?'bg-primary':kind==='milestone-start'?'bg-[hsl(var(--success))]':'bg-[hsl(var(--warning))]';
export default function CalendarPage(){
 const {t,formatDate}=useLanguage(),{user}=useAuth();
 const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const [selected,setSelected]=useState(()=>new Date()),[filter,setFilter]=useState('ALL');
 const days=useMemo(()=>monthGrid(month),[month]);
 const end=new Date(days[41].getFullYear(),days[41].getMonth(),days[41].getDate()+1);
 const query=useCalendarEvents(offsetDate(days[0]),offsetDate(end));
 const events=(query.data||[]).filter(event=>filter==='ALL'||event.kind===filter);
 const agenda=eventsOnDay(events,selected);
 const move=(direction:number)=>{const next=new Date(month.getFullYear(),month.getMonth()+direction,1);setMonth(next);setSelected(next);};
 const today=()=>{const now=new Date();setMonth(new Date(now.getFullYear(),now.getMonth(),1));setSelected(now);};
 const label=(kind:CalendarEvent['kind'])=>t(kind==='meeting'?'meetings.meeting':kind==='milestone-start'?'meetings.milestoneStart':'meetings.milestoneDue');
 return <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
  <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">{t('meetings.schedule')}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{t('meetings.calendar')}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t(user?.role==='SA'?'meetings.calendarPersonal':'meetings.calendarHelp')}</p></div><CalendarDays className="hidden h-10 w-10 text-primary/60 sm:block"/></header>
  <section className="page-surface overflow-hidden">
   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:p-5"><div className="flex items-center gap-2"><Button size="icon" variant="outline" aria-label={t('meetings.previousMonth')} onClick={()=>move(-1)}><ChevronLeft className="h-4 w-4"/></Button><h2 className="min-w-40 text-center font-semibold">{new Intl.DateTimeFormat(getIntlLocale(),{month:'long',year:'numeric'}).format(month)}</h2><Button size="icon" variant="outline" aria-label={t('meetings.nextMonth')} onClick={()=>move(1)}><ChevronRight className="h-4 w-4"/></Button></div><div className="flex gap-2"><Button variant="outline" onClick={today}>{t('meetings.today')}</Button><select aria-label={t('meetings.eventType')} value={filter} onChange={e=>setFilter(e.target.value)} className="max-w-48 rounded-lg border border-input bg-card px-3 text-sm"><option value="ALL">{t('meetings.allEvents')}</option><option value="meeting">{t('meetings.meeting')}</option><option value="milestone-start">{t('meetings.milestoneStart')}</option><option value="milestone-due">{t('meetings.milestoneDue')}</option></select></div></div>
   <div className="flex flex-wrap gap-4 border-b border-border px-5 py-3 text-xs text-muted-foreground">{(['meeting','milestone-start','milestone-due'] as const).map(kind=><span key={kind} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${dotColor(kind)}`}/>{label(kind)}</span>)}</div>
   {query.isLoading&&<p role="status" className="p-5 text-sm text-muted-foreground">{t('common.loading')}</p>}
   {query.isError&&<div role="alert" className="space-y-2 p-5 text-sm text-destructive"><p>{t('meetings.loadError')}</p><Button variant="outline" onClick={()=>query.refetch()}>{t('common.retry')}</Button></div>}
   <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
    <div className="min-w-0"><div className="grid grid-cols-7 border-b border-border bg-muted/30">{days.slice(0,7).map(day=><div key={dateKey(day)} className="py-3 text-center text-xs font-medium text-muted-foreground">{new Intl.DateTimeFormat(getIntlLocale(),{weekday:'short'}).format(day)}</div>)}</div>
     <div className="grid grid-cols-7">{days.map(day=>{
      const items=eventsOnDay(events,day),key=dateKey(day),active=key===dateKey(selected),current=key===dateKey(new Date());
      return <button type="button" key={key} aria-pressed={active} aria-label={t('meetings.dayEvents',{date:formatDate(day,{dateStyle:'full'}),count:items.length})} onClick={()=>setSelected(day)} className={`min-h-20 min-w-0 border-b border-r border-border p-1.5 text-left transition-colors hover:bg-primary/5 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:min-h-32 sm:p-2 ${active?'bg-primary/5':''} ${day.getMonth()!==month.getMonth()?'bg-muted/20 text-muted-foreground':'text-foreground'}`}>
       <span className={`mb-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${current?'bg-primary text-primary-foreground':active?'bg-primary/15 text-primary':''}`}>{day.getDate()}</span>
       <div className="hidden space-y-1 sm:block">{items.slice(0,3).map(item=><span key={item.id} className={`block truncate rounded-md border px-1.5 py-0.5 text-[10px] ${tone(item.kind)}`} title={`${item.projectName}: ${item.title}`}>{item.projectName ? <span className="font-semibold opacity-75">{item.projectName}: </span> : null}{item.title}</span>)}</div>
       {!!items.length&&<span className="block text-[10px] text-muted-foreground sm:hidden">{items.length}</span>}
       {items.length>3&&<span className="hidden text-[10px] text-muted-foreground sm:block">{t('meetings.more',{count:items.length-3})}</span>}
      </button>;
     })}</div>
    </div>
    <aside data-testid="calendar-agenda" aria-label={t("meetings.agenda")} className="min-w-0 border-t border-border bg-muted/10 p-4 lg:sticky lg:top-4 lg:self-start lg:border-l lg:border-t-0"><h2 className="font-semibold">{formatDate(selected,{dateStyle:'full'})}</h2><p className="mt-1 text-xs text-muted-foreground">{t('meetings.eventsCount',{count:agenda.length})}</p>
     {!query.isLoading&&!query.isError&&!agenda.length&&<p className="mt-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t('meetings.noEvents')}</p>}
     <div className="mt-4 max-h-[38rem] space-y-3 overflow-y-auto overscroll-contain pr-1">{agenda.map(event=><Link key={event.id} href={event.href} prefetch={true} className="block space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"><span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] ${tone(event.kind)}`}>{event.kind==='meeting'?<Video className="h-3 w-3"/>:<Flag className="h-3 w-3"/>}{label(event.kind)}</span><p className="break-words text-sm font-semibold">{event.title}</p><p className="break-words text-xs text-muted-foreground">{event.projectName}</p>{!event.allDay?<p className="flex items-start gap-1 text-xs text-primary"><Clock className="h-3 w-3 shrink-0"/>{formatDate(event.start,{dateStyle:'short',timeStyle:'short'})} – {event.end?formatDate(event.end,{dateStyle:'short',timeStyle:'short'}):t("meetings.endUnknown")}</p>:<p className="text-xs text-muted-foreground">{translateMilestoneStatus(event.status)}</p>}{event.picName&&<p className="text-xs text-muted-foreground">PIC SA: {event.picName}</p>}{event.location&&<p className="break-words text-xs text-muted-foreground">{event.location}</p>}{event.description&&<p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{event.description}</p>}</Link>)}</div>
    </aside>
   </div>
  </section>
  <p className="text-xs text-muted-foreground">{t('meetings.timezone',{zone:Intl.DateTimeFormat().resolvedOptions().timeZone})} {t('meetings.confirmedOnly')}</p>
  <MeetingApprovalQueue/>
 </div>;
}
