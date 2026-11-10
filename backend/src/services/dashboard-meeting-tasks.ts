export type DashboardMeetingRow={id:string;project_id:string;title:string;status:string;starts_at:string;ends_at:string|null;proposed_schedule?:{startsAt:string}|null};
export function dashboardMeetingTasks(meetings:DashboardMeetingRow[],projects:Array<{id:string;name:string;sales_id:string|null;pic_id:string|null}>,actor:{userId:string;role:string},now=Date.now()){
 const map=new Map(projects.map(p=>[p.id,p]));
 return meetings.flatMap(m=>{
  const p=map.get(m.project_id);if(!p)return [];
  const review=actor.role==='HEAD_SA'&&(m.status==='PENDING'||m.status==='APPROVED'&&!!m.proposed_schedule);
  const participant=(actor.role==='SALES'&&p.sales_id===actor.userId)||(actor.role==='SA'&&p.pic_id===actor.userId);
  const upcoming=participant&&m.status==='APPROVED'&&Date.parse(m.starts_at)>=now;
  if(!review&&!upcoming)return [];
  return [{id:'meeting:'+m.id,projectId:p.id,projectName:p.name,name:m.title,status:review?'PENDING':'APPROVED',
   dueDate:review?(m.proposed_schedule?.startsAt||m.starts_at):m.starts_at,startDate:m.starts_at,
   kind:review?'MEETING_REVIEW':'MEETING',placement:review?'TASK_LIST':'PRIORITY',
   href:review?'/approvals':`/projects/${p.id}#project-meetings`}];
 });
}
