import { supabaseAdmin } from '../config/supabase';
import { applyProjectAccessScope, ProjectAccessActor } from './project-access.service';

type CalendarProject = { id: string; name: string; status: string; is_postponed: boolean };
type CalendarMilestone = { id: string; project_id: string; name: string; status: string; due_date: string };

export class CalendarRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function calendarMonthBounds(month: unknown) {
  if (typeof month !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) > 9998)
    throw new CalendarRequestError('Choose a valid calendar month (YYYY-MM).', 400);
  const year = Number(month.slice(0, 4)), number = Number(month.slice(5));
  const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
  return { month, from: `${month}-01`, until: `${next}-01` };
}

export async function getDeadlineCalendar(actor: ProjectAccessActor, requestedMonth: unknown) {
  if (!['SALES', 'SA', 'HEAD_SA', 'SUPER_ADMIN'].includes(actor.role))
    throw new CalendarRequestError('Forbidden', 403);
  const { month, from, until } = calendarMonthBounds(requestedMonth);
  const projects = new Map<string, CalendarProject>();
  // Explicit paging avoids silently losing projects at the database's row limit.
  for (let offset = 0; ; offset += 250) {
    // The shared scope helper is structural; avoid recursively expanding Supabase's query type.
    const query: any = supabaseAdmin.from('projects').select('id,name,status,is_postponed');
    const { data, error } = await applyProjectAccessScope(
      query, actor
    ).order('id', { ascending: true }).range(offset, offset + 249);
    if (error || !data) throw new Error('Calendar projects could not be loaded.');
    for (const project of data) projects.set(project.id, project);
    if (data.length < 250) break;
  }
  const milestones: CalendarMilestone[] = [];
  const ids = [...projects.keys()];
  // Bound the IN predicate as well as each result page. Do not issue one query per project.
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabaseAdmin.from('project_milestones')
        .select('id,project_id,name,status,due_date').in('project_id', batch)
        .gte('due_date', from).lt('due_date', until)
        .order('due_date', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499);
      if (error || !data) throw new Error('Calendar milestones could not be loaded.');
      milestones.push(...data);
      if (data.length < 500) break;
    }
  }
  const items = milestones.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id))
    .map(row => ({ id: row.id, name: row.name, status: row.status, dueDate: row.due_date,
      project: projects.get(row.project_id)! }));
  return { month, items };
}
