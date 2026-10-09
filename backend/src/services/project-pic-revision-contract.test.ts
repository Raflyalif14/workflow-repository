import assert from 'node:assert/strict';
import { supabaseAdmin } from '../config/supabase';
import { ProjectManagementService } from './project-management.service';

async function main() {
  const original = supabaseAdmin.from;
  let row: any = { id: 'fixture-project', sales_id: 'fixture-sales', pic_revision: 1, pic_revision_exact: '1' };
  (supabaseAdmin as any).from = (table: string) => {
    const q: any = { select: () => q, eq: () => q, neq: () => q, in: () => q, order: () => q, range: () => q, single: async () => ({ data: row, error: null }),
      then: (resolve: any, reject: any) => Promise.resolve({ data: table === 'projects' ? [row] : [], error: null, count: 1 }).then(resolve, reject) };
    return q;
  };
  const actor = { userId: 'fixture-head', role: 'HEAD_SA', fullName: 'Synthetic Head' };
  try {
    for (const [raw, exact, expected] of [[1, '1', '1'], [0, '0', '0'], [Number.MAX_SAFE_INTEGER + 1, '9223372036854775807', '9223372036854775807'], [2, undefined, '2'], [undefined, undefined, undefined], [Number.MAX_SAFE_INTEGER + 1, undefined, undefined]] as const) {
      row = { id: 'fixture-project', sales_id: 'fixture-sales', pic_revision: raw, pic_revision_exact: exact };
      for (const includeActivity of [true, false]) {
        const result = await ProjectManagementService.get(row.id, actor, { includeActivity });
        assert.equal(result.pic_revision, expected, 'Actual detail mapper carries exact CAS revision without inventing a fallback');
      }
      const list = await ProjectManagementService.list({ page: 1, limit: 10 } as any, actor);
      assert.equal(list.projects[0].pic_revision, expected, 'List and detail use the same revision contract');
    }
    await assert.rejects(() => ProjectManagementService.get(row.id, { ...actor, role: 'SALES', userId: 'outsider' }, { includeActivity: false }), /Project not found/);
  } finally { supabaseAdmin.from = original; }
  console.log('Project detail/list exact PIC revision, zero/bigint precision, missing data and access contract: PASS');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
