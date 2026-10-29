import type { DashboardData } from '@/types/dashboard';
type Task = NonNullable<DashboardData['workTasks']>[number];
export function getPriorityTasks(tasks: Task[]) {
  const eligible = tasks.filter(t => t.dueDate && !['COMPLETED','APPROVED'].includes(t.status));
  const nearest = eligible.reduce<string | null>((date, task) => !date || task.dueDate! < date ? task.dueDate : date, null);
  return eligible.filter(t => t.dueDate === nearest).sort((a,b) => a.projectName.localeCompare(b.projectName) || a.id.localeCompare(b.id));
}
