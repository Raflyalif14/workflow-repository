import assert from 'node:assert/strict';
import { calendarDays, deadlineState, milestoneCalendarHref, shiftCalendarMonth } from './deadline-calendar';
import type { DeadlineEvent } from '../types/deadline-calendar';

const days = calendarDays('2026-10');
assert.equal(days.length, 35);
assert.deepEqual(days.slice(0, 5), [null, null, null, '2026-10-01', '2026-10-02']);
assert.equal(calendarDays('2024-02').filter(Boolean).length, 29);
assert.equal(calendarDays('2025-02').filter(Boolean).length, 28);
assert.equal(calendarDays('2026-02').length, 35);
assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01');
assert.equal(shiftCalendarMonth('2027-01', -1), '2026-12');
assert.equal(shiftCalendarMonth('1000-01', -1), '1000-01');
assert.equal(shiftCalendarMonth('9998-12', 1), '9998-12');
const event: DeadlineEvent = { id: 'milestone', name: 'Proposal', status: 'IN_PROGRESS', dueDate: '2026-10-21',
  project: { id: 'project', name: 'Project', status: 'ACTIVE', is_postponed: false } };
assert.equal(deadlineState(event, '2026-10-21'), 'today');
assert.equal(deadlineState(event, '2026-10-22'), 'overdue');
assert.equal(deadlineState(event, '2026-10-20'), 'upcoming');
assert.equal(deadlineState({ ...event, status: 'COMPLETED' }, '2026-10-22'), 'completed');
assert.equal(deadlineState({ ...event, status: 'APPROVED' }, '2026-10-22'), 'completed');
assert.equal(deadlineState({ ...event, project: { ...event.project, is_postponed: true } }, '2026-10-22'), 'paused');
for (const status of ['WON', 'LOST', 'COMPLETED', 'CANCELLED'])
  assert.equal(deadlineState({ ...event, project: { ...event.project, status } }, '2026-10-22'), 'closed');
assert.equal(milestoneCalendarHref(event), '/projects/project#project-milestone-milestone');
console.log('Deadline calendar: Monday grid, leap year, year boundaries, workflow states and project anchor passed.');
