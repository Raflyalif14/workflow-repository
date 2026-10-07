import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import projectRoutes from '../routes/project.routes';
import { supabaseAdmin } from '../config/supabase';
import { DocumentAccessService,DocumentAccessError } from './document-access.service';
const projectId='00000000-0000-4000-8000-000000000001',requestId='00000000-0000-4000-8000-000000000002';
const actors:any[]=[{ id:'head',role:'HEAD_SA',is_active:true },{ id:'admin',role:'SUPER_ADMIN',is_active:true },
  { id:'sales',role:'SALES',is_active:true },{ id:'sa',role:'SA',is_active:true },{ id:'inactive',role:'HEAD_SA',is_active:false }];
const actor=(id:string) => ({ userId:id,role:actors.find(user => user.id===id)!.role });
const sql=readFileSync(resolve(__dirname,'../../supabase/phase32-project-document-sharing.sql'),'utf8').replace(/\r\n/g,'\n');
const setter=sql.slice(sql.indexOf('create function public.set_project_document_sharing'),sql.indexOf('revoke all on function public.get_project_document_sharing'));
const reader=sql.slice(sql.indexOf('create or replace function public.list_document_repository_access'),sql.indexOf('-- Retire old writer'));
assert(sql.startsWith('-- Phase 32') && sql.trim().endsWith('commit;'));
assert(sql.indexOf('lock table public.document_repository_access')<sql.indexOf('with legacy_choices'));
assert(sql.includes('legacy_choices(project_id,access_mode) as (select null::uuid,null::text where false)'), 'Empty manifest never promotes legacy sharing');
assert(sql.indexOf('Classify every legacy shared/granted project explicitly')<sql.indexOf('create or replace function public.list_document_repository_access'));
assert(sql.includes('s.legacy_classified_at is not null'));
assert(!reader.includes('document_repository_access a') && !reader.includes('document_repository_grants'));
assert(reader.includes('project_document_sharing a on a.project_id=d.project_id'));
assert(reader.includes("s.valid_approved and s.mode='SHARED_INTERNAL'"));
assert(reader.includes("v.snapshot_kind <> 'LEGACY_UPLOAD_UNCONFIRMED'") && reader.includes("nullif(btrim(f.storage_path),'') is null"));
assert(!reader.includes('active_phase_id'),'All valid completed-phase results remain eligible');
assert(reader.includes('u.is_active') && reader.includes('not coalesce(u.must_change_password,false)'));
assert(setter.indexOf('role in')<setter.indexOf('insert into public.project_document_sharing('));
assert(setter.indexOf('from public.projects where id=p_project_id for update')<setter.indexOf('from public.project_document_sharing_requests'));
assert(setter.indexOf('v_r.payload is distinct from v_payload')<setter.indexOf('v_s.revision <> p_expected_revision'),'Receipt replay is checked before CAS');
assert(setter.includes("jsonb_build_object('replayed',true)"));
assert(setter.indexOf('if v_changed then')<setter.indexOf('insert into public.activity_logs') && setter.indexOf('insert into public.activity_logs')<setter.indexOf('insert into public.project_document_sharing_requests'));
assert(setter.includes("'source_type','PROJECT'") && setter.includes("'before',jsonb_build_object('mode',v_before)"));
assert(!setter.includes('exception when'),'Audit failure must abort the transaction, not be swallowed');
const changedStart=setter.indexOf('if v_changed then'),changedEnd=setter.indexOf('end if;',changedStart);
const changedBranch=setter.slice(changedStart,changedEnd);
assert(changedBranch.includes('update public.project_document_sharing') && changedBranch.includes('insert into public.activity_logs'),'No-op skips both setting update and audit inside the same guard');
assert(!setter.slice(changedEnd).includes('insert into public.activity_logs'),'No unconditional success audit');

assert(sql.includes('primary key(project_id,request_id)') && sql.includes("check(access_mode in ('RESTRICTED','SHARED_INTERNAL'))"));
assert(sql.includes("revoke all on function public.set_document_repository_access(uuid,text,uuid,text,uuid[],bigint,uuid) from public,anon,authenticated,service_role"));
assert(!/\bdelete from public\.document_repository|\bdrop table/i.test(sql),'Historical ACL/grants are retained');

async function main() {
  const originals={ rpc:supabaseAdmin.rpc,from:supabaseAdmin.from,getUser:supabaseAdmin.auth.getUser };
  let errorCode:string|null=null,readMode='RESTRICTED',revision=0,calls:any[]=[];
  try {
    (supabaseAdmin as any).rpc=async (name:string,input:any) => {
      calls.push({ name,input });const user=actors.find(user => user.id===input.p_actor_id);
      const error=errorCode || (!user?.is_active || !['HEAD_SA','SUPER_ADMIN'].includes(user.role) ? '42501' : input.p_project_id!==projectId ? 'P0002':null);
      if(error) return { data:null,error:{ code:error,message:'PRIVATE_PROVIDER_ERROR' } };
      if(name==='get_project_document_sharing') return { data:{ mode:readMode,revision,updatedAt:null,updatedBy:null,storage_path:'PRIVATE_PATH',grants:['PRIVATE_RECIPIENT'] },error:null };
      assert.equal(name,'set_project_document_sharing');readMode=input.p_mode;revision++;
      return { data:{ mode:readMode,revision,changed:true,replayed:false,storage_path:'PRIVATE_PATH' },error:null };
    };
    (supabaseAdmin as any).from=(table:string) => { assert.equal(table,'users');let id='';const q:any={ select:() => q,eq:(_key:string,value:string) => { id=value;return q; },single:async () => ({ data:actors.find(user => user.id===id),error:null }) };return q; };
    (supabaseAdmin.auth as any).getUser=async (id:string) => ({ data:{ user:{ id } },error:null });
    for(const id of ['sales','sa']) await assert.rejects(() => DocumentAccessService.saveProjectSharing(actor(id),projectId,{ mode:'SHARED_INTERNAL',expected_revision:0,request_id:requestId }),e => e instanceof DocumentAccessError && e.statusCode===403);
    assert.equal(calls.length,0,'Role denial happens before mutation RPC');
    await assert.rejects(() => DocumentAccessService.getProjectSharing(actor('inactive'),projectId),e => e instanceof DocumentAccessError && e.statusCode===403);
    for(const id of ['head','admin']) {
      const setting=await DocumentAccessService.getProjectSharing(actor(id),projectId);assert.deepEqual(Object.keys(setting).sort(),['mode','revision','updatedAt','updatedBy']);
    }
    for(const [code,status] of [['40001',409],['42501',403],['22023',422],['P0002',404],['XX000',503]] as const) {
      errorCode=code;await assert.rejects(() => DocumentAccessService.saveProjectSharing(actor('head'),projectId,{ mode:'SHARED_INTERNAL',expected_revision:0,request_id:requestId }),e => e instanceof DocumentAccessError && e.statusCode===status && !e.message.includes('PRIVATE_'));
    }
    errorCode=null;
    const app=express();app.use(express.json());app.use('/projects',projectRoutes);
    const server=await new Promise<ReturnType<typeof app.listen>>(resolve => { const listener=app.listen(0,'127.0.0.1',() => resolve(listener)); });
    try {
      const address=server.address();assert(address && typeof address==='object');
      const request=(id?:string,body?:any) => fetch(`http://127.0.0.1:${address.port}/projects/${projectId}/document-sharing`,{
        method:body ? 'PUT':'GET',headers:{ ...(id ? { Authorization:`Bearer ${id}` }:{}),'Content-Type':'application/json' },...(body ? { body:JSON.stringify(body) }:{}) });
      assert.equal((await request()).status,401);assert.equal((await request('inactive')).status,401);
      for(const id of ['sa','sales']) assert.equal((await request(id)).status,403);
      for(const id of ['head','admin']) assert.equal((await request(id)).status,200);
      const before=calls.length;
      assert.equal((await request('head',{ mode:'SHARED_INTERNAL',expected_revision:0,request_id:requestId,actor_id:'fake' })).status,422);
      assert.equal(calls.length,before,'Client actor injection is rejected before writes');
      const response=await request('head',{ mode:'SHARED_INTERNAL',expected_revision:0,request_id:requestId });assert.equal(response.status,200);
      const body=await response.json() as any;assert(!JSON.stringify(body).includes('PRIVATE_'));
      assert.equal(calls.at(-1).input.p_actor_id,'head');assert.equal(calls.at(-1).input.p_project_id,projectId);
    } finally { await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error):resolve())); }
  } finally { supabaseAdmin.rpc=originals.rpc;supabaseAdmin.from=originals.from;supabaseAdmin.auth.getUser=originals.getUser; }
  console.log('Project sharing: real local HTTP auth/validation, server actor, safe projection/errors; Phase32 lock/CAS/replay/no-op/audit/cutover guards checked statically. PostgreSQL not executed.');
}
main().catch(error => { console.error(error);process.exitCode=1; });
