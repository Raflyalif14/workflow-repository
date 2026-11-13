import assert from 'node:assert/strict';
import {supabaseAdmin} from '../config/supabase';
import {ProjectScopeChangeService,ScopeChangeError,scopeRequestSchema} from './project-scope-change.service';

async function main(){
 const old={rpc:supabaseAdmin.rpc,from:supabaseAdmin.from};
 const projectId='00000000-0000-4000-8000-000000000101',requestId='00000000-0000-4000-8000-000000000801';
 const actor={userId:'owner',role:'SALES'};
 const input={request_id:requestId,expected_updated_at:'2026-11-12T00:00:00Z',reason:'Remove unstarted optional output',selected_keys:['required'],additions:[]};
 let error:any=null,calls=0;
 try{
  (supabaseAdmin as any).rpc=async(name:string,args:any)=>{
   calls++;assert.equal(name,'mutate_approved_project_scope');assert.equal(args.p_actor_id,actor.userId);
   return {data:{id:requestId,before_state:{private:'hidden'},after_state:{private:'hidden'},review_request_id:'hidden',status:'PENDING'},error};
  };
  const result=await ProjectScopeChangeService.mutate(projectId,undefined,input,actor);
  assert(!('before_state' in result));assert(!('after_state' in result));assert(!('review_request_id' in result));
  await assert.rejects(()=>ProjectScopeChangeService.mutate(projectId,undefined,input,{...actor,role:'SA'}),
   (failure:unknown)=>failure instanceof ScopeChangeError&&failure.statusCode===403);
  assert.equal(calls,1);
  assert(!scopeRequestSchema.safeParse({...input,selected_keys:['duplicate','duplicate']}).success);
  assert(!scopeRequestSchema.safeParse({...input,additions:[{key:'x',start_date:'2026-02-30',duration_working_days:1}]}).success);
  assert(!scopeRequestSchema.safeParse({...input,additions:[{key:'x',start_date:'2026-11-12',duration_working_days:1,due_date:'2099-01-01'}]}).success,'due date comes from the server');
  error={code:'55000',message:'Started output cannot be removed'};
  await assert.rejects(()=>ProjectScopeChangeService.mutate(projectId,undefined,input,actor),
   (failure:unknown)=>failure instanceof ScopeChangeError&&failure.code==='SCOPE_PROTECTED');
  error={code:'40001',message:'sensitive provider details'};
  await assert.rejects(()=>ProjectScopeChangeService.mutate(projectId,undefined,input,actor),
   (failure:unknown)=>failure instanceof ScopeChangeError&&failure.code==='SCOPE_CONFLICT'&&!failure.message.includes('sensitive'));
  (supabaseAdmin as any).from=(table:string)=>{assert.equal(table,'projects');return {select(){return this;},eq(){return this;},
   maybeSingle:async()=>({data:{sales_id:'another-owner',pic_id:'another-sa'},error:null})};};
  await assert.rejects(()=>ProjectScopeChangeService.list(projectId,actor),
   (failure:unknown)=>failure instanceof ScopeChangeError&&failure.statusCode===403);
  console.log('PASS scope access, validation, server-owned due date, atomic RPC and safe response/error fields');
 }finally{(supabaseAdmin as any).rpc=old.rpc;(supabaseAdmin as any).from=old.from;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
