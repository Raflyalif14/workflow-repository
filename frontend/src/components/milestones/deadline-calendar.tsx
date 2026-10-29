"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, CalendarCheck2, ChevronLeft, ChevronRight, Clock3, Loader2 } from 'lucide-react';
import { useLanguage } from '@/components/i18n/language-provider';
import { Button } from '@/components/ui/button';
import { useDeadlineCalendar } from '@/hooks/use-deadline-calendar';
import { getLocalDateOnlyKey } from '@/lib/dates';
import { calendarDays, deadlineState, milestoneCalendarHref, shiftCalendarMonth, type DeadlineState } from '@/lib/deadline-calendar';
import type { DeadlineEvent } from '@/types/deadline-calendar';

const tone: Record<DeadlineState, { dot: string; event: string; badge: string }> = {
  overdue: { dot: 'bg-destructive', event: 'border-destructive/30 bg-destructive/10 text-destructive', badge: 'bg-destructive/10 text-destructive' },
  today: { dot: 'bg-warning', event: 'border-warning/30 bg-warning/10 text-warning', badge: 'bg-warning/10 text-warning' },
  upcoming: { dot: 'bg-primary', event: 'border-primary/30 bg-primary-soft text-primary', badge: 'bg-primary-soft text-primary' },
  completed: { dot: 'bg-success', event: 'border-success/30 bg-success/10 text-success', badge: 'bg-success/10 text-success' },
  paused: { dot: 'bg-slate-400', event: 'border-border bg-muted text-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  closed: { dot: 'bg-slate-400', event: 'border-border bg-muted text-muted-foreground', badge: 'bg-muted text-muted-foreground' },
};

export function DeadlineCalendar() {
  const { locale, t } = useLanguage();
  const [today, setToday] = useState(getLocalDateOnlyKey);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const query = useDeadlineCalendar(month);
  useEffect(() => {
    const timer = setInterval(() => setToday(getLocalDateOnlyKey()), 60000);
    return () => clearInterval(timer);
  }, []);
  const dateLocale = locale === 'id' ? 'id-ID' : 'en-US';
  const format = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(dateLocale, { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  const items = !query.isError && query.data?.month === month ? query.data.items : [];
  const byDay = new Map<string, DeadlineEvent[]>();
  for (const event of items) byDay.set(event.dueDate, [...(byDay.get(event.dueDate) || []), event]);
  const agenda = byDay.get(selected) || [];
  const changeMonth = (next: string) => { setMonth(next); setSelected(next === today.slice(0, 7) ? today : `${next}-01`); };
  const loading = query.isLoading || query.isPending;
  const summaries = [
    { label: 'total' as const, count: items.length, icon: CalendarDays, className: 'text-primary bg-primary/10' },
    { label: 'overdue' as const, count: items.filter(item => deadlineState(item, today) === 'overdue').length, icon: Clock3, className: 'text-destructive bg-destructive/10' },
    { label: 'completed' as const, count: items.filter(item => deadlineState(item, today) === 'completed').length, icon: CalendarCheck2, className: 'text-success bg-success/10' },
  ];

  return <section data-deadline-calendar className="space-y-5">
    <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-primary-soft via-card to-accent px-5 py-6 sm:px-7">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-card p-2.5 text-primary shadow-sm"><CalendarDays className="h-6 w-6" aria-hidden="true" /></span>
        <div><h2 className="text-xl font-semibold text-foreground">{t('deadlineCalendar.title')}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t('deadlineCalendar.description')}</p></div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
        {summaries.map(({ label, count, icon: Icon, className }) => <div key={label} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card/85 p-3 sm:p-4">
          <span className={`hidden rounded-lg p-2 sm:block ${className}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <div><p className="text-xl font-semibold tabular-nums text-foreground sm:text-2xl">{loading || query.isError ? '—' : count}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t(`deadlineCalendar.${label}`)}</p></div>
        </div>)}
      </div>
    </div>

    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4 sm:px-6">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 text-lg font-semibold capitalize text-foreground" aria-live="polite">{format(`${month}-01`, { month: 'long', year: 'numeric' })}</h3>
          {query.isFetching && !loading && <Loader2 className="h-4 w-4 animate-spin text-primary" role="status" aria-label={t('deadlineCalendar.updating')} />}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => changeMonth(today.slice(0, 7))}>{t('deadlineCalendar.todayButton')}</Button>
          <Button size="sm" variant="ghost" aria-label={t('deadlineCalendar.previousMonth')} disabled={month === '1000-01'} onClick={() => changeMonth(shiftCalendarMonth(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" aria-label={t('deadlineCalendar.nextMonth')} disabled={month === '9998-12'} onClick={() => changeMonth(shiftCalendarMonth(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-border/60 bg-muted/60 px-4 py-3 sm:px-6">
        {(['overdue', 'today', 'upcoming', 'completed'] as const).map(state => <span key={state} className="flex items-center gap-1.5 text-xs text-muted-foreground"><i className={`h-2 w-2 rounded-full ${tone[state].dot}`} aria-hidden="true" />{t(`deadlineCalendar.${state}`)}</span>)}
      </div>
      {query.isError ? <div role="alert" className="space-y-3 px-5 py-16 text-center text-sm text-muted-foreground"><p>{t('deadlineCalendar.error')}</p><Button variant="outline" onClick={() => void query.refetch()}>{t('deadlineCalendar.retry')}</Button></div>
        : loading ? <div role="status" className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('deadlineCalendar.loading')}</div>
        : <>
          {!items.length && <div role="status" className="border-b border-border/60 bg-primary-soft/40 px-5 py-4"><p className="text-sm font-medium text-foreground">{t('deadlineCalendar.emptyMonth')}</p><p className="mt-1 text-xs text-muted-foreground">{t('deadlineCalendar.emptyMonthHelp')}</p></div>}
          <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0" role="group" aria-label={t('deadlineCalendar.monthLabel')}>
              <div className="grid grid-cols-7 border-b border-border/60 bg-muted/50">
                {Array.from({ length: 7 }, (_, i) => <div key={i} className="py-3 text-center text-[11px] font-medium text-muted-foreground sm:text-xs">{format(`2026-06-${String(i + 1).padStart(2, '0')}`, { weekday: 'short' })}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {calendarDays(month).map((day, index) => {
                  const events = day ? byDay.get(day) || [] : [];
                  const dayLabel = day ? format(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
                  return <div key={day || `blank-${index}`} className={`min-w-0 border-b border-r border-border/50 p-0.5 sm:p-1.5 ${day ? selected === day ? 'bg-primary-soft/60 ring-1 ring-inset ring-primary/40' : 'bg-card' : 'bg-muted/60'} min-h-[68px] sm:min-h-[132px]`}>
                    {day && <>
                      <button type="button" data-calendar-day={day} aria-pressed={selected === day} aria-current={today === day ? 'date' : undefined}
                        aria-label={`${t('deadlineCalendar.selectDay', { date: dayLabel })}, ${t('deadlineCalendar.count', { count: events.length })}`}
                        onClick={() => setSelected(day)} className="flex w-full items-center justify-center rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:justify-start">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${today === day ? 'bg-primary text-primary-foreground' : selected === day ? 'bg-accent text-primary' : 'text-foreground'}`}>{Number(day.slice(8))}</span>
                      </button>
                      <div className="hidden space-y-1 sm:block">
                        {events.slice(0, 2).map(event => <Link key={event.id} href={milestoneCalendarHref(event)} title={`${event.project.name} · ${event.name}`} className={`block truncate rounded border-l-2 px-1.5 py-1 text-[10px] font-medium leading-4 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tone[deadlineState(event, today)].event}`}>{event.name}</Link>)}
                        {events.length > 2 && <button type="button" onClick={() => setSelected(day)} className="w-full rounded px-1 py-0.5 text-left text-[10px] font-medium text-primary hover:bg-accent">{t('deadlineCalendar.more', { count: events.length - 2 })}</button>}
                      </div>
                      <div className="mt-1 flex justify-center gap-0.5 sm:hidden" aria-hidden="true">{events.slice(0, 3).map(event => <i key={event.id} className={`h-1.5 w-1.5 rounded-full ${tone[deadlineState(event, today)].dot}`} />)}{events.length > 3 && <span className="text-[8px] leading-none text-muted-foreground">+</span>}</div>
                    </>}
                  </div>;
                })}
              </div>
            </div>
            <aside className="min-w-0 bg-muted/50 p-4 sm:p-5 xl:border-l xl:border-border/60" aria-label={t('deadlineCalendar.agenda')}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{t('deadlineCalendar.agenda')}</p>
              <h4 className="mt-1 text-base font-semibold capitalize text-foreground">{format(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
              <p className="mt-1 text-xs text-muted-foreground">{t('deadlineCalendar.count', { count: agenda.length })}</p>
              <div className="mt-5 space-y-3">
                {agenda.length ? agenda.map(event => {
                  const state = deadlineState(event, today);
                  return <Link data-calendar-event={event.id} key={event.id} href={milestoneCalendarHref(event)} className="group block rounded-xl border border-border/70 bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium ${tone[state].badge}`}><i className={`h-1.5 w-1.5 rounded-full ${tone[state].dot}`} aria-hidden="true" />{t(`deadlineCalendar.${state}`)}</span>
                    <p className="mt-3 break-words text-sm font-semibold text-foreground group-hover:text-primary">{event.name}</p>
                    <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{event.project.name}</p>
                    <span className="mt-4 flex items-center gap-1 text-xs font-medium text-primary">{t('deadlineCalendar.open')}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
                  </Link>;
                }) : <div className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-8 text-center"><CalendarDays className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" /><p className="mt-3 text-sm font-medium text-foreground">{t('deadlineCalendar.emptyDay')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('deadlineCalendar.emptyDayHelp')}</p></div>}
              </div>
            </aside>
          </div>
        </>}
      <p className="border-t border-border/60 px-4 py-3 text-xs leading-5 text-muted-foreground sm:px-6">{t('deadlineCalendar.note')}</p>
    </div>
  </section>;
}
