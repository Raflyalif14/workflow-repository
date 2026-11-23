import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { canAccessProject, getAccessibleProjectIds, ProjectAccessActor } from './project-access.service';
import { notifyProjectMeetingAction, notifyMeetingMinutesSaved } from './project-meeting-notification.service';

export class MeetingError extends Error { constructor(message:string,readonly statusCode=400){super(message);} }
const instant=z.string().datetime({offset:true});
export const meetingCreateSchema=z.object({requestId:z.string().uuid(),title:z.string().trim().min(2).max(150),
  agenda:z.string().trim().max(3000).default(''),location:z.string().trim().max(1000).default(''),startsAt:instant,endsAt:instant.nullish().default(null)}).strict()
  .refine(v=>!v.endsAt||Date.parse(v.endsAt)>Date.parse(v.startsAt),'Meeting end must follow its start.');
export const meetingReviewSchema=z.object({requestId:z.string().uuid(),revision:z.number().int().positive(),
  action:z.enum(['APPROVE','REJECT','CANCEL','APPROVE_RESCHEDULE','REJECT_RESCHEDULE']),note:z.string().trim().max(2000).default('')}).strict()
  .refine(v=>!['REJECT','REJECT_RESCHEDULE'].includes(v.action)||v.note.length>0,'A rejection reason is required.');
export const meetingRescheduleSchema=z.object({requestId:z.string().uuid(),revision:z.number().int().positive(),action:z.literal('RESCHEDULE'),title:z.string().trim().min(2).max(150),agenda:z.string().trim().max(3000).default(''),location:z.string().trim().max(1000).default(''),startsAt:instant,endsAt:instant.nullish().default(null)}).strict().refine(v=>!v.endsAt||Date.parse(v.endsAt)>Date.parse(v.startsAt),'Meeting end must follow its start.');
export const calendarRangeSchema=z.object({from:instant,to:instant}).refine(v=>{
 const days=(Date.parse(v.to)-Date.parse(v.from))/86400000;return days>0&&days<=62;
},'Calendar range must cover 1–62 days.');
const fields='*,minutes_author:users!project_meetings_minutes_updated_by_fkey(full_name),project:projects!project_meetings_project_id_fkey!inner(id,name,sales_id,pic_id,status,is_postponed,pic:users!projects_pic_id_fkey(id,full_name))';
function safeDatabase(error:any){
 if(error?.code==='42P01'||error?.code==='PGRST205'||error?.code==='PGRST202')return new MeetingError('Meeting storage is not ready.',503);
 const statuses:Record<string,number>={'42501':403,'40001':409,'55000':409,'22023':422,'23514':422,'23502':422};
 return new MeetingError(error?.code==='40001'?'Meeting changed. Refresh and review again.':'Unable to save or load meetings.',statuses[error?.code]||503);
}
export async function meetingProject(projectId:string,actor:ProjectAccessActor){
 if(!z.string().uuid().safeParse(projectId).success)throw new MeetingError('Invalid project.',422);
 const {data,error}=await supabaseAdmin.from('projects').select('id,name,sales_id,pic_id,status,is_postponed').eq('id',projectId).single();
 if(error&&error.code!=='PGRST116')throw new MeetingError('Unable to load project access.',503);
 if(!data||!canAccessProject(data,actor))throw new MeetingError('Project unavailable.',403);
 return data;
}
export function serializeMeeting(row:any){
 const project=Array.isArray(row.project)?row.project[0]:row.project;
 const pic=Array.isArray(project?.pic)?project.pic[0]:project?.pic;
 return {id:row.id,projectId:row.project_id,projectName:project?.name||'',picName:pic?.full_name||null,
   title:row.title,agenda:row.agenda,location:row.location,startsAt:row.starts_at,endsAt:row.ends_at,status:row.status,
   minutes:row.minutes||null,minutesUpdatedAt:row.minutes_updated_at||null,minutesAuthor:row.minutes_author?.full_name||null,proposedSchedule:row.proposed_schedule||null,revision:row.revision,reviewNote:row.review_note,reviewedAt:row.reviewed_at};
}
export async function listMeetings(actor:ProjectAccessActor,options:{projectId?:string;status?:string;page?:number;from?:string;to?:string}={}){
 if(!['SA','SALES','HEAD_SA','SUPER_ADMIN'].includes(actor.role))throw new MeetingError('Forbidden.',403);
 if(options.projectId)await meetingProject(options.projectId,actor);
 const scope=await getAccessibleProjectIds(actor);
 if(scope?.length===0)return {items:[],total:0,page:options.page||1,totalPages:1};
 let query:any=supabaseAdmin.from('project_meetings').select(fields,{count:'exact'});
 if(scope)query=query.in('project_id',scope);
 if(options.projectId)query=query.eq('project_id',options.projectId);
 if(actor.role==='SA')query=query.eq('status','APPROVED');
 else if(options.status==='PENDING')query=query.or('status.eq.PENDING,proposed_schedule.not.is.null');
 else if(options.status)query=query.eq('status',options.status);
 // An unspecified end is a start-only event, rather than an indefinitely running meeting.
 if(options.from)query=query.or(`ends_at.gt.${options.from},and(ends_at.is.null,starts_at.gte.${options.from})`);
 if(options.to)query=query.lt('starts_at',options.to);
 const page=options.page||1;
 const {data,error,count}=await query.order('starts_at',{ascending:true}).order('id').range((page-1)*50,page*50-1);
 if(error)throw safeDatabase(error);
 return {items:(data||[]).map(serializeMeeting),total:count||0,page,totalPages:Math.max(1,Math.ceil((count||0)/50))};
}
export async function mutateMeeting(projectId:string,actor:ProjectAccessActor,input:unknown,meetingId?:string){
 const project=await meetingProject(projectId,actor);
 const parsed=meetingId?z.union([meetingRescheduleSchema,meetingReviewSchema]).parse(input):(meetingCreateSchema.parse(input) as z.infer<typeof meetingCreateSchema>&{action?:never});
 if(meetingId&&!z.string().uuid().safeParse(meetingId).success)throw new MeetingError('Invalid meeting.',422);
 const review=parsed.action!==undefined;
 if(!review&&actor.role!=='SALES'||review&&parsed.action==='RESCHEDULE'&&actor.role!=='SALES'||review&&!['CANCEL','RESCHEDULE'].includes(parsed.action)&&actor.role!=='HEAD_SA'||review&&parsed.action==='CANCEL'&&!['SALES','HEAD_SA'].includes(actor.role))throw new MeetingError('Forbidden.',403);
 const {requestId,...payload}=parsed;
 const {data,error}=await supabaseAdmin.rpc('mutate_project_meeting',{p_project_id:projectId,p_actor_id:actor.userId,
  p_action:review?parsed.action:'CREATE',p_payload:review&&parsed.action!=='RESCHEDULE'?{note:parsed.note}:payload,p_request_id:requestId,
  p_meeting_id:meetingId||null,p_expected_revision:review?parsed.revision:null});
 if(error)throw safeDatabase(error);
 if(!data?.meeting)throw new MeetingError('Meeting could not be confirmed. Retry the same request.',503);
 if(!data.replayed){
  const action=review?parsed.action:'CREATE';
  const meetingTitle=(payload as any).title||data.meeting.title||'Meeting';
  await notifyProjectMeetingAction({
   project,
   meeting:{id:data.meeting.id,title:meetingTitle},
   action,
   actorUserId:actor.userId,
  });
 }
 return {id:data.meeting.id,status:data.meeting.status,replayed:data.replayed===true};
}

export async function calendarEvents(actor:ProjectAccessActor,input:unknown){
 const {from,to}=calendarRangeSchema.parse(input);
 if(!['SA','SALES','HEAD_SA','SUPER_ADMIN'].includes(actor.role))throw new MeetingError('Forbidden.',403);
 const scope=await getAccessibleProjectIds(actor);
 if(scope?.length===0)return [];
 const events:any[]=[];
 for(let page=1;;page++){
  const meetings=await listMeetings(actor,{from,to,status:'APPROVED',page});
  events.push(...meetings.items.filter((m:any)=>m.status==='APPROVED').map((m:any)=>({id:'meeting:'+m.id,kind:'meeting',title:m.title,
   projectId:m.projectId,projectName:m.projectName,start:m.startsAt,end:m.endsAt,allDay:false,status:m.status,
   location:m.location,description:m.agenda,picName:m.picName,href:`/projects/${m.projectId}#project-meetings`}))) ;
  if(page>=meetings.totalPages)break;
  if(events.length>5000)throw new MeetingError('Too many events. Choose a shorter date range.',422);
 }
 // Read scheduled milestones in pages; keep only the current phase and role scope.
 for(let offset=0;;offset+=250){
  let q:any=supabaseAdmin.from('project_milestones').select('id,name,project_id,phase_id,pic_id,status,start_date,due_date,project:projects!project_milestones_project_id_fkey!inner(id,name,pic_id,status,is_postponed,active_phase_id),stage:workflow_stages!project_milestones_workflow_stage_id_fkey(default_role)');
  if(scope)q=q.in('project_id',scope);
  const {data,error}=await q.eq('project.status','ACTIVE').order('id').range(offset,offset+249);
  if(error)throw new MeetingError('Unable to load calendar milestones.',503);
  const ids=(data||[]).map((row:any)=>row.id);
  const outputResult=ids.length?await supabaseAdmin.from('project_output_documents')
    .select('id,milestone_id,title,is_selected,is_required,status,start_date,due_date').in('milestone_id',ids):{data:[],error:null};
  if(outputResult.error)throw new MeetingError('Unable to load output schedules.',503);
  for(const row of data||[]){
   const p=Array.isArray(row.project)?row.project[0]:row.project,stage=Array.isArray(row.stage)?row.stage[0]:row.stage;
   if(!p||p.is_postponed||p.active_phase_id&&row.phase_id!==p.active_phase_id)continue;
   if(actor.role==='SA'&&((row.pic_id||p.pic_id)!==actor.userId||stage?.default_role!=='SA'))continue;
   if(actor.role==='SALES'&&stage?.default_role!=='SALES')continue;
   if(actor.role==='HEAD_SA'&&stage?.default_role==='SALES')continue;
   if(['COMPLETED','APPROVED'].includes(row.status))continue;
   const outputs=(outputResult.data||[]).filter((output:any)=>output.milestone_id===row.id&&(output.is_selected||output.is_required));
   const sources=outputs.length?outputs.filter((output:any)=>output.status!=='APPROVED').map((output:any)=>({
     id:row.id+':output:'+output.id,title:output.title,start_date:output.start_date||row.start_date,due_date:output.due_date||row.due_date,status:output.status,href:`/projects/${p.id}#milestone-outputs-${row.id}`
   })):[{...row,title:row.name,href:`/projects/${p.id}#project-milestone-${row.id}`}];
   for(const source of sources)for(const [kind,date] of [['milestone-start',source.start_date],['milestone-due',source.due_date]]){
    if(!date)continue;const day=date.slice(0,10);
    if(day<from.slice(0,10)||day>=to.slice(0,10))continue;
    events.push({id:`${kind}:${source.id}`,kind,title:source.title,projectId:p.id,projectName:p.name,start:day,end:day,allDay:true,
      status:source.status,href:source.href});
   }
  }
  if((data||[]).length<250)break;
  if(events.length>5000)throw new MeetingError('Too many events. Choose a shorter date range.',422);
 }
 return events.sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
}

export const meetingConflictSchema=z.object({startsAt:instant,endsAt:instant.nullish().default(null),meetingId:z.string().uuid().optional()}).strict()
 .refine(v=>!v.endsAt||Date.parse(v.endsAt)>Date.parse(v.startsAt),'Meeting end must follow its start.');
export function meetingTimesOverlap(a:{startsAt:string;endsAt:string|null},b:{startsAt:string;endsAt:string|null}){
 const as=Date.parse(a.startsAt),bs=Date.parse(b.startsAt);
 if(!a.endsAt&&!b.endsAt)return as===bs;
 if(!a.endsAt)return bs<=as&&as<Date.parse(b.endsAt!);
 if(!b.endsAt)return as<=bs&&bs<Date.parse(a.endsAt);
 return as<Date.parse(b.endsAt)&&bs<Date.parse(a.endsAt);
}
export async function meetingConflicts(projectId:string,actor:ProjectAccessActor,input:unknown){
 const schedule=meetingConflictSchema.parse(input);
 if(!['SALES','HEAD_SA','SUPER_ADMIN'].includes(actor.role))throw new MeetingError('Forbidden.',403);
 const project=await meetingProject(projectId,actor);
 if(schedule.meetingId){const {data,error}=await supabaseAdmin.from('project_meetings').select('id').eq('project_id',projectId).eq('id',schedule.meetingId).single();if(error||!data)throw new MeetingError('Meeting unavailable.',403);}
 if(!project.pic_id)return {count:0,limited:true,noPic:true};
 // Return availability counts only: Sales must not learn other owners' project/meeting details.
 let count=0,limited=!schedule.endsAt;
 for(let offset=0;;offset+=250){
  const {data,error}=await supabaseAdmin.from('project_meetings')
   .select('id,starts_at,ends_at,project:projects!project_meetings_project_id_fkey!inner(pic_id)')
   .eq('project.pic_id',project.pic_id).eq('status','APPROVED')
   .or(`ends_at.gt.${schedule.startsAt},ends_at.is.null`)
   .order('id').range(offset,offset+249);
  if(error)throw new MeetingError('Unable to check meeting availability.',503);
  for(const row of data||[]){
   if(row.id===schedule.meetingId)continue;
   if(!row.ends_at)limited=true;
   if(meetingTimesOverlap(schedule,{startsAt:row.starts_at,endsAt:row.ends_at}))count++;
  }
  if((data||[]).length<250)break;
  if(offset>=5000)throw new MeetingError('Unable to check all meeting schedules.',503);
 }
 return {count,limited,noPic:false};
}

export const meetingMinutesSchema=z.object({requestId:z.string().uuid(),revision:z.number().int().positive(),completed:z.literal(true),notes:z.string().trim().min(1).max(10000),decisions:z.string().trim().max(10000).default(''),followUp:z.string().trim().max(10000).default('')}).strict();
export async function saveMeetingMinutes(projectId:string,meetingId:string,actor:ProjectAccessActor,input:unknown){
 const project=await meetingProject(projectId,actor);
 if(!['SALES','SA','HEAD_SA'].includes(actor.role))throw new MeetingError('Forbidden.',403);
 if(!z.string().uuid().safeParse(meetingId).success)throw new MeetingError('Invalid meeting.',422);
 const {requestId,revision,...payload}=meetingMinutesSchema.parse(input);
 const {data,error}=await supabaseAdmin.rpc('save_project_meeting_minutes',{p_project_id:projectId,p_meeting_id:meetingId,p_actor_id:actor.userId,p_payload:payload,p_request_id:requestId,p_expected_revision:revision});
 if(error)throw safeDatabase(error);
 if(!data?.meeting)throw new MeetingError('Minutes could not be confirmed. Retry the same request.',503);
 if(!data.replayed){
  await notifyMeetingMinutesSaved({
   project,
   meeting:{id:data.meeting.id,title:data.meeting.title||'Meeting'},
   actorUserId:actor.userId,
  });
 }
 return {id:data.meeting.id,replayed:data.replayed===true};
}

export async function getMeeting(projectId:string,meetingId:string,actor:ProjectAccessActor){
 await meetingProject(projectId,actor);
 if(!z.string().uuid().safeParse(meetingId).success)throw new MeetingError('Invalid meeting.',422);
 let query=supabaseAdmin.from('project_meetings').select(fields).eq('project_id',projectId).eq('id',meetingId);
 if(actor.role==='SA')query=query.eq('status','APPROVED');
 const {data,error}=await query.single();
 if(error&&error.code!=='PGRST116')throw safeDatabase(error);
 if(!data)throw new MeetingError('Meeting unavailable.',404);
 return serializeMeeting(data);
}
