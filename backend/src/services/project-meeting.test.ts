import assert from 'node:assert/strict';
import {supabaseAdmin} from '../config/supabase';
import {getMeeting,saveMeetingMinutes,meetingMinutesSchema,calendarEvents,listMeetings,meetingCreateSchema,meetingReviewSchema,mutateMeeting} from './project-meeting.service';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sales={userId:id(1),role:'SALES'},sa={userId:id(2),role:'SA'},head={userId:id(3),role:'HEAD_SA'};
const p={id:id(4),name:'Own project',sales_id:sales.userId,pic_id:sa.userId,status:'ACTIVE',is_postponed:null,active_phase_id:id(5)};
const foreign={...p,id:id(6),pic_id:id(7),sales_id:id(8),name:'Other project'};
const m={id:id(10),project_id:p.id,project:p,title:'Own meeting',agenda:'Agenda',location:'Room',status:'APPROVED',starts_at:'2030-11-10T03:00:00Z',ends_at:'2030-11-10T04:00:00Z',revision:1};
const milestone={id:id(20),name:'SA work',project_id:p.id,phase_id:p.active_phase_id,pic_id:sa.userId,project:p,stage:{default_role:'SA'},status:'IN_PROGRESS',start_date:'2030-11-09',due_date:'2030-11-11'};
const tables:Record<string,any[]>={projects:[p,foreign],project_meetings:[m,{...m,id:id(11),status:'PENDING'},{...m,id:id(12),project_id:foreign.id,project:foreign}],project_milestones:[milestone,{...milestone,id:id(21),stage:{default_role:'SALES'}},{...milestone,id:id(22),status:'COMPLETED'},{...milestone,id:id(23),phase_id:id(99)}],project_output_documents:[]};
const original={from:supabaseAdmin.from,rpc:supabaseAdmin.rpc};let captured:any;
const value=(row:any,key:string)=>key.split('.').reduce((result:any,part)=>result?.[part],row);
async function main(){try{
 (supabaseAdmin as any).from=(table:string)=>{
  const filters:Array<(row:any)=>boolean>=[];let start=0,end=Infinity;
  const result=(single=false)=>{const all=tables[table].filter(row=>filters.every(filter=>filter(row)));return {data:single?all[0]||null:all.slice(start,end+1),count:all.length,error:null};};
  const q:any={select:()=>q,eq:(key:string,v:any)=>{filters.push(row=>value(row,key)===v);return q;},in:(key:string,values:any[])=>{filters.push(row=>values.includes(value(row,key)));return q;},
    gt:(key:string,v:string)=>{filters.push(row=>Date.parse(value(row,key))>Date.parse(v));return q;},lt:(key:string,v:string)=>{filters.push(row=>Date.parse(value(row,key))<Date.parse(v));return q;},
    or:(expression:string)=>{if(expression==='status.eq.PENDING,proposed_schedule.not.is.null'){filters.push(row=>row.status==='PENDING'||row.proposed_schedule!=null);return q;}const match=/^ends_at\.gt\.(.+),and\(ends_at\.is\.null,starts_at\.gte\.(.+)\)$/.exec(expression);assert(match);assert.equal(match[1],match[2]);filters.push(row=>row.ends_at===null?Date.parse(row.starts_at)>=Date.parse(match[1]):Date.parse(row.ends_at)>Date.parse(match[1]));return q;},
    order:()=>q,range:(a:number,b:number)=>{start=a;end=b;return q;},single:async()=>result(true),then:(resolve:any)=>Promise.resolve(result()).then(resolve)};return q;
 };
 (supabaseAdmin as any).rpc=async(name:string,args:any)=>{assert(['mutate_project_meeting','save_project_meeting_minutes'].includes(name));captured=args;return {data:{meeting:{id:id(100),status:'PENDING'},replayed:false},error:null};};
 assert.equal((await listMeetings(sa)).items.length,1,'SA only sees approved meetings in own project');
 assert.equal((await listMeetings(sales)).items.length,2,'Sales cannot read another Sales project');
 assert.equal((await listMeetings(head,{status:'PENDING'})).items.length,1);
 await assert.rejects(listMeetings(sa,{projectId:foreign.id}),/unavailable/);
 const range={from:'2030-11-01T00:00:00+07:00',to:'2030-12-01T00:00:00+07:00'};
 const events=await calendarEvents(sa,range);
 assert.equal(events.length,3);assert(events.every(event=>event.projectId===p.id));
 assert.deepEqual(events.filter(e=>e.allDay).map(e=>e.start),['2030-11-09','2030-11-11']);
 tables.project_output_documents=[{milestone_id:milestone.id,title:'Technical proposal',is_selected:true,status:'DRAFT',start_date:'2030-11-10',due_date:'2030-11-12'}];
 const outputs=await calendarEvents(sa,range);assert(outputs.some(e=>e.title==='Technical proposal'&&e.start==='2030-11-12'));assert(!outputs.some(e=>e.title==='SA work'));
 const input={requestId:id(40),title:'Review meeting',agenda:'Discuss',location:'Room',startsAt:m.starts_at,endsAt:m.ends_at};
 await mutateMeeting(p.id,sales,input);assert.equal(captured.p_actor_id,sales.userId);assert.equal(captured.p_payload.pic_id,undefined,'PIC is resolved by database, never supplied by client');
 await assert.rejects(mutateMeeting(p.id,sa,input),/Forbidden/);
 await assert.rejects(mutateMeeting(p.id,sales,{requestId:id(41),action:'APPROVE',revision:1,note:''},m.id),/Forbidden/);
 await mutateMeeting(p.id,head,{requestId:id(41),action:'APPROVE',revision:1,note:''},m.id);assert.equal(captured.p_expected_revision,1);
 await mutateMeeting(p.id,sales,{...input,action:'RESCHEDULE',revision:2},m.id);assert.equal(captured.p_action,'RESCHEDULE');assert.equal(captured.p_payload.startsAt,input.startsAt);
 await assert.rejects(mutateMeeting(p.id,sa,{...input,action:'RESCHEDULE',revision:2},m.id),/Forbidden/);
 await mutateMeeting(p.id,head,{requestId:id(42),action:'APPROVE_RESCHEDULE',revision:3},m.id);assert.equal(captured.p_action,'APPROVE_RESCHEDULE');
 assert(!meetingCreateSchema.safeParse({...input,endsAt:input.startsAt}).success);
 assert(meetingCreateSchema.safeParse({...input,endsAt:null}).success);
 const {endsAt:unusedEnd,...startOnly}=input; void unusedEnd;
 assert.equal(meetingCreateSchema.parse(startOnly).endsAt,null);
 assert(!meetingCreateSchema.safeParse({...input,endsAt:'invalid'}).success);
 assert(!meetingCreateSchema.safeParse({...input,startsAt:undefined}).success);
 await mutateMeeting(p.id,sales,startOnly);assert.equal(captured.p_payload.endsAt,null);
 tables.project_meetings.push({...m,id:id(50),ends_at:null},{...m,id:id(51),starts_at:'2030-10-01T00:00:00Z',ends_at:null},{...m,id:id(52),starts_at:range.to,ends_at:null});
 const startOnlyEvents=await calendarEvents(sa,range);
 assert(startOnlyEvents.some(e=>e.id==='meeting:'+id(50)&&e.end===null));
 assert(!startOnlyEvents.some(e=>['meeting:'+id(51),'meeting:'+id(52)].includes(e.id)),'No-end meetings appear only in their starting range');
 assert(!meetingReviewSchema.safeParse({requestId:id(41),action:'REJECT',revision:1,note:''}).success);
 await assert.rejects(calendarEvents(sa,{from:range.from,to:'2031-02-01T00:00:00Z'}));
 const detail=await getMeeting(p.id,m.id,sa);assert.equal(detail.id,m.id);
 await assert.rejects(getMeeting(foreign.id,m.id,sales),/unavailable/);
 await assert.rejects(getMeeting(p.id,id(11),sa),/unavailable/);
 const mom={requestId:id(70),revision:1,completed:true,notes:'Notes',decisions:'Decision',followUp:'Next step'};
 await saveMeetingMinutes(p.id,m.id,sa,mom);assert.equal(captured.p_actor_id,sa.userId);assert.equal(captured.p_payload.notes,'Notes');
 await assert.rejects(saveMeetingMinutes(foreign.id,m.id,sales,mom),/unavailable/);
 await assert.rejects(saveMeetingMinutes(p.id,m.id,{userId:id(90),role:'SUPER_ADMIN'},mom),/Forbidden/);
 assert(!meetingMinutesSchema.safeParse({...mom,notes:' '}).success);assert(!meetingMinutesSchema.safeParse({...mom,completed:false}).success);
 console.log('PASS Sales/SA scope, Head review, approved-only feed, phase/role/completion filtering, output dates, date validation and trusted actor/PIC');
}finally{supabaseAdmin.from=original.from;supabaseAdmin.rpc=original.rpc;}}
main().catch(error=>{console.error(error);process.exitCode=1;});
