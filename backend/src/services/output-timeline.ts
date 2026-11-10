import { DeadlineService } from './deadline.service';
import { HolidayService } from './holiday.service';
import { calculateWorkingDaysBetween } from '../utils/dates';
import type { SaveProjectTimelineInput } from '../validators/project-plan.validator';

type OutputRow = { id: string; milestone_id: string; is_selected: boolean; is_required: boolean };

// A parent stage spans the earliest start through the latest output deadline.
// Output dates remain independent; the parent is only a workflow summary.
export async function calculateOutputTimeline(entries: SaveProjectTimelineInput['milestones'], outputs: OutputRow[]) {
  const selected = outputs.filter(row => row.is_selected || row.is_required);
  const updates = [];
  const parents = new Map<string, { start_date: string; due_date: string }>();
  for (const entry of entries) {
    if (!entry.outputDocumentId) continue;
    const output = selected.find(row => row.id === entry.outputDocumentId && row.milestone_id === entry.milestoneId);
    if (!output) throw new Error('Output document is not selected in this project phase.');
    const calculated = await DeadlineService.calculateDeadline(entry.startDate, entry.durationWorkingDays);
    updates.push({ id: output.id, milestone_id: output.milestone_id, ...calculated });
    const previous = parents.get(output.milestone_id);
    parents.set(output.milestone_id, {
      start_date: previous && previous.start_date < calculated.start_date ? previous.start_date : calculated.start_date,
      due_date: previous && previous.due_date > calculated.due_date ? previous.due_date : calculated.due_date,
    });
  }
  for (const output of selected) {
    if (parents.has(output.milestone_id) && !updates.some(row => row.id === output.id)) {
      throw new Error('Include every selected output for the milestone when saving its timeline.');
    }
  }
  if (entries.some(entry => !entry.outputDocumentId && parents.has(entry.milestoneId))) {
    throw new Error('Cannot mix a parent timeline with its output timelines.');
  }
  const milestones = [];
  for (const [id, dates] of parents) {
    const holidays = await HolidayService.getActiveHolidaysBetween(dates.start_date, dates.due_date);
    milestones.push({ id, ...dates, duration_working_days: calculateWorkingDaysBetween(dates.start_date, dates.due_date, holidays) });
  }
  return { outputs: updates, milestones };
}
