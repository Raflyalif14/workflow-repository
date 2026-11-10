import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { proofMessage } from '../utils/face-login-crypto';

async function main(){
 process.env.NODE_ENV='development';process.env.FACE_LOGIN_ENABLED='true';process.env.FACE_LOGIN_SINGLE_GLANCE_ENABLED='true';
 process.env.FACE_LOGIN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex');
 const config=require('../config/supabase'),inference=require('../utils/run-face-login-inference'),service=require('./face-login.service');
 const origin=require('../config/env').ENV.APP_BASE_URL;
 const users=[0,1].map(i=>({id:crypto.randomUUID(),email:`person${i}@fixture.invalid`,full_name:`Person ${i}`,role:'SA',is_active:true,must_change_password:false}));
 const devices=users.map(()=>crypto.randomUUID()),pair=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}),fresh=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
 const key=(p:any)=>p.publicKey.export({format:'jwk'}),vector=(axis:number)=>Array.from({length:128},(_,i)=>i===axis?1:0);
 let lookup='',enrolling=0,face=0,failure='',sessions=0,tokenUser=users[0].id;
 config.supabaseAdmin.from=()=>({select(){return this;},eq(_field:string,value:string){lookup=value;return this;},single:async()=>({data:users.find(u=>u.id===lookup)})});
 config.createSupabaseAuthClient=()=>({auth:{signInWithPassword:async()=>({data:{user:{id:lookup},session:{}}}),signOut:async()=>{},verifyOtp:async()=>{sessions++;return {data:{user:{id:tokenUser},session:{access_token:'fixture-access',refresh_token:'fixture-refresh'}}};}}});
 config.supabaseAdmin.auth.admin.getUserById=async(id:string)=>({data:{user:users.find(u=>u.id===id)}});
 config.supabaseAdmin.auth.admin.generateLink=async({email}:{email:string})=>{tokenUser=users.find(u=>u.email===email)!.id;return {data:{user:{id:tokenUser},properties:{hashed_token:'fixture-only'}}};};
 inference.runFaceLoginInference=async()=>({embedding:vector(enrolling)});
 inference.runFaceIdentificationInference=async()=>{if(failure)throw Error(failure);return [vector(face),vector(face),vector(face)];};
 const start=()=>service.startFaceChallenge({deviceId:crypto.randomUUID(),identify:true,publicKey:key(fresh)},origin);
 const finish=async(c:any,p:any,userId?:string)=>{
  const frames=[0,1,2].map(i=>Buffer.from('frame-'+i)),hashes=frames.map(f=>crypto.createHash('sha256').update(f).digest('hex'));
  const signature=crypto.sign('sha256',Buffer.from(proofMessage(c.id,c.nonce,c.action,c.deviceId,hashes)),{key:p.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  return service.finishFaceChallenge({challengeId:c.id,hashes,signature},frames,origin,new AbortController().signal,userId);
 };
 try{
  for(let i=0;i<2;i++){enrolling=i;await finish(await service.startFaceChallenge({deviceId:devices[i],publicKey:key(pair),password:'fixture'},origin,users[i].id),pair,users[i].id);}
  for(let i=0;i<2;i++){face=i;const c=await start();assert.equal(c.userId,undefined);assert.equal(c.registrations,undefined);const result=await finish(c,fresh);assert.equal(result.user.id,users[i].id);await assert.rejects(finish(c,fresh),/FACE_CHALLENGE_EXPIRED/);}
  assert.equal(sessions,2);
  face=2;await assert.rejects(finish(await start(),fresh),/FACE_NO_MATCH/);
  face=0;failure='FACE_LIVENESS_FAILED';await assert.rejects(finish(await start(),fresh),/FACE_LIVENESS_FAILED/);failure='';
  users[0].is_active=false;await assert.rejects(finish(await start(),fresh),/FACE_ACCESS_DENIED/);users[0].is_active=true;
  const c=await start();await service.removeAllFaceDevices(users[0].id,'fixture');await assert.rejects(finish(c,fresh),/FACE_NO_MATCH/);
  assert.equal(sessions,2,'No session for unknown/spoofed/disabled/revoked identities');
  console.log('PASS face-only fresh-browser login routes to the correct account; replay, unknown, spoof, disabled and revoked accounts reject');
 }finally{for(const user of users){user.is_active=true;await service.removeAllFaceDevices(user.id,'fixture');}}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
