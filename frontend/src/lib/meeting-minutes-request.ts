import {apiClient,SessionChangedError} from './api-client';
import {getAuthSession,isCurrentSession} from './auth';
import type {Meeting} from '@/hooks/use-calendar';
export async function loadMeetingMinutes(projectId:string,meetingId:string,signal:AbortSignal){
 const session=getAuthSession();if(!session||!isCurrentSession(session))throw new SessionChangedError();
 const meeting=await apiClient<Meeting>(`/calendar/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}`,{signal});
 signal.throwIfAborted();if(!isCurrentSession(session))throw new SessionChangedError();
 if(meeting.id!==meetingId||meeting.projectId!==projectId||!meeting.minutes?.notes)throw new Error('No saved minutes');
 return {meeting,session};
}
