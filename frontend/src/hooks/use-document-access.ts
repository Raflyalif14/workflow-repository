import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { apiClient,SessionChangedError } from '@/lib/api-client';
import { isCurrentSession } from '@/lib/auth';
import { requireRepositorySession,useRepositorySession } from './use-repository-session';
export { useRepositorySession } from './use-repository-session';
import { outputDocumentKeys } from './use-output-documents';
export type AccessMode = 'RESTRICTED'|'SHARED_INTERNAL';
export type DocumentAccessMetadata = { accessMode?:AccessMode;canReadProject?:boolean;canManageAccess?:boolean;isSharedWithMe?:boolean };
export type ProjectDocumentSharing = { mode:AccessMode;revision:number;updatedAt:string|null;updatedBy:string|null };
export const canManageDocumentAccess = (user?: { id?:string;role?:string;isActive?:boolean;mustChangePassword?:boolean }|null) =>
  Boolean(user?.id && user.isActive === true && !user.mustChangePassword && ['HEAD_SA','SUPER_ADMIN'].includes(user.role ?? ''));
const sharingPath = (id:string) => `/projects/${id}/document-sharing`;
export function useProjectDocumentSharing(projectId:string) {
  const scope=useRepositorySession();
  return useQuery<ProjectDocumentSharing>({
    queryKey:['project-document-sharing',projectId,...scope.key],
    enabled:scope.enabled && canManageDocumentAccess(scope.user) && Boolean(projectId),
    queryFn:() => { requireRepositorySession(scope);if (!canManageDocumentAccess(scope.user)) throw new SessionChangedError();return apiClient(sharingPath(projectId)); },
  });
}
export function useSaveProjectDocumentSharing(projectId:string) {
  const scope=useRepositorySession();const client=useQueryClient();
  return useMutation({
    mutationKey:['project-document-sharing',projectId,...scope.key],retry:false,
    mutationFn:async (input:{ mode:AccessMode;expected_revision:number;request_id:string }) => {
      requireRepositorySession(scope);if (!canManageDocumentAccess(scope.user)) throw new SessionChangedError();
      const result=await apiClient<{ mode:AccessMode;revision:number;changed:boolean;replayed:boolean }>(sharingPath(projectId),{ method:'PUT',body:JSON.stringify(input) });
      requireRepositorySession(scope);return result;
    },
    onSuccess:async () => {
      if (!scope.session || !isCurrentSession(scope.session)) return;
      await Promise.all([['project-document-sharing',projectId],['documents'],['document'],['global-search'],outputDocumentKeys.repository()]
        .map(queryKey => client.invalidateQueries({ queryKey })));
    },
  });
}
