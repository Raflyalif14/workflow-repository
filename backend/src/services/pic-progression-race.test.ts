import assert from 'node:assert/strict';
import { supabaseAdmin } from '../config/supabase';
import { advanceToNextMilestone } from './workflow-progression.service';

async function main() {
  const original = supabaseAdmin.from;
  let milestoneReads = 0, guarded = false, storedPic: string | null = null;
  const next = { id: 'next', project_id: 'p', step_order: 2, status: 'CREATED', pic_id: null, workflow_stage: { default_role: 'SA' } };
  (supabaseAdmin as any).from = (table: string) => {
    const q: any = { select: () => q, eq: () => q,
      single: async () => ({ data: { id: 'p', status: 'ACTIVE', is_postponed: false, pic_id: milestoneReads ? 'new-pic' : 'old-pic' }, error: null }),
      order: async () => {
        milestoneReads++;
        return { data: [{ id: 'done', project_id: 'p', status: 'COMPLETED', step_order: 1 }, { ...next, pic_id: storedPic }], error: null };
      },
      update: (data: any) => {
        assert.equal(table, 'project_milestones'); assert.equal(data.pic_id, 'old-pic');
        // Assignment commits after the progression read, before this write.
        storedPic = 'new-pic'; return q;
      },
      is: (column: string, value: any) => { assert.equal(column, 'pic_id'); assert.equal(value, null); guarded = true; return q; },
      maybeSingle: async () => {
        if (!guarded) storedPic = 'old-pic';
        return { data: guarded ? null : { ...next, pic_id: storedPic, status: 'IN_PROGRESS' }, error: null };
      },
    };
    return q;
  };
  try {
    const result = await advanceToNextMilestone('p', 'done', { userId: 'head', role: 'HEAD_SA', fullName: 'Head' });
    assert(guarded); assert.equal(storedPic, 'new-pic'); assert.equal(result.started, false);
    assert.equal(result.blocked_reason, 'STALE_NEXT_MILESTONE');
    console.log('Progression stale read cannot overwrite a newer milestone PIC: passed (mock query race).');
  } finally { (supabaseAdmin as any).from = original; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
