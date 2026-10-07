// In-memory RPC transport for isolated service tests. Does not execute PostgreSQL.
import { strict as assert } from 'assert';
import { supabaseAdmin } from '../config/supabase';
import { canAccessProject } from '../services/project-access.service';

export function accessQuery(getRows: () => Promise<any[]> | any[]) {
  const filters: Array<(row: any) => boolean> = [];
  let bounds: [number, number] | undefined;
  const result = async (single = false) => {
    let data = (await getRows()).filter(row => filters.every(filter => filter(row)));
    data.sort((a, b) => a.source_id.localeCompare(b.source_id));
    if (bounds) data = data.slice(bounds[0], bounds[1] + 1);
    return { data: single ? data[0] ?? null : data, error: null };
  };
  const query: any = {
    eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return query; },
    order: () => query,
    range: (start: number, end: number) => { bounds = [start, end]; return query; },
    maybeSingle: () => result(true),
    then: (resolve: any, reject: any) => result().then(resolve, reject),
  };
  return query;
}

export function installRestrictedRepositoryFixture(
  roles: Record<string, string>,
  getTables?: () => { projects: any[]; documents?: any[]; outputs?: any[] },
) {
  const original = supabaseAdmin.rpc;
  (supabaseAdmin as any).rpc = (name: string, input: any) => {
    assert.equal(name, 'list_document_repository_access', 'Read fixtures must not execute mutation RPCs');
    return accessQuery(async () => {
      const actor = { userId: input.p_actor_id, role: roles[input.p_actor_id] };
      if (!actor.role) return [];
      const tables = getTables?.();
      const projects = tables?.projects ?? (await supabaseAdmin.from('projects').select('id,sales_id,pic_id')).data ?? [];
      const official = input.p_source_type === 'OFFICIAL';
      const sources = (official ? tables?.documents : tables?.outputs)
        ?? (await supabaseAdmin.from(official ? 'documents' : 'project_output_documents').select('id,project_id,status')).data ?? [];
      return sources.filter((row: any) => {
        const project = projects.find((p: any) => p.id === row.project_id);
        return project && canAccessProject(project, actor) &&
          (row.status === 'APPROVED' || (official ? actor.role !== 'SALES' : ['SA','HEAD_SA'].includes(actor.role)));
      }).map((row: any) => ({ source_id: row.id, project_id: row.project_id, access_mode: 'RESTRICTED', revision: 0,
        project_access: true, can_manage: ['HEAD_SA','SUPER_ADMIN'].includes(actor.role) && row.status === 'APPROVED', approved: row.status === 'APPROVED' }));
    });
  };
  return () => { supabaseAdmin.rpc = original; };
}
