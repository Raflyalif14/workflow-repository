type ScheduledMilestone = { id?: string; start_date?: string | null; duration_working_days?: number | null; step_order?: number };
/** Planning dates determine presentation; step_order remains the stable stage identity. */
export function compareMilestoneSchedule(a: ScheduledMilestone, b: ScheduledMilestone) {
  const date = (value?: string | null) => value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '9999-12-31';
  const duration = (value?: number | null) => typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  return date(a.start_date).localeCompare(date(b.start_date)) || duration(a.duration_working_days) - duration(b.duration_working_days)
    || (a.step_order ?? 0) - (b.step_order ?? 0) || (a.id || '').localeCompare(b.id || '');
}

/** Work Stage is the earliest unfinished scheduled work, even if another stage has already started. */
export function getScheduledWorkStage<T extends ScheduledMilestone & { status: string }>(milestones: T[]): T | null {
  return [...milestones].filter(m => !['COMPLETED', 'APPROVED'].includes(m.status)).sort(compareMilestoneSchedule)[0] ?? null;
}
