import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {apiClient} from '@/lib/api-client';
import {requireRepositorySession,useRepositorySession} from './use-repository-session';
import {dashboardKeys,approvalKeys,projectKeys} from '@/lib/query-keys';

export type Meeting={id:string;projectId:string;projectName:string;picName:string|null;title:string;agenda:string;location:string;
 minutes?:{notes:string;decisions:string;followUp:string}|null;minutesUpdatedAt?:string|null;minutesAuthor?:string|null;
 proposedSchedule?:{title:string;agenda:string;location:string;startsAt:string;endsAt:string|null}|null;
 startsAt:string;endsAt:string|null;status:'PENDING'|'APPROVED'|'REJECTED'|'CANCELLED';revision:number;reviewNote:string|null;reviewedAt:string|null};
export type CalendarEvent={id:string;kind:'meeting'|'milestone-start'|'milestone-due';title:string;projectId:string;projectName:string;
 start:string;end:string|null;allDay:boolean;status:string;location?:string;description?:string;picName?:string|null;href:string};
export function useMeetings(options:{projectId?:string;status?:string;page?:number}={}){
 const scope=useRepositorySession(),query=new URLSearchParams();
 if(options.projectId)query.set('projectId',options.projectId);
 if(options.status&&options.status!=='ALL')query.set('status',options.status);
 query.set('page',String(options.page||1));
 return useQuery<{items:Meeting[];total:number;page:number;totalPages:number}>({queryKey:['calendar','meetings',scope.key,options],enabled:scope.enabled,staleTime:30000,refetchInterval:30000,refetchOnWindowFocus:true,
  queryFn:()=>{requireRepositorySession(scope);return apiClient('/calendar/meetings?'+query);}});
}
export function useCalendarEvents(from:string,to:string){
 const scope=useRepositorySession();
 return useQuery<CalendarEvent[]>({queryKey:['calendar','events',scope.key,from,to],enabled:scope.enabled,staleTime:30000,refetchOnWindowFocus:true,
  queryFn:()=>{requireRepositorySession(scope);return apiClient('/calendar/events?'+new URLSearchParams({from,to}));}});
}
export function useMeetingMutation(minutes=false){
 const scope=useRepositorySession(),cache=useQueryClient();
 return useMutation({mutationFn:({projectId,meetingId,body}:{projectId:string;meetingId?:string;body:Record<string,unknown>})=>{
  requireRepositorySession(scope);return apiClient(`/calendar/projects/${projectId}/meetings${meetingId?'/'+meetingId:''}${minutes?'/minutes':''}`,{method:'POST',body:JSON.stringify(body)});
 },onSuccess:async(_data,input)=>{await Promise.all([
  cache.invalidateQueries({queryKey:dashboardKeys.overview()}),cache.invalidateQueries({queryKey:['calendar']}),cache.invalidateQueries({queryKey:approvalKeys.overview()}),cache.invalidateQueries({queryKey:projectKeys.activities(input.projectId)}),
 ]);},onError:()=>{void cache.invalidateQueries({queryKey:['calendar']});}});
}

export function useMeetingConflicts(projectId:string,startsAt:string,endsAt:string|null,meetingId?:string){
 const scope=useRepositorySession();
 return useQuery<{count:number;limited:boolean;noPic:boolean}>({queryKey:['calendar','conflicts',scope.key,projectId,startsAt,endsAt,meetingId],enabled:scope.enabled&&!!startsAt,staleTime:0,refetchOnWindowFocus:true,refetchInterval:30000,
 queryFn:()=>{requireRepositorySession(scope);return apiClient(`/calendar/projects/${projectId}/meeting-conflicts`,{method:'POST',body:JSON.stringify({startsAt,endsAt,meetingId})});}});
}
