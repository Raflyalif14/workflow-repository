import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { proofMessage } from '../utils/face-login-crypto';

async function main() {
  process.env.NODE_ENV='development'; process.env.FACE_LOGIN_ENABLED='true';
  process.env.FACE_LOGIN_SINGLE_GLANCE_ENABLED='true';
  process.env.FACE_LOGIN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex');
  const config=require('../config/supabase'), inference=require('../utils/run-face-login-inference');
  const service=require('./face-login.service'), origin=require('../config/env').ENV.APP_BASE_URL;
  const owner=crypto.randomUUID(), originalDevice=crypto.randomUUID();
  const enrolledKey=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
  const freshKey=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
  const publicKey=(pair:any)=>pair.publicKey.export({format:'jwk'});
  let authCount=0, failure='', lookup='';
  const user={id:owner,email:'camera@fixture.invalid',full_name:'Fixture',role:'SA',is_active:true,must_change_password:false};
  config.supabaseAdmin.from=()=>({select(){return this;},eq(field:string,value:string){lookup=field==='email'?value:'';return this;},single:async()=>({data:lookup && lookup!==user.email?null:user})});
  config.createSupabaseAuthClient=()=>({auth:{signInWithPassword:async()=>({data:{user:{id:owner},session:{}}}),signOut:async()=>{},verifyOtp:async()=>{authCount++;return {data:{user:{id:owner},session:{access_token:'fixture-access',refresh_token:'fixture-refresh'}}};}}});
  config.supabaseAdmin.auth.admin.getUserById=async()=>({data:{user:{id:owner,email:user.email}}});
  config.supabaseAdmin.auth.admin.generateLink=async()=>({data:{user:{id:owner},properties:{hashed_token:'fixture-only'}}});
  inference.runFaceLoginInference=async()=>({embedding:Array.from({length:128},(_,i)=>i===0?1:0)});
  inference.runFacePassiveLoginInference=async(_frames:any,template:number[])=>{assert.equal(template[0],1);if(failure)throw Error(failure);};
  const finish=async(c:any,pair:any,userId?:string)=>{
    const frames=[0,1,2].map(i=>Buffer.from('synthetic-frame-'+i));
    const hashes=frames.map(frame=>crypto.createHash('sha256').update(frame).digest('hex'));
    const signature=crypto.sign('sha256',Buffer.from(proofMessage(c.id,c.nonce,c.action,c.deviceId,hashes)),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
    return service.finishFaceChallenge({challengeId:c.id,hashes,signature},frames,origin,new AbortController().signal,userId);
  };
  const start=()=>service.startFaceChallenge({deviceId:crypto.randomUUID(),email:user.email,publicKey:publicKey(freshKey)},origin);
  try {
    const enroll=await service.startFaceChallenge({deviceId:originalDevice,password:'fixture',publicKey:publicKey(enrolledKey)},origin,owner);
    await finish(enroll,enrolledKey,owner);
    const c=await start(); const result=await finish(c,freshKey);
    assert.equal(result.accessToken,'fixture-access');assert.equal(authCount,1);
    assert.equal((await service.listFaceDevices(owner)).devices.length,1,'Cross-browser login creates no extra registration');
    await assert.rejects(finish(c,freshKey),/FACE_CHALLENGE_EXPIRED/);
    await assert.rejects(finish(await start(),enrolledKey),/FACE_DEVICE_INVALID/,'Fresh challenge must use its own key');
    for(const code of ['FACE_NO_MATCH','FACE_LIVENESS_FAILED']) {failure=code;await assert.rejects(finish(await start(),freshKey),new RegExp(code));}
    assert.equal(authCount,1,'Rejected faces never issue sessions');
    failure=''; await finish(await start(),freshKey);assert.equal(authCount,2);
    const revoked = await start();
    await service.removeAllFaceDevices(owner,'fixture');
    await assert.rejects(finish(revoked,freshKey),/FACE_DEVICE_MISSING|FACE_CHALLENGE_EXPIRED/);
    const again = await service.startFaceChallenge({deviceId:originalDevice,password:'fixture',publicKey:publicKey(enrolledKey)},origin,owner);
    await finish(again,enrolledKey,owner);
    const deactivated = await start(); user.is_active=false;
    await assert.rejects(finish(deactivated,freshKey),/FACE_ACCESS_DENIED/);
    user.is_active=true; assert.equal(authCount,2,'Revoked and disabled accounts cannot issue sessions');
    failure='FACE_NO_MATCH';
    for(let i=0;i<5;i++)await assert.rejects(finish(await start(),freshKey),/FACE_NO_MATCH/);
    await assert.rejects(start(),/FACE_RATE_LIMIT/,'Fresh device IDs cannot bypass account failures');
    await assert.rejects(service.startFaceChallenge({deviceId:crypto.randomUUID(),email:'missing@fixture.invalid',publicKey:publicKey(freshKey)},origin),/FACE_ACCESS_DENIED/);
    // Clear failures by waiting is unnecessary for revocation: a pending challenge was created before the failures.
  } finally { await service.removeAllFaceDevices(owner,'fixture'); }
  await assert.rejects(start(),/FACE_ACCESS_DENIED|FACE_RATE_LIMIT/);
  console.log('PASS cross-browser existing enrollment, new proof key, no extra enrollment, replay, spoof/mismatch, account-wide rate limit and revocation');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
