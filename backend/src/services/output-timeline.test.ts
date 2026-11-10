import assert from 'node:assert/strict';
import { calculateOutputTimeline } from './output-timeline';
import { HolidayService } from './holiday.service';
import { saveProjectTimelineSchema } from '../validators/project-plan.validator';

async function main() {
  const original = HolidayService.getActiveHolidaysBetween;
  HolidayService.getActiveHolidaysBetween = async () => ['2026-11-11'];
  try {
    const id = '11111111-1111-4111-8111-111111111111';
    const a = '22222222-2222-4222-8222-222222222222', b = '33333333-3333-4333-8333-333333333333';
    const entries = [{ milestoneId: id, outputDocumentId: a, startDate: '2026-11-02', durationWorkingDays: 2 },
      { milestoneId: id, outputDocumentId: b, startDate: '2026-11-10', durationWorkingDays: 3 }];
    const outputs = [a,b].map(id2 => ({ id: id2, milestone_id: id, is_selected: true, is_required: false }));
    assert(saveProjectTimelineSchema.safeParse({ milestones: entries }).success);
    assert(!saveProjectTimelineSchema.safeParse({ milestones: [entries[0],entries[0]] }).success);
    const result = await calculateOutputTimeline(entries, outputs);
    assert.deepEqual(result.outputs.map(row => [row.id,row.start_date,row.due_date]), [
      [a,'2026-11-02','2026-11-03'], [b,'2026-11-10','2026-11-13'],
    ]);
    assert.deepEqual(result.milestones, [{ id, start_date:'2026-11-02', due_date:'2026-11-13', duration_working_days:9 }]);
    await assert.rejects(calculateOutputTimeline(entries.slice(0,1), outputs), /every selected output/);
    await assert.rejects(calculateOutputTimeline(entries, []), /not selected/);
    await assert.rejects(calculateOutputTimeline([...entries, { milestoneId:id,startDate:'2026-11-02',durationWorkingDays:1 }], outputs), /Cannot mix/);
    await assert.rejects(calculateOutputTimeline([{ ...entries[0], milestoneId:b }], outputs), /not selected/);
    console.log('PASS output identity, unique entries, phase ownership, full parent coverage, working days and holidays');
  } finally { HolidayService.getActiveHolidaysBetween = original; }
}
main().catch(error => { console.error(error); process.exitCode=1; });
