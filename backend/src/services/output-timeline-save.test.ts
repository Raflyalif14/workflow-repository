import assert from 'node:assert/strict';
import { ProjectPlanApprovalService } from './project-plan-approval.service';
import { HolidayService } from './holiday.service';
import { supabaseAdmin } from '../config/supabase';

async function main() {
  const service = ProjectPlanApprovalService as any;
  const originals = { project:service.getProject, workflow:service.getWorkflowMode, timeline:service.getTimelineMilestones,
    from:supabaseAdmin.from, rpc:supabaseAdmin.rpc, holidays:HolidayService.getActiveHolidaysBetween };
  const id='11111111-1111-4111-8111-111111111111', a='22222222-2222-4222-8222-222222222222', b='33333333-3333-4333-8333-333333333333';
  let captured:any, fail=false;
  try {
    service.getProject=async()=>({ id:'project',sales_id:'sales',active_phase_id:'active' });
    service.getWorkflowMode=async()=> 'OPERATIONAL_V2';
    service.getTimelineMilestones=async()=>[{id,step_order:1}];
    HolidayService.getActiveHolidaysBetween=async()=>[];
    (supabaseAdmin as any).from=(table:string)=>{
      assert.equal(table,'project_output_documents');
      return {select:()=>({eq:async()=>({data:[a,b].map(id2=>({id:id2,phase_id:'active',milestone_id:id,is_selected:true})),error:null})})};
    };
    (supabaseAdmin as any).rpc=async(name:string,args:any)=>{
      assert.equal(name,'mutate_project_output_timeline'); captured=args;
      return fail ? {data:null,error:{code:'40001'}} : {data:{value:args.p_payload.milestones,replayed:false},error:null};
    };
    const request={milestones:[{milestoneId:id,outputDocumentId:a,startDate:'2026-11-02',durationWorkingDays:2},
      {milestoneId:id,outputDocumentId:b,startDate:'2026-11-10',durationWorkingDays:3}]};
    const actor={userId:'sales',role:'SALES',fullName:'Sales'};
    const context={requestId:'44444444-4444-4444-8444-444444444444',expectedUpdatedAt:'2026-11-02T00:00:00Z'};
    await ProjectPlanApprovalService.saveTimeline('project',request,actor,context);
    assert.deepEqual(captured.p_payload.outputs.map((row:any)=>[row.id,row.start_date,row.due_date]),[
      [a,'2026-11-02','2026-11-04'],[b,'2026-11-10','2026-11-13'],
    ]);
    assert.equal(captured.p_payload.milestones[0].due_date,'2026-11-13');
    assert.equal(captured.p_request_id,context.requestId);
    fail=true;
    await assert.rejects(ProjectPlanApprovalService.saveTimeline('project',request,actor,context),/Business data changed/);
    await assert.rejects(ProjectPlanApprovalService.saveTimeline('project',request,{...actor,userId:'other'},context),/Only the project owner/);
    console.log('PASS API-to-RPC independent schedules, receipt context, conflict and owner checks');
  } finally {
    service.getProject=originals.project;service.getWorkflowMode=originals.workflow;service.getTimelineMilestones=originals.timeline;
    supabaseAdmin.from=originals.from;supabaseAdmin.rpc=originals.rpc;HolidayService.getActiveHolidaysBetween=originals.holidays;
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
