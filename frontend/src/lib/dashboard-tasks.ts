import type { DashboardData } from '@/types/dashboard';

type Task = NonNullable<DashboardData['workTasks']>[number];

const isPriorityAction = (t: Task) =>
  !['COMPLETED', 'APPROVED'].includes(t.status) &&
  t.placement !== 'TASK_LIST' &&
  t.kind !== 'MEETING' &&
  (t.action === 'PRA_TENDER_DECISION' || t.id.startsWith('phase-decision-') || t.id.startsWith('plan-') || t.placement === 'PRIORITY');

export function getPriorityTasks(tasks: Task[]) {
  const meetings = tasks.filter(t => t.kind === 'MEETING' && t.dueDate);
  const meetingTime = meetings.reduce<string | null>((date, t) => !date || t.dueDate! < date ? t.dueDate : date, null);
  const actionTasks = tasks.filter(isPriorityAction);
  const eligible = tasks.filter(t => t.placement !== 'TASK_LIST' && t.kind !== 'MEETING' && t.dueDate && !['COMPLETED', 'APPROVED'].includes(t.status) && !isPriorityAction(t));
  const nearest = eligible.reduce<string | null>((date, task) => !date || task.dueDate! < date ? task.dueDate : date, null);
  return [
    ...actionTasks,
    ...eligible.filter(t => t.dueDate === nearest),
    ...meetings.filter(t => t.dueDate === meetingTime),
  ].sort((a, b) => a.projectName.localeCompare(b.projectName) || a.id.localeCompare(b.id));
}
