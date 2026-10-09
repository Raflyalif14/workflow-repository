import { strict as assert } from 'assert';
import { supabaseAdmin } from '../config/supabase';
import { ArtifactMutationService, ArtifactMutationError } from './artifact-mutation.service';
import { DocumentStorageService } from '../utils/storage.util';
import { safeBusinessAudit } from './business-audit-projection';

async function run() {
  const rpc=supabaseAdmin.rpc, remove=DocumentStorageService.removeMany, log=console.error;
  const steps:string[]=[];const deleted:string[][]=[];let transfer=0;let mode='lost-response';
  try {
    console.error=()=>{};
    (DocumentStorageService as any).removeMany=async(paths:string[])=>{deleted.push(paths);};
    (supabaseAdmin as any).rpc=async(name:string,input:any)=>{
      assert.equal(name,'mutate_official_artifact');steps.push(input.p_step);
      if(input.p_step==='LOOKUP')return {data:{state:mode==='already-committed'?'COMMITTED':'NONE',result:{id:'receipt'}},error:null};
      if(input.p_step==='RESERVE')return {data:{state:'RESERVED',token:'owned-token',files:[{path:'owned-path'}]},error:null};
      assert.equal(input.p_token,'owned-token');
      if(input.p_step==='COMMIT')return {data:null,error:{code:mode==='stale'?'40001':'23514'}};
      if(mode==='uncertain')throw new Error('Synthetic response unavailable');
      return {data:mode==='lost-response'?{state:'COMMITTED',result:{id:'saved'}}:{state:'FROZEN',files:[{path:'owned-path'}]},error:null};
    };
    const send=()=>ArtifactMutationService.execute('actor','CONTRIBUTION',{},'request',async()=>{transfer++;});
    assert.deepEqual(await send(),{id:'saved'});assert.equal(deleted.length,0,'Committed bytes must never be removed after lost response');
    mode='uncertain';await assert.rejects(send(),ArtifactMutationError);assert.equal(deleted.length,0,'Uncertain metadata must preserve bytes');
    mode='stale';await assert.rejects(send(),(e:unknown)=>e instanceof ArtifactMutationError && e.statusCode===409);
    assert.deepEqual(deleted,[['owned-path']],'Only server-frozen exact paths may be removed');
    mode='already-committed';const before=transfer;assert.deepEqual(await send(),{id:'receipt'});assert.equal(transfer,before,'Receipt replay never transfers bytes');
    assert.equal(steps.at(-1),'LOOKUP');
    const projected=safeBusinessAudit({object_type:'OFFICIAL_DOCUMENT',object_id:'document',changed_fields:['version_number','storage_path','feedback'],before:{version_number:1,storage_path:'hidden'},after:{version_number:2,storage_path:'hidden',feedback:'private'}});
    assert.deepEqual(projected?.changedFields,['version_number']);assert.deepEqual(projected?.after,{version_number:2});
    console.log('PASS artifact RPC receipt replay, safe recovery, stale error and allowlisted audit projection');
  } finally {(supabaseAdmin as any).rpc=rpc;DocumentStorageService.removeMany=remove;console.error=log;}
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
