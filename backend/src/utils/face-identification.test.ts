import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { identifyFaceAccount } from './face-account-match';
import * as runner from './run-face-pad-analysis';
import { runFaceIdentificationInference, IDENTIFY_VERSION } from './run-face-login-inference';

const vector=(axis:number)=>Array.from({length:128},(_,i)=>i===axis?1:0);
const a={userId:'a',embedding:vector(0)},b={userId:'b',embedding:vector(1)};
assert.equal(identifyFaceAccount([a,b],[vector(1),vector(1),vector(1)]).userId,'b');
assert.throws(()=>identifyFaceAccount([a,b],[vector(0),vector(1),vector(0)]),/FACE_NO_MATCH/);
assert.throws(()=>identifyFaceAccount([a,b],[vector(2),vector(2),vector(2)]),/FACE_NO_MATCH/);
assert.throws(()=>identifyFaceAccount([a,{...a,userId:'duplicate'}],[vector(0),vector(0),vector(0)]),/FACE_NO_MATCH/);
const near=(score:number)=>[score,Math.sqrt(1-score*score),...Array(126).fill(0)];
assert.throws(()=>identifyFaceAccount([{userId:'a',embedding:near(.62)},{userId:'b',embedding:near(.59)}],[vector(0),vector(0),vector(0)]),/FACE_NO_MATCH/,'Close competing accounts must not be selected arbitrarily');
assert.equal(identifyFaceAccount([a,{...a},b],[vector(0),vector(0),vector(0)]).userId,'a','Multiple registrations of the same account are not ambiguous');
async function main(){
 const original=runner.runFaceLoginJob; let mutate=(value:any)=>{};
 const frames=[Buffer.from('a'),Buffer.from('b'),Buffer.from('c')];
 try{
  (runner as any).runFaceLoginJob=async(payload:Buffer)=>{
   const length=payload.readUInt32BE(0),header=JSON.parse(payload.subarray(4,4+length).toString());
   assert.equal(header.mode,'identify-passive');assert.equal(header.template,undefined);
   const result={status:'IDENTIFIED',version:IDENTIFY_VERSION,hashes:frames.map(f=>crypto.createHash('sha256').update(f).digest('hex')),embeddings:[vector(0),vector(0),vector(0)]};
   mutate(result);return result;
  };
  assert.equal((await runFaceIdentificationInference(frames,'left',true,new AbortController().signal))[0][0],1);
  for(const bad of [(r:any)=>r.hashes.reverse(),(r:any)=>r.embeddings.pop(),(r:any)=>r.embeddings[1][0]=.5,(r:any)=>r.version='other']){
   mutate=bad;await assert.rejects(runFaceIdentificationInference(frames,'left',true,new AbortController().signal),/FACE_PROCESS_FAILED/);
  }
  mutate=(r:any)=>{r.status='ERROR';r.reason='FACE_LIVENESS_FAILED';};
  await assert.rejects(runFaceIdentificationInference(frames,'left',true,new AbortController().signal),/FACE_LIVENESS_FAILED/);
  console.log('PASS unique account across every frame, ambiguity/unknown rejection, worker hashes/version/vectors and liveness failure');
 }finally{(runner as any).runFaceLoginJob=original;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
