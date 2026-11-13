"use client";

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, ChevronDown, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/i18n/language-provider';
import type { DashboardData } from '@/types/dashboard';
import { formatDashboardDate } from '@/lib/dashboard-ux';
import { getPriorityTasks } from '@/lib/dashboard-tasks';
import { getLocalDateOnlyKey } from '@/lib/dates';

type Task = NonNullable<DashboardData['workTasks']>[number];

export function taskDeadlineDays(task: Task, now = new Date()): number | null {
  if (!task.dueDate) return null;
  const due = task.kind ? getLocalDateOnlyKey(new Date(task.dueDate)) : task.dueDate.slice(0, 10);
  return Math.round((Date.parse(due) - Date.parse(getLocalDateOnlyKey(now))) / 86400000);
}

export function TaskPanels({ tasks, loading }: { tasks: Task[]; loading: boolean }) {
  const { t, formatDate } = useLanguage();
  const [view, setView] = useState<'priority' | 'all'>('priority');
  const [expanded, setExpanded] = useState(false);
  const priority = getPriorityTasks(tasks);
  const list = [...tasks].sort((a, b) => Number(b.action === 'PRA_TENDER_DECISION') - Number(a.action === 'PRA_TENDER_DECISION')
    || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.id.localeCompare(b.id));
  const items = view === 'priority' ? priority : list;
  const visible = expanded ? items : items.slice(0, 4);

  return <section aria-labelledby="next-task-heading" className="dashboard-surface min-w-0 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-5">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><ListTodo aria-hidden="true" className="h-5 w-5" /></span>
        <div><h2 id="next-task-heading" className="text-base font-semibold">{t('taskHub.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('taskHub.help')}</p></div>
      </div>
      <div role="group" aria-label={t('taskHub.title')} className="flex rounded-xl bg-muted p-1">
        {(['priority', 'all'] as const).map(option => <button key={option} type="button" aria-pressed={view === option}
          onClick={() => { setView(option); setExpanded(false); }}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === option ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          {t(option === 'priority' ? 'workflowUpdate.priority' : 'taskHub.all')}
          {!loading && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{option === 'priority' ? priority.length : list.length}</span>}
        </button>)}
      </div>
    </div>
    {loading ? <p role="status" className="p-5 text-sm text-muted-foreground">{t('common.loading')}</p>
      : items.length ? <ul id="dashboard-task-items" aria-label={t(view === 'priority' ? 'workflowUpdate.priority' : 'taskHub.all')} className="divide-y divide-border px-5">
        {visible.map(task => {
          const days = taskDeadlineDays(task);
          const urgency = days === null ? null : days < 0 ? t('taskHub.overdue', { count: -days }) : days === 0 ? t('taskHub.today') : days === 1 ? t('taskHub.tomorrow') : null;
          return <li key={task.id}>
            <Link href={task.href || `/projects/${task.projectId}#project-milestone-${task.id}`}
              className="group flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted/50 sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold group-hover:text-primary">{task.action === 'PRA_TENDER_DECISION' ? t('salesPhaseTask.title') : task.tenderResultTask ? t('salesStage.resultTitle') : task.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="break-words">{task.projectName}</span>
                  {task.salesTask && <span>{t('salesStage.task')}</span>}
                  {task.kind && <span>{t(task.kind === 'MEETING_REVIEW' ? 'meetings.pendingTitle' : 'meetings.meeting')}</span>}
                </div>
                {task.action === 'PRA_TENDER_DECISION' && <p className="mt-1 text-xs text-muted-foreground">{t('salesPhaseTask.help')}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs sm:justify-end">
                <div className="space-y-1 sm:text-right">
                  {urgency && <span className={`inline-block rounded-full px-2 py-1 font-medium ${days! < 0 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{urgency}</span>}
                  <p className="text-muted-foreground">{task.dueDate ? task.kind ? formatDate(task.dueDate, { dateStyle: 'medium', timeStyle: 'short' }) : formatDashboardDate(task.dueDate) : t('workflowUpdate.noDeadline')}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-medium text-primary group-hover:bg-primary/10">{t('common.open')}<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></span>
              </div>
            </Link>
          </li>;
        })}
      </ul> : <p className="p-5 text-sm text-muted-foreground">{t(view === 'priority' ? 'workflowUpdate.noPriority' : 'copy.queueClear')}</p>}
    {!loading && items.length > 4 && <div className="border-t border-border px-5 py-2">
      <Button type="button" variant="ghost" className="w-full gap-2 text-primary hover:bg-primary/5" aria-expanded={expanded} aria-controls="dashboard-task-items" onClick={() => setExpanded(value => !value)}>
        {t(expanded ? 'taskPreview.less' : 'taskPreview.all', { count: items.length })}<ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </Button>
    </div>}
  </section>;
}
