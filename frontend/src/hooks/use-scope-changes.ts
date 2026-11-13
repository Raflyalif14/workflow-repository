import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {apiClient} from '@/lib/api-client';
import {requireRepositorySession,useRepositorySession} from './use-repository-session';
import {projectKeys,approvalKeys,dashboardKeys,assignmentKeys} from '@/lib/query-keys';
import {outputDocumentKeys} from './use-output-documents';

export type ScopeChange={id:string;project_id:string;phase_id:string;reason:string;requested_at:string;
 before_keys:string[];proposal:{selected_keys:string[];additions:Array<{key:string;start_date:string;duration_working_days:number;due_date:string}>};
 status:'PENDING'|'APPROVED'|'REJECTED'|'CANCELLED';review_note:string|null};
export function useScopeChanges(projectId:string){
 const scope=useRepositorySession();
 return useQuery<ScopeChange[]>({queryKey:['scope-changes',scope.key,projectId],enabled:scope.enabled,
 staleTime:15000,refetchOnWindowFocus:true,queryFn:({signal})=>{requireRepositorySession(scope);
 return apiClient(`/projects/${projectId}/scope-changes`,{signal});}});
}
export function useScopeChangeMutation(projectId:string){
 const scope=useRepositorySession(),cache=useQueryClient();
 return useMutation({mutationFn:({changeId,body}:{changeId?:string;body:Record<string,unknown>})=>{
  requireRepositorySession(scope);return apiClient<ScopeChange>(`/projects/${projectId}/scope-changes${changeId?'/'+changeId:''}`,{method:'POST',body:JSON.stringify(body)});
 },onSettled:async()=>{await Promise.all([
  cache.invalidateQueries({queryKey:['scope-changes']}),cache.invalidateQueries({queryKey:projectKeys.all()}),
  cache.invalidateQueries({queryKey:outputDocumentKeys.project(projectId)}),cache.invalidateQueries({queryKey:approvalKeys.all()}),
  cache.invalidateQueries({queryKey:dashboardKeys.overview()}),cache.invalidateQueries({queryKey:assignmentKeys.myAssignedMilestones()}),
  cache.invalidateQueries({queryKey:['calendar']}),cache.invalidateQueries({queryKey:['notifications']}),
 ]);}});
}
