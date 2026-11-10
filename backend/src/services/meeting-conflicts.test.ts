import assert from 'node:assert/strict';
import {supabaseAdmin} from '../config/supabase';
import {meetingConflicts,meetingTimesOverlap} from './project-meeting.service';
const time=(hour:number)=>`2030-01-01T${String(hour).padStart(2,'0')}:00:00Z`;
const slot=(start:number,end:number|null)=>({startsAt:time(start),endsAt:end===null?null:time(end)});
assert(meetingTimesOverlap(slot(10,12),slot(11,13)));
assert(!meetingTimesOverlap(slot(10,12),slot(12,13)));
assert(meetingTimesOverlap(slot(10,null),slot(10,null)));
assert(!meetingTimesOverlap(slot(10,null),slot(11,null)));
assert(meetingTimesOverlap(slot(11,null),slot(10,12)));
assert(meetingTimesOverlap(slot(10,12),slot(11,null)));
assert(!meetingTimesOverlap(slot(12,null),slot(10,12)));
const pid='00000000-0000-4000-8000-000000000001',mid='00000000-0000-4000-8000-000000000002';
const original=supabaseAdmin.from;
let fail=false;
(supabaseAdmin as any).from=(table:string)=>{
 const filters:Record<string,unknown>={};
 const q:any={select:()=>q,eq:(key:string,value:unknown)=>{filters[key]=value;return q;},or:()=>q,order:()=>q,range:()=>q,
 single:async()=>({data:table==='projects'?{id:pid,sales_id:'sales',pic_id:'sa'}:{id:mid},error:null}),
 then:(resolve:any)=>{assert.equal(filters['project.pic_id'],'sa');assert.equal(filters.status,'APPROVED');return Promise.resolve({data:[{id:mid,starts_at:time(10),ends_at:time(12)},{id:'other',starts_at:time(11),ends_at:null}],error:fail?{}:null}).then(resolve);}};return q;
};
async function main(){try{
 const result=await meetingConflicts(pid,{userId:'sales',role:'SALES'},slot(11,13));assert.deepEqual(result,{count:2,limited:true,noPic:false});
 const own=await meetingConflicts(pid,{userId:'sales',role:'SALES'},{...slot(11,13),meetingId:mid});assert.equal(own.count,1);
 assert.deepEqual(Object.keys(result).sort(),['count','limited','noPic'],'No other project details exposed');
 await assert.rejects(meetingConflicts(pid,{userId:'other-sales',role:'SALES'},slot(11,13)),/unavailable/);
 await assert.rejects(meetingConflicts(pid,{userId:'sa',role:'SA'},slot(11,13)),/Forbidden/);
 fail=true;await assert.rejects(meetingConflicts(pid,{userId:'sales',role:'SALES'},slot(11,13)),/Unable/);
 console.log('PASS conflict boundaries, unknown ends, PIC scoping, exclusion, privacy and failed checks');
}finally{supabaseAdmin.from=original;}}
main().catch(error=>{console.error(error);process.exitCode=1;});
