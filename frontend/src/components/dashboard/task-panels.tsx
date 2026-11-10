"use client";
import Link from 'next/link';
import {useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import { useLanguage } from '@/components/i18n/language-provider';
import type { DashboardData } from '@/types/dashboard';
import { formatDashboardDate } from '@/lib/dashboard-ux';
import { getPriorityTasks } from '@/lib/dashboard-tasks';

export function TaskPanels({ tasks, loading }: { tasks: NonNullable<DashboardData['workTasks']>; loading: boolean }) {
  const priority = getPriorityTasks(tasks);
  const list = tasks.filter(task=>task.placement!=='PRIORITY').sort((a,b) => Number(b.action==='PRA_TENDER_DECISION')-Number(a.action==='PRA_TENDER_DECISION') || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.id.localeCompare(b.id));
  return <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2"><TaskPanel kind="priority" items={priority} loading={loading}/><TaskPanel kind="taskList" items={list} loading={loading}/></div>;
}
type Task=NonNullable<DashboardData['workTasks']>[number];
function TaskPanel({kind,items,loading}:{kind:'priority'|'taskList';items:Task[];loading:boolean}){
 const {t,formatDate}=useLanguage();
 const [expanded,setExpanded]=useState(false);
 const visible=expanded?items:items.slice(0,4);
 const listId=`dashboard-${kind}-items`;
 return     <section aria-labelledby={kind === 'priority' ? 'next-task-heading' : 'quick-insights-heading'} className="dashboard-surface min-w-0 overflow-hidden p-5">
      <h2 id={kind === 'priority' ? 'next-task-heading' : 'quick-insights-heading'} className="text-base font-semibold">{t(`workflowUpdate.${kind}`)}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t(kind === 'priority' ? 'workflowUpdate.priorityHelp' : 'workflowUpdate.taskListHelp')}</p>
      {loading ? <p role="status" className="mt-4 text-sm text-muted-foreground">{t('common.loading')}</p> : items.length ? <ul id={listId} aria-label={t(`workflowUpdate.${kind}`)} className="mt-4 divide-y divide-border rounded-lg">{visible.map(task => <li key={task.id}><Link href={task.href || `/projects/${task.projectId}#project-milestone-${task.id}`} className="block min-w-0 rounded-lg py-3 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><p className="break-words text-sm font-medium">{task.action==='PRA_TENDER_DECISION'?t('salesPhaseTask.title'):task.tenderResultTask?t('salesStage.resultTitle'):task.name}</p>{task.action==='PRA_TENDER_DECISION'&&<p className="mt-1 text-xs text-muted-foreground">{t('salesPhaseTask.help')}</p>}{task.salesTask&&<p className="mt-1 text-xs font-medium text-primary">{t('salesStage.task')}</p>}{task.kind&&<p className="mt-1 text-xs font-medium text-primary">{t(task.kind==='MEETING_REVIEW'?'meetings.pendingTitle':'meetings.meeting')}</p>}<p className="mt-1 break-words text-xs text-muted-foreground">{task.projectName}</p><p className="mt-1 text-xs text-primary">{task.action==='PRA_TENDER_DECISION'?t('salesPhaseTask.open'):<>{task.kind?t('meetings.starts'):'Deadline'}: {task.dueDate ? task.kind?formatDate(task.dueDate,{dateStyle:'medium',timeStyle:'short'}):formatDashboardDate(task.dueDate) : t('workflowUpdate.noDeadline')}</>}</p>{task.salesTask&&<p className="mt-1 text-xs font-medium text-primary">{t('salesStage.view')}</p>}</Link></li>)}</ul>
        : <p className="mt-4 text-sm text-muted-foreground">{t(kind === 'priority' ? 'workflowUpdate.noPriority' : 'copy.queueClear')}</p>}
      {!loading&&items.length>4&&<div className="mt-2 border-t border-border pt-2"><Button type="button" variant="ghost" className="w-full gap-2 text-primary hover:bg-primary/5" aria-expanded={expanded} aria-controls={listId} onClick={()=>setExpanded(value=>!value)}>{t(expanded?'taskPreview.less':'taskPreview.all',{count:items.length})}<ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded?'rotate-180':''}`}/></Button></div>}
    </section>;
}
