"use client";
import Link from 'next/link';
import { useLanguage } from '@/components/i18n/language-provider';
import type { DashboardData } from '@/types/dashboard';
import { formatDashboardDate } from '@/lib/dashboard-ux';
import { getPriorityTasks } from '@/lib/dashboard-tasks';

export function TaskPanels({ tasks, loading }: { tasks: NonNullable<DashboardData['workTasks']>; loading: boolean }) {
  const { t } = useLanguage();
  const priority = getPriorityTasks(tasks);
  const list = [...tasks].sort((a,b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.id.localeCompare(b.id));
  return <div className="grid min-w-0 gap-4 xl:grid-cols-2">{([['priority', priority], ['taskList', list]] as const).map(([kind, items]) =>
    <section key={kind} aria-labelledby={kind === 'priority' ? 'next-task-heading' : 'quick-insights-heading'} className="dashboard-surface min-w-0 p-5">
      <h2 id={kind === 'priority' ? 'next-task-heading' : 'quick-insights-heading'} className="text-base font-semibold">{t(`workflowUpdate.${kind}`)}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t(kind === 'priority' ? 'workflowUpdate.priorityHelp' : 'workflowUpdate.taskListHelp')}</p>
      {loading ? <p role="status" className="mt-4 text-sm text-muted-foreground">{t('common.loading')}</p> : items.length ? <ul className="mt-4 max-h-[32rem] divide-y divide-border overflow-y-auto">{items.map(task => <li key={task.id}><Link href={task.href || `/projects/${task.projectId}#project-milestone-${task.id}`} className="block min-w-0 rounded-lg py-3 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><p className="break-words text-sm font-medium">{task.name}</p><p className="mt-1 break-words text-xs text-muted-foreground">{task.projectName}</p><p className="mt-1 text-xs text-primary">Deadline: {task.dueDate ? formatDashboardDate(task.dueDate) : t('workflowUpdate.noDeadline')}</p></Link></li>)}</ul>
        : <p className="mt-4 text-sm text-muted-foreground">{t(kind === 'priority' ? 'workflowUpdate.noPriority' : 'copy.queueClear')}</p>}
    </section>)}</div>;
}
