import assert from 'node:assert/strict';
import { toDraftRows } from './output-timeline';
import type { ProjectMilestonePhase4, ProjectOutputDocumentItem } from '@/types/project';

const milestones = [{ id: 'parent', start_date: '2026-11-02', duration_working_days: 9,
  due_date: '2026-11-12', workflow_stage: { default_role: 'SA' } }] as ProjectMilestonePhase4[];
const outputs = [
  { id: 'a', key: 'a', name: 'A', milestoneId: 'parent', isSelected: true, startDate: '2026-11-02', durationWorkingDays: 2, dueDate: '2026-11-03' },
  { id: 'b', key: 'b', name: 'B', milestoneId: 'parent', isSelected: true, startDate: '2026-11-10', durationWorkingDays: 3, dueDate: '2026-11-12' },
  { id: 'old', key: 'old', name: 'Old phase', milestoneId: 'previous-phase', isSelected: true },
] as ProjectOutputDocumentItem[];
// Two independent consumers hydrate solely from the same server response.
const browserA = toDraftRows(milestones, outputs, 'OPERATIONAL_V2', 2);
const browserB = toDraftRows(structuredClone(milestones), structuredClone(outputs), 'OPERATIONAL_V2', 2);
assert.deepEqual(browserA, browserB);
assert.deepEqual(browserA.map(row => [row.outputDocumentId, row.startDate, row.durationWorkingDays, row.dueDate]), [
  ['a', '2026-11-02', '2', '2026-11-03'], ['b', '2026-11-10', '3', '2026-11-12'],
]);
const legacy = toDraftRows(milestones, [{ ...outputs[0], startDate: null, durationWorkingDays: null, dueDate: null }], 'OPERATIONAL_V2', 2);
assert.equal(legacy[0].startDate, milestones[0].start_date);
assert.equal(legacy[0].dueDate, milestones[0].due_date);
console.log('PASS independent server output schedules, phase isolation, legacy fallback');
