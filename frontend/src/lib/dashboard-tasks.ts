import type { DashboardData } from '@/types/dashboard';
type Task = NonNullable<DashboardData['workTasks']>[number];
export function getPriorityTasks(tasks: Task[]) {
  const meetings=tasks.filter(t=>t.kind==='MEETING'&&t.dueDate);
  const meetingTime=meetings.reduce<string|null>((date,t)=>!date||t.dueDate!<date?t.dueDate:date,null);
  const eligible = tasks.filter(t => t.placement!=='TASK_LIST'&&t.kind!=='MEETING'&&t.dueDate && !['COMPLETED','APPROVED'].includes(t.status));
  const nearest = eligible.reduce<string | null>((date, task) => !date || task.dueDate! < date ? task.dueDate : date, null);
  return [...eligible.filter(t => t.dueDate === nearest),...meetings.filter(t=>t.dueDate===meetingTime)].sort((a,b) => a.projectName.localeCompare(b.projectName) || a.id.localeCompare(b.id));
}
