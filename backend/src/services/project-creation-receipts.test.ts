import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase';
import { ProjectCreationService, ProjectCreationRequestError, projectCreationPayload, prepareProjectCreationPlan } from './project-creation.service';
import { ProjectManagementService } from './project-management.service';
import { ProjectIntakeService } from './project-intake.service';
import { MilestoneService } from './milestone.service';
import { ProjectManagementController } from '../controllers/project-management.controller';
import { DocumentStorageService } from '../utils/storage.util';
import { getScenarioDocuments } from '../constants/scenarios';

const owner={userId:randomUUID(),role:'SALES',fullName:'Fixture actor'};
const input={name:'Fixture project',customer:'Fixture customer',scenario_id:randomUUID(),estimated_revenue:100,selectedDocumentKeys:['proposal_deck_solusi','assessment']};
const file=(name:string,mime:string,content='same bytes')=>({originalname:name,mimetype:mime,buffer:Buffer.from(content),size:Buffer.byteLength(content)} as Express.Multer.File);
const files=()=>({mom:[file('mom.pdf','application/pdf')],photos:[file('photo.jpg','image/jpeg')],documents:[file('same.pdf','application/pdf')]});
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/phase31-project-creation-receipts.sql'),'utf8');
const body=sql.slice(sql.indexOf('create function public.project_creation_operation'));
// PL/pgSQL reads an IF expression up to the first unparenthesized THEN.
// An unwrapped SQL CASE causes its inner THEN to truncate the condition.
function assertCompleteIfExpression(condition: string) {
  const tokens=condition.match(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|[a-z_]+|[()[\]]|[^\s]/gi)||[];
  let nesting=0,cases=0;
  for(const token of tokens){
    if(token.startsWith("'") || token.startsWith('--') || token.startsWith('/*'))continue;
    const word=token.toLowerCase();
    if(word==='(' || word==='[')nesting++;
    else if(word===')' || word===']'){nesting--;assert(nesting>=0,'IF parentheses must balance');}
    else if(word==='case')cases++;
    else if(word==='end')cases--;
    else if(word==='then' && nesting===0){assert.equal(cases,0,'SQL CASE must finish before the IF THEN delimiter');return;}
  }
  assert.fail('IF THEN delimiter missing');
}
assert.throws(()=>assertCompleteIfExpression("if x is distinct from case when y then 'CREATED' else 'COMPLETED' end then"));
assertCompleteIfExpression("if x is distinct from (case when y then 'CREATED' else 'COMPLETED' end) then");
const milestoneCondition=body.slice(body.indexOf("if not found or (v_item->>'step_order')"),body.indexOf("raise exception 'Creation milestone mapping invalid'"));
assert(milestoneCondition.startsWith('if not found'),'Expected milestone IF must exist');
assertCompleteIfExpression(milestoneCondition);
assert(sql.includes('request_id uuid primary key'));assert(sql.includes('project_id uuid not null unique default'));
assert(!sql.includes('on delete cascade'),'Creation tombstone survives project deletion');
assert(body.indexOf("v_r.status='COMMITTED'")<body.indexOf("p_operation='CLAIM' then"),'Committed replay never reserves again');
assert(body.indexOf("using errcode='42501'")<body.indexOf('insert into public.project_creation_requests'));
assert(body.includes('payload is distinct from p_payload'));assert(body.includes('lease_token is distinct from p_lease'));
assert(body.includes("state<>'PENDING'"));assert(body.includes('for update'));assert(body.includes('for share'));
assert(body.indexOf('insert into public.projects')<body.indexOf("set status='COMMITTED'"));
for(const table of ['project_milestones','project_output_documents','project_intake_attachments'])
  assert(body.indexOf('insert into public.'+table)<body.indexOf("set status='COMMITTED'"));
assert(!/exception\s+when/i.test(body),'No partial commit when a trigger/audit/constraint fails');
assert(body.includes("raise exception 'Created project was deleted'"));
assert(sql.includes('from public,anon,authenticated,service_role'));assert(sql.includes('to service_role;'));
const serviceSource=fs.readFileSync(path.join(__dirname,'project-creation.service.ts'),'utf8');
assert(!serviceSource.includes('.remove(') && !serviceSource.includes('.removeMany('));
assert(serviceSource.includes("attachment.state === 'PENDING'"));assert(serviceSource.includes("else await verifyStoredFile"));
assert(fs.readFileSync(path.join(__dirname,'../utils/storage.util.ts'),'utf8').includes('upsert: false'));
const route=fs.readFileSync(path.join(__dirname,'../routes/project.routes.ts'),'utf8').replace(/\r\n/g,'\n');
assert(route.includes("requireRoles(['SALES']),\n  requireProjectCreationId,\n  uploadProjectCreationFiles"));

async function fixture(run:(state:any)=>Promise<void>){
  const original={rpc:supabaseAdmin.rpc,from:supabaseAdmin.from,storage:supabaseAdmin.storage.from,upload:DocumentStorageService.upload,remove:DocumentStorageService.removeMany,
    get:ProjectManagementService.get,list:MilestoneService.list,intake:ProjectIntakeService.list};
  const state:any={receipts:new Map(),objects:new Map(),uploads:0,downloads:0,removals:0,projects:0,audits:0,intents:0,
    active:true,loseCommit:false,failCommit:false,uploadFault:undefined,barrier:undefined,deleted:false,currentOwner:owner.userId,
    mode:'OPERATIONAL_V2',scenarioName:'Pra-Tender',stages:[]};
  const definitions=getScenarioDocuments('PRA_TENDER');
  const keys=[...new Set(definitions.map(d=>d.stageKey))];
  state.stages=keys.map((k,i)=>({id:randomUUID(),name:k,description:null,step_order:i+1,stage_key:k,default_role:'SA'}));
  state.stages.push({id:randomUUID(),name:'Tender Process',description:null,step_order:keys.length+1,stage_key:'TENDER_PROCESS',default_role:'SALES'});
  const fail=(code:string)=>({data:null,error:{code,message:'PRIVATE PROVIDER DETAIL'}});
  (supabaseAdmin as any).from=(table:string)=>{
    const q:any={select:()=>q,eq:()=>q,order:()=>q,single:async()=>({data:{id:input.scenario_id,name:state.scenarioName,is_active:true,workflow_model:state.mode,workflow_version:state.mode==='LEGACY'?1:2},error:null}),
      then:(yes:any,no:any)=>Promise.resolve({data:state.stages,error:null}).then(yes,no)};
    if(!['scenarios','workflow_stages'].includes(table))throw new Error('Unexpected direct writer/read: '+table);
    return q;
  };
  (supabaseAdmin as any).rpc=async(name:string,args:any)=>{
    assert.equal(name,'project_creation_operation');const op=args.p_operation;let r=state.receipts.get(args.p_request_id);
    if(!state.active || args.p_actor_id!==owner.userId)return fail('42501');
    if(r && (r.fingerprint!==args.p_fingerprint || (args.p_payload && JSON.stringify(r.payload)!==JSON.stringify(args.p_payload))))return fail('40001');
    if(r?.status==='COMMITTED')return state.deleted?fail('P0002'):state.currentOwner!==owner.userId?fail('42501'):{data:{status:r.status,project_id:r.project_id},error:null};
    if(op==='LOOKUP')return {data:{status:!r?'NONE':r.lease?'BUSY':'PROCESSING'},error:null};
    if(op==='CLAIM'){
      if(r?.lease)return {data:{status:'BUSY'},error:null};
      if(!r){const project_id=randomUUID();r={project_id,request_id:args.p_request_id,status:'PROCESSING',payload:args.p_payload,fingerprint:args.p_fingerprint,plan:args.p_plan,
        files:args.p_payload.attachments.map((f:any,ordinal:number)=>{const id=randomUUID();return {...f,id,ordinal,state:'PENDING',storage_path:`project-intake/${project_id}/${id}/${id}-intake`};})};state.receipts.set(args.p_request_id,r);}
      r.lease=randomUUID();return {data:{status:r.status,project_id:r.project_id,lease:r.lease,files:r.files.map((f:any)=>({...f}))},error:null};
    }
    if(!r || r.lease!==args.p_lease)return fail('55P03');
    if(op==='RELEASE'){r.lease=undefined;return {data:{status:'PROCESSING'},error:null};}
    if(op==='START_FILE'){assert.equal(r.files[args.p_ordinal].state,'PENDING');r.files[args.p_ordinal].state='UPLOADING';}
    if(op==='STORED_FILE')r.files[args.p_ordinal].state='STORED';
    if(op==='COMMIT'){
      assert(r.files.every((f:any)=>f.state==='STORED'));if(state.failCommit)return fail('XX000');
      state.projects++;state.audits++;r.milestones=r.plan.milestones;r.outputs=r.plan.outputs;r.intake=r.files.map((f:any)=>({...f}));r.status='COMMITTED';r.lease=undefined;
      if(state.loseCommit){state.loseCommit=false;throw new Error('Connection lost AFTER simulated commit');}
      return {data:{status:'COMMITTED',project_id:r.project_id},error:null};
    }
    return {data:{status:'PROCESSING'},error:null};
  };
  DocumentStorageService.upload=async(f,p)=>{state.uploads++;if(state.barrier)await state.barrier;
    if(state.uploadFault==='missing'){state.uploadFault=undefined;throw new Error('Timeout without known result');}
    assert(!state.objects.has(p),'Must not overwrite/re-upload existing object');state.objects.set(p,Buffer.from(f.buffer));
    if(state.afterStoreBarrier)await state.afterStoreBarrier;
    if(state.uploadFault==='arrived'){state.uploadFault=undefined;throw new Error('Timeout AFTER Storage accepted bytes');}
  };
  DocumentStorageService.removeMany=async()=>{state.removals++;throw new Error('Never remove uncertain bytes');};
  (supabaseAdmin.storage as any).from=()=>({download:async(p:string)=>{state.downloads++;const bytes=state.objects.get(p);return bytes?{data:{arrayBuffer:async()=>Uint8Array.from(bytes).buffer},error:null}:{data:null,error:{message:'PRIVATE STORAGE ERROR'}};}});
  (ProjectManagementService as any).get=async(id:string)=>({id,name:state.currentName||'Current project',sales_id:state.currentOwner,status:'DRAFT'});
  (MilestoneService as any).list=async()=>[...state.receipts.values()][0].milestones;
  (ProjectIntakeService as any).list=async()=>[...state.receipts.values()][0].intake.map((f:any)=>({id:f.id,kind:f.kind,file_name:f.name,mime_type:f.mime,size_bytes:f.size}));
  try{await run(state);}finally{supabaseAdmin.rpc=original.rpc;supabaseAdmin.from=original.from;(supabaseAdmin.storage as any).from=original.storage;DocumentStorageService.upload=original.upload;DocumentStorageService.removeMany=original.remove;ProjectManagementService.get=original.get;MilestoneService.list=original.list;ProjectIntakeService.list=original.intake;}
}
const errorCode=(code:string)=>(error:any)=>error instanceof ProjectCreationRequestError && error.code===code && !error.message.includes('PRIVATE');
async function run(){
  const a=files(),b=files();b.documents[0]=file('same.pdf','application/pdf','otherbytes');
  assert.equal(a.documents[0].size,b.documents[0].size);assert.notEqual(projectCreationPayload(input,a).fingerprint,projectCreationPayload(input,b).fingerprint,'Equal names/sizes/MIME do not identify content');
  await fixture(async s=>{const id=randomUUID();const f=files();s.loseCommit=true;
    await assert.rejects(()=>ProjectManagementService.create(input,owner,f,id),errorCode('CREATE_RETRYABLE'));
    const r=s.receipts.get(id);const project=await ProjectManagementService.create(input,owner,f,id);
    assert.equal(project.id,r.project_id);assert.equal(project.milestones.length,r.plan.milestones.length);assert.equal(project.intake_attachments.length,3);
    assert.deepEqual(project.activity_logs,[]);assert.equal(s.projects,1);assert.equal(s.audits,1);assert.equal(s.intents,0);assert.equal(s.uploads,3);assert.equal(s.removals,0);
    s.currentName='Edited after create';assert.equal((await ProjectManagementService.create(input,owner,f,id)).name,s.currentName);
    await assert.rejects(()=>ProjectManagementService.create({...input,name:'Different'},owner,f,id),errorCode('CREATE_PAYLOAD_CONFLICT'));
    await assert.rejects(()=>ProjectManagementService.create(input,{...owner,userId:randomUUID()},f,id),errorCode('CREATE_ACCESS_INVALID'));
    s.active=false;await assert.rejects(()=>ProjectManagementService.create(input,owner,f,id),errorCode('CREATE_ACCESS_INVALID'));s.active=true;
    s.currentOwner=randomUUID();await assert.rejects(()=>ProjectManagementService.create(input,owner,f,id),errorCode('CREATE_ACCESS_INVALID'));s.currentOwner=owner.userId;
    s.deleted=true;await assert.rejects(()=>ProjectManagementService.create(input,owner,f,id),errorCode('CREATE_PROJECT_DELETED'));assert.equal(s.projects,1);
  });
  await fixture(async s=>{const id=randomUUID(),f=files();let release!:()=>void;s.barrier=new Promise<void>(r=>release=r);
    const first=ProjectCreationService.create(input,owner,f,id);while(s.uploads===0)await new Promise(r=>setImmediate(r));
    await assert.rejects(()=>ProjectCreationService.create(input,owner,f,id),errorCode('CREATE_IN_PROGRESS'));assert.equal(s.uploads,1);
    s.barrier=undefined;release();await first;assert.equal(s.projects,1);assert.equal(s.audits,1);
  });
  await fixture(async s=>{const id=randomUUID(),f=files();let release!:()=>void;
    s.afterStoreBarrier=new Promise<void>(r=>release=r);
    const stale=ProjectCreationService.create(input,owner,f,id);
    while(s.objects.size===0)await new Promise(r=>setImmediate(r));
    const receipt=s.receipts.get(id);receipt.lease=undefined; // Isolated fixture: DB lease has expired.
    s.afterStoreBarrier=undefined;
    const fresh=await ProjectCreationService.create(input,owner,f,id); // Probes accepted bytes; commits once.
    release();assert.equal(await stale,fresh);
    assert.equal(s.projects,1);assert.equal(s.audits,1);assert.equal(s.uploads,3,
      'A stale worker learning COMMITTED must stop before uploading its remaining PENDING descriptors');
  });
  await fixture(async s=>{const id=randomUUID(),f=files();s.uploadFault='arrived';const project=await ProjectCreationService.create(input,owner,f,id);
    assert(project);assert.equal(s.projects,1);assert.equal(s.uploads,3);assert.equal(s.downloads,1);assert.equal(s.removals,0);
  });
  await fixture(async s=>{const id=randomUUID(),f=files();s.uploadFault='missing';
    await assert.rejects(()=>ProjectCreationService.create(input,owner,f,id),errorCode('CREATE_STORAGE_UNCERTAIN'));
    const r=s.receipts.get(id);assert.equal(r.files[0].state,'UPLOADING');assert.equal(s.projects,0);
    await assert.rejects(()=>ProjectCreationService.create(input,owner,f,id),errorCode('CREATE_STORAGE_UNCERTAIN'));assert.equal(s.uploads,1,'Unknown result never authorizes a second upload');
    // Simulate late provider completion / process restart. Recovery is persisted, not a Node Map.
    s.objects.set(r.files[0].storage_path,Buffer.from(f.mom[0].buffer));
    await ProjectCreationService.create(input,owner,f,id);assert.equal(s.uploads,3);assert.equal(s.projects,1);assert.equal(s.removals,0);
  });
  await fixture(async s=>{const id=randomUUID(),f=files();s.failCommit=true;
    await assert.rejects(()=>ProjectCreationService.create(input,owner,f,id),errorCode('CREATE_RETRYABLE'));
    assert.equal(s.projects,0);assert.equal(s.audits,0);assert(s.receipts.get(id).files.every((f:any)=>f.state==='STORED'));
    s.failCommit=false;await ProjectCreationService.create(input,owner,f,id);assert.equal(s.uploads,3,'Retry finalization does not transfer confirmed files again');
  });
  await fixture(async s=>{const legacy=await prepareProjectCreationPlan(input);assert(legacy.milestones.every((m:any)=>m.status==='CREATED'));
    s.mode='LEGACY';s.scenarioName='Assessment';const plan=await prepareProjectCreationPlan(input);assert.equal(plan.milestones[0].status,'COMPLETED');assert.equal(plan.milestones[1].status,'IN_PROGRESS');
  });
  await fixture(async s=>{s.scenarioName='On Submission Tender';const definitions=getScenarioDocuments('ON_SUBMISSION_TENDER');
    const keys=[...new Set(definitions.map(d=>d.stageKey))];
    s.stages=keys.map((k,i)=>({id:randomUUID(),name:k,description:null,step_order:i+1,stage_key:k,default_role:'SA'}));
    s.stages.push({id:randomUUID(),name:'Tender Process',description:null,step_order:keys.length+1,stage_key:'TENDER_PROCESS',default_role:'SALES'});
    const plan=await prepareProjectCreationPlan({...input,selectedDocumentKeys:[]});
    assert.equal(plan.outputs.length,definitions.filter(d=>d.isRequired).length);
    assert(plan.outputs.every(o=>o.is_required));assert.equal(plan.milestones.at(-1)?.workflow_stage_id,s.stages.at(-1).id);
    assert(plan.milestones.every(m=>m.status==='CREATED'));
  });
  let response:any;await ProjectManagementController.create({body:input,files:files(),headers:{},user:owner} as any,{status:(status:number)=>({json:(body:any)=>{response={status,body};}})} as any);
  assert.equal(response.status,422);assert.equal(response.body.errors.code,'CREATE_REQUEST_REQUIRED');assert(!JSON.stringify(response).includes('storage_path'));
  console.log('Create receipts: real service/controller + isolated fixtures for replay, concurrent requests, content fingerprint, access, partial/uncertain Storage, commit failure, current reads and tombstones passed. SQL assertions are static, not live PostgreSQL proof.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
