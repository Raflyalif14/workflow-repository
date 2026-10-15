import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parsePassiveEvaluation, PASSIVE_VERSION } from './run-face-login-inference';
const frames = [Buffer.from('one'), Buffer.from('two'), Buffer.from('three')];
const result = () => ({ status:'EVALUATED',version:PASSIVE_VERSION,hashes:frames.map(f=>crypto.createHash('sha256').update(f).digest('hex')),
  frames:Array.from({length:3},()=>({classes:[[.01,.98,.01],[.02,.96,.02]],identity:.8,consistency:.9,yaw:0})) });
assert.equal(parsePassiveEvaluation(result(),frames).accepted,true);
for(let frame=0;frame<3;frame++)for(let model=0;model<2;model++) {
  const value=result();value.frames[frame].classes[model]=[.3,.5,.2];
  assert.equal(parsePassiveEvaluation(value,frames).checks.pad,false,'Every model on every frame must pass; ties reject');
}
for(const key of ['identity','consistency'] as const) {const value=result();value.frames[1][key]=.59;assert.equal(parsePassiveEvaluation(value,frames).accepted,false);}
const tilted=result();tilted.frames[2].yaw=.23;assert.equal(parsePassiveEvaluation(tilted,frames).checks.position,false);
for(const mutate of [(v:any)=>v.hashes.reverse(),(v:any)=>v.status='SUCCESS',(v:any)=>v.version='other',
  (v:any)=>v.frames[0].classes.pop(),(v:any)=>v.frames[0].classes[0]=[0,2,0],(v:any)=>v.frames[0].identity=NaN]) {
  const value=result();mutate(value);assert.throws(()=>parsePassiveEvaluation(value,frames),/FACE_PROCESS_FAILED/);
}
const safe:any=parsePassiveEvaluation({...result(),embedding:[1],accessToken:'forbidden',accepted:false},frames);
assert.equal(safe.accepted,true);assert(!('embedding'in safe));assert(!('accessToken'in safe));
console.log('Passive decision PASS: all 6 PAD outputs, match, pose, exact hashes/version, invalid outputs rejected and no credential fields.');
