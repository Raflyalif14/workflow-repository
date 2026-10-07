import { supabaseAdmin } from '../config/supabase';

// Approval Center aggregates its complete authorized scope before global filtering/paging.
// Bound each request and IN filter; never issue a query per output.
export async function readApprovalRows(
  table: string, projection: string,
  filter?: { column: string; ids: string[] },
  order?: string,
  equals?: { column: string; value: string },
  identityColumns: readonly string[] = ['id']
): Promise<{ data: any[]; error: null }> {
  const data: any[] = [];
  const ids = filter ? [...new Set(filter.ids)] : null;
  const batches = ids ? Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) => ids.slice(i * 200, (i + 1) * 200)) : [null];
  try {
    for (const batch of batches) {
      for (let offset = 0; ; offset += 250) {
        let query = supabaseAdmin.from(table).select(projection);
        if (filter && batch) query = query.in(filter.column, batch);
        if (equals) query = query.eq(equals.column, equals.value);
        if (order && !identityColumns.includes(order)) query = query.order(order, { ascending: false });
        for (const column of identityColumns) query = query.order(column, { ascending: true });
        const result = await query.range(offset, offset + 249);
        if (result.error || !Array.isArray(result.data)) {
          throw new Error('Failed to load approval overview.');
        }
        data.push(...result.data);
        if (result.data.length < 250) break;
      }
    }
  } catch {
    console.error('[ApprovalOverviewService] source failed:', table);
    throw new Error('Failed to load approval overview.');
  }
  return { data, error: null };
}
