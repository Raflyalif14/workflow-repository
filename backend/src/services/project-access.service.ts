import { supabaseAdmin } from '../config/supabase';

export type ProjectAccessActor = {
  userId: string;
  role: string;
};

export type ProjectAccessRow = {
  sales_id: string | null;
  pic_id: string | null;
};

export function canAccessProject(row: ProjectAccessRow, actor: ProjectAccessActor): boolean {
  return actor.role === 'SUPER_ADMIN'
    || actor.role === 'HEAD_SA'
    || (actor.role === 'SALES' && row.sales_id === actor.userId)
    || (actor.role === 'SA' && row.pic_id === actor.userId);
}

export function applyProjectAccessScope<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  actor: ProjectAccessActor
): T {
  if (actor.role === 'SALES') return query.eq('sales_id', actor.userId);
  if (actor.role === 'SA') return query.eq('pic_id', actor.userId);
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'HEAD_SA') return query;
  return query.eq('id', '__no_project_access__');
}

export async function getAccessibleProjectIds(actor: ProjectAccessActor): Promise<string[] | null> {
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'HEAD_SA') return null;
  if (!['SALES', 'SA'].includes(actor.role)) return [];

  let query: any = supabaseAdmin.from('projects').select('id');
  query = applyProjectAccessScope(query, actor);
  const { data, error } = await query;
  if (error) throw new Error('Failed to resolve accessible projects.');
  return (data || []).map((project: { id: string }) => project.id);
}
