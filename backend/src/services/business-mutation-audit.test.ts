import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../config/supabase';
import { businessRequestContext, BusinessAuditError, mutateBusiness } from './business-audit.service';
import { safeBusinessAudit } from './business-audit-projection';
import { ProjectManagementService } from './project-management.service';
import { ProjectPlanApprovalService } from './project-plan-approval.service';
import { DeadlineService } from './deadline.service';

const sql=fs.readFileSync(path.join(__dirname,'../../supabase/phase30-business-mutation-audit.sql'),'utf8');
const mutation=sql.slice(sql.indexOf('create function public.mutate_project_business'),sql.indexOf('revoke all on function public.mutate_project_business'));
assert(mutation.indexOf('for update')<mutation.indexOf('project_business_requests where'));
assert(mutation.indexOf('return jsonb_build_object')<mutation.indexOf("v_p.updated_at is distinct"),'Receipt replay precedes current status/CAS');
assert(mutation.indexOf('record_business_change')<mutation.indexOf('insert into public.project_business_requests'));
assert(!/exception\s+when/i.test(sql),'Audit failure is not swallowed; RPC transaction aborts');
const draft=sql.slice(sql.indexOf('create function public.mutate_project_output_document_draft'),sql.indexOf('revoke all on function public.mutate_project_output_document_draft'));
assert(draft.includes('if v_result.applied then')); assert(!draft.includes('insert into public.project_output_document_versions'));
assert(draft.includes('business_draft_state'));assert(sql.includes('if v_result.created then'));
assert(sql.includes('from public,anon,authenticated,service_role'),'Core writers are retired');
for(const pair of ['v_m.start_date','v_p.id','v_a.status']) assert(sql.includes(pair));
assert(mutation.includes("p_action='LEGACY_PLAN_REVIEW'"));
assert(mutation.includes("v_m.status<>'IN_PROGRESS'"));
assert(mutation.includes("'schedule' is distinct from"));
assert(sql.includes('create trigger project_creation_business_audit after insert on public.projects'));
assert(!sql.includes('delete from public.activity_logs'),'No historical backfill/deletion');
assert(sql.includes('if p_before is not distinct from p_after then return;'),'No-op has no audit');
assert(sql.includes("dependency_counts=dependency_counts||jsonb_build_object('project_business_requests',v_count)"));
for (const name of ['complete_phase_sa_milestone','complete_sa_output_milestone','complete_phase_final_sales_milestone_with_outcome','complete_final_sales_milestone_with_outcome']) {
  const body=sql.slice(sql.indexOf('create function public.'+name+'('),sql.indexOf('revoke all on function public.'+name+'(',sql.indexOf('create function public.'+name+'(')));
  assert(body.includes('v_result.changed'),name+' audit is replay-gated');
  assert(body.includes('record_business_change'),name+' owns atomic audit');
}
assert(sql.includes("if v_m.status='COMPLETED' then return"));


const projected=safeBusinessAudit({object_type:'OUTPUT_DOCUMENT',object_id:'output',changed_fields:['files','token'],
  before:{files:[{id:'old',name:'old.pdf',size:1,storage_path:'PRIVATE'}],token:'PRIVATE'},
  after:{files:[{id:'new',name:'new.pdf',size:2,signed_url:'PRIVATE'}],raw_body:'PRIVATE'}})!;
assert.deepEqual(projected.changedFields,['files']); assert(!JSON.stringify(projected).includes('PRIVATE'));
assert.equal(safeBusinessAudit({object_type:'USER',object_id:'u'}),undefined);
assert.throws(()=>businessRequestContext({'x-business-request-id':'not-a-uuid'}));
const context={requestId:'11111111-1111-4111-8111-111111111111',expectedUpdatedAt:'2026-10-07T00:00:00.000Z'};
assert.deepEqual(businessRequestContext({'x-business-request-id':context.requestId,'x-business-expected-updated-at':context.expectedUpdatedAt}),context);
async function run(){
  const originalRpc=supabaseAdmin.rpc, originalFrom=supabaseAdmin.from;
  const originalGet=ProjectManagementService.get;
  const calls:any[]=[];let code:string|undefined;
  (supabaseAdmin as any).from=()=>{throw new Error('Unexpected direct database write/read');};
  (supabaseAdmin as any).rpc=async(name:string,args:any)=>{calls.push({name,args});return code?{data:null,error:{code,message:'PRIVATE DATABASE DETAIL'}}:{data:{value:{project_id:'p'},replayed:false},error:null};};
  (ProjectManagementService as any).get=async()=>({id:'p',sales_id:'owner',status:'ACTIVE',is_postponed:false});
  try{
    await ProjectManagementService.postpone('p','Need approval',{userId:'owner',role:'SALES',fullName:'Sales'},context);
    assert.equal(calls[0].name,'mutate_project_business');assert.equal(calls[0].args.p_actor_id,'owner');
    assert.deepEqual(calls[0].args.p_payload,{reason:'Need approval'});
    assert(!('before' in calls[0].args.p_payload),'Before is read by PostgreSQL, not supplied by client');
    await assert.rejects(()=>ProjectManagementService.postpone('p','x',{userId:'other',role:'SALES',fullName:'Sales'},context),/Forbidden/);
    for(const failure of ['40001','42501','22023','XX000']){
      code=failure;await assert.rejects(()=>mutateBusiness('p','owner','INFO',{name:'New'},context),(error:any)=>
        error instanceof BusinessAuditError && !error.message.includes('PRIVATE') && error.statusCode===({'40001':409,'42501':403,'22023':422,'XX000':503} as any)[failure]);
    }
    code=undefined;
    (supabaseAdmin as any).rpc=async()=>({data:{value:{id:'receipt'},replayed:true},error:null});
    const replay=await mutateBusiness('p','owner','POSTPONE',{reason:'x'},context);
    assert.equal(replay._businessReplayed,true);assert(!JSON.stringify(replay).includes('_businessReplayed'));
    // Timeline calculates deadlines before a single transactional write, never per-row UPDATE/rollback.
    const plan:any=ProjectPlanApprovalService, oldProject=plan.getProject,oldMode=plan.getWorkflowMode,oldTimeline=plan.getTimelineMilestones,oldCalculate=DeadlineService.calculateDeadline;
    plan.getProject=async()=>({id:'p',sales_id:'owner',active_phase_id:'phase',status:'DRAFT'});
    plan.getWorkflowMode=async()=> 'OPERATIONAL_V2';plan.getTimelineMilestones=async()=>[{id:'m',name:'Stage',step_order:1}];
    (DeadlineService as any).calculateDeadline=async()=>({start_date:'2026-10-07',duration_working_days:2,due_date:'2026-10-08'});
    (supabaseAdmin as any).rpc=async(name:string,args:any)=>{calls.push({name,args});return {data:{value:args.p_payload.milestones,replayed:false},error:null};};
    try{const result=await plan.saveTimeline('p',{milestones:[{milestoneId:'m',startDate:'2026-10-07',durationWorkingDays:2}]},{userId:'owner',role:'SALES',fullName:'Sales'},context);
      assert.equal(result[0].due_date,'2026-10-08');assert.equal(calls.at(-1).args.p_action,'TIMELINE');
    }finally{plan.getProject=oldProject;plan.getWorkflowMode=oldMode;plan.getTimelineMilestones=oldTimeline;DeadlineService.calculateDeadline=oldCalculate;}
  }finally{supabaseAdmin.rpc=originalRpc;supabaseAdmin.from=originalFrom;ProjectManagementService.get=originalGet;}
  console.log('Business audit: safe projection, server actor, one RPC, conflict/error/replay and static transaction boundaries passed. PostgreSQL was not executed.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
