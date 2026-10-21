import type { DeadlineEvent } from '@/types/deadline-calendar';

export type DeadlineState = 'completed' | 'paused' | 'closed' | 'overdue' | 'today' | 'upcoming';

export function deadlineState(event: DeadlineEvent, today: string): DeadlineState {
  if (['COMPLETED', 'APPROVED'].includes(event.status)) return 'completed';
  if (event.project.is_postponed || event.project.status === 'POSTPONED') return 'paused';
  if (['WON', 'LOST', 'COMPLETED', 'CANCELLED'].includes(event.project.status)) return 'closed';
  return event.dueDate < today ? 'overdue' : event.dueDate === today ? 'today' : 'upcoming';
}

export function shiftCalendarMonth(month: string, direction: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  const year = date.getUTCFullYear();
  return year >= 1000 && year <= 9998 ? date.toISOString().slice(0, 7) : month;
}

export function calendarDays(month: string): Array<string | null> {
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + last) / 7) * 7 }, (_, i) => {
    const day = i - offset + 1;
    return day >= 1 && day <= last ? `${month}-${String(day).padStart(2, '0')}` : null;
  });
}

export function milestoneCalendarHref(event: DeadlineEvent) {
  return `/projects/${event.project.id}#project-milestone-${event.id}`;
}
