import assert from 'node:assert/strict';
import {dashboardMeetingTasks} from './dashboard-meeting-tasks';
const now=Date.parse('2030-01-01T00:00:00Z');
const projects=[{id:'p',name:'Project',sales_id:'sales',pic_id:'sa'},{id:'other',name:'Other',sales_id:'someone',pic_id:'other-sa'}];
const meeting={id:'m',project_id:'p',title:'Meeting',status:'APPROVED',starts_at:'2030-01-02T10:00:00Z',ends_at:null};
const rows=[meeting,{...meeting,id:'request',status:'PENDING'},{...meeting,id:'reschedule',proposed_schedule:{startsAt:'2030-01-03T10:00:00Z'}},{...meeting,id:'rejected',status:'REJECTED'},{...meeting,id:'cancelled',status:'CANCELLED'},{...meeting,id:'past',starts_at:'2029-12-31T00:00:00Z'},{...meeting,id:'foreign',project_id:'other'}];
const head=dashboardMeetingTasks(rows,projects,{userId:'head',role:'HEAD_SA'},now);
assert.deepEqual(head.map(t=>t.id),['meeting:request','meeting:reschedule']);assert(head.every(t=>t.placement==='TASK_LIST'));
for(const actor of [{userId:'sales',role:'SALES'},{userId:'sa',role:'SA'}]){
 const tasks=dashboardMeetingTasks(rows,projects,actor,now);assert.deepEqual(tasks.map(t=>t.id),['meeting:m','meeting:reschedule']);assert(tasks.every(t=>t.placement==='PRIORITY'));assert.equal(tasks[1].dueDate,meeting.starts_at,'Pending proposal does not replace approved time');
}
assert.deepEqual(dashboardMeetingTasks(rows,projects,{userId:'other',role:'SA'},now),[]);
assert.deepEqual(dashboardMeetingTasks(rows,projects,{userId:'admin',role:'SUPER_ADMIN'},now),[]);
console.log('PASS meeting dashboard role scope, pending reschedule, approved times, terminal statuses and panel placement');
