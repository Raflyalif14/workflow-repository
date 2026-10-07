import { supabaseAdmin } from '../config/supabase';

export type RepositorySource = 'OFFICIAL' | 'OUTPUT';
export type AccessActor = { userId: string; role: string };
export type RepositoryAccess = {
  source_id: string; project_id: string; access_mode: 'RESTRICTED' | 'SHARED_INTERNAL';
  revision: number; project_access: boolean; can_manage: boolean; approved: boolean; shared_access?: boolean;
};
export class DocumentAccessError extends Error {
  constructor(message: string, readonly statusCode = 400) { super(message); }
}
export const accessMetadata = (access: RepositoryAccess) => ({
  accessMode: access.access_mode, canReadProject: access.project_access === true, canManageAccess: access.can_manage === true,
  isSharedWithMe: access.shared_access === true,
});

export class DocumentAccessService {
  static async list(actor: AccessActor, source: RepositorySource, options: { includeSharing?: boolean } = {}): Promise<RepositoryAccess[]> {
    const rows: RepositoryAccess[] = [];
    for (let offset = 0; ; offset += 250) {
      const { data, error } = await supabaseAdmin.rpc('list_document_repository_access', {
        p_actor_id: actor.userId, p_source_type: source,
      }).order('source_id', { ascending: true }).range(offset, offset + 249);
      if (error) throw new DocumentAccessError('Document access is unavailable.', 503);
      rows.push(...(data || []).map((row: RepositoryAccess) => ({ ...row, project_access: row.project_access === true, can_manage: row.can_manage === true })));
      if (!data || data.length < 250) break;
    }
    if (!options.includeSharing) return rows;
    return rows.map(row => ({ ...row, shared_access: row.approved === true && row.access_mode === 'SHARED_INTERNAL' }));
  }

  static async read(actor: AccessActor, source: RepositorySource, id: string): Promise<RepositoryAccess> {
    const { data, error } = await supabaseAdmin.rpc('list_document_repository_access', {
      p_actor_id: actor.userId, p_source_type: source,
    }).eq('source_id', id).maybeSingle();
    if (error) throw new DocumentAccessError('Document access is unavailable.', 503);
    if (!data) throw new DocumentAccessError('Document not found.', 404);
    const row = data as RepositoryAccess;
    return { ...row, project_access: row.project_access === true, can_manage: row.can_manage === true };
  }

  static async save(actor: AccessActor, source: RepositorySource, id: string, input: {
    mode: 'RESTRICTED' | 'SHARED_INTERNAL'; grants: string[]; expected_revision: number; request_id: string;
  }) {
    throw new DocumentAccessError('Per-document sharing is retired. Use project sharing.', 410);
  }
  static async getProjectSharing(actor: AccessActor, projectId: string) {
    if (!['HEAD_SA','SUPER_ADMIN'].includes(actor.role)) throw new DocumentAccessError('Forbidden.',403);
    const { data, error } = await supabaseAdmin.rpc('get_project_document_sharing', { p_actor_id:actor.userId,p_project_id:projectId });
    if (error) throw new DocumentAccessError('Unable to load project document sharing.',error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 503);
    if (!data || !['RESTRICTED','SHARED_INTERNAL'].includes(data.mode) || !Number.isSafeInteger(data.revision) || data.revision < 0)
      throw new DocumentAccessError('Unable to load project document sharing.',503);
    return { mode:data.mode as 'RESTRICTED'|'SHARED_INTERNAL',revision:data.revision as number,updatedAt:data.updatedAt ?? null,updatedBy:data.updatedBy ?? null };
  }

  static async saveProjectSharing(actor: AccessActor, projectId: string, input: {
    mode:'RESTRICTED'|'SHARED_INTERNAL'; expected_revision:number; request_id:string;
  }) {
    if (!['HEAD_SA','SUPER_ADMIN'].includes(actor.role)) throw new DocumentAccessError('Forbidden.',403);
    const { data,error } = await supabaseAdmin.rpc('set_project_document_sharing', {
      p_actor_id:actor.userId,p_project_id:projectId,p_mode:input.mode,p_expected_revision:input.expected_revision,p_request_id:input.request_id,
    });
    if (error) throw new DocumentAccessError(error.code === '40001' ? 'Project sharing changed. Reload and review again.' : 'Unable to save project document sharing.',
      error.code === '40001' ? 409 : error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === '22023' ? 422 : 503);
    if (!data || !['RESTRICTED','SHARED_INTERNAL'].includes(data.mode) || !Number.isSafeInteger(data.revision)) throw new DocumentAccessError('Unable to save project document sharing.',503);
    return { mode:data.mode as 'RESTRICTED'|'SHARED_INTERNAL',revision:data.revision as number,changed:data.changed === true,replayed:data.replayed === true };
  }

}
