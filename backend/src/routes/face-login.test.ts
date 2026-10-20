import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';

async function run() {
  process.env.NODE_ENV='development'; process.env.FACE_LOGIN_ENABLED='true'; process.env.FACE_LOGIN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex');
  process.env.SUPABASE_URL='http://127.0.0.1:1'; process.env.SUPABASE_ANON_KEY='synthetic'; process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
  const {supabaseAdmin}=require('../config/supabase'), service=require('../services/face-login.service');
  const owner=crypto.randomUUID(), origin=require('../config/env').ENV.APP_BASE_URL;
  supabaseAdmin.auth.getUser=async(token:string)=>token==='valid'?{data:{user:{id:owner}},error:null}:{data:{user:null},error:{status:401,code:'bad_jwt'}};
  supabaseAdmin.from=()=>({select(){return this;},eq(){return this;},single:async()=>({data:{id:owner,email:'fixture@fixture.invalid',role:'SA',is_active:true,must_change_password:false},error:null})});
  let processed=0, retained:Buffer[]=[], held=false, sawAbort=false, rejectFace=false;
  const old=service.finishFaceChallenge, oldList=service.listFaceDevices, oldStart=service.startFaceChallenge;
  let listed=0;
  service.listFaceDevices=async(userId:string)=>{assert.equal(userId,owner);listed++;return{devices:[{deviceId:crypto.randomUUID(),browser:'edge',platform:'windows',createdAt:'2026-10-14T03:00:00.000Z',lastUsedAt:null}]};};
  service.startFaceChallenge=async(_input:any,suppliedOrigin:string,userId?:string,userAgent?:string)=>{
    assert.equal(suppliedOrigin,origin);assert.equal(userAgent,'Windows Chrome/130 Edg/130');
    if(userId)assert.equal(userId,owner);return{action:userId?'enroll':'login-passive'};
  };
  service.finishFaceChallenge=async(input:any, frames:Buffer[], suppliedOrigin:string, signal:AbortSignal, userId?:string, passive=false)=>{
    processed++;retained=frames;assert.equal(suppliedOrigin,origin);assert.equal(frames.length,3);assert.equal(input.challengeId,'fixture-id');
    if(rejectFace)throw Error('FACE_NO_MATCH');
    if(held)return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{sawAbort=true;reject(Error('FACE_CHALLENGE_EXPIRED'));},{once:true}));
    if(passive){assert.equal(userId,owner);return{evaluationOnly:true,accepted:true,sample:'live'};}
    return userId?{registered:true,deviceId:'fixture-device'}:{accessToken:'fixture-access',refreshToken:'fixture-refresh',user:{id:owner}};
  };
  const express=require('express'), app=express();app.use(express.json());app.use('/api/face-login',require('./face-login.routes').createFaceLoginRouter());
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  const form=(count=3)=>{const value=new FormData();value.append('proof',JSON.stringify({challengeId:'fixture-id'}));for(let i=0;i<count;i++)value.append('frames',new Blob(['fixture-'+i],{type:'image/png'}),i+'.png');return value;};
  const post=(route:string,token?:string,opts:any={})=>fetch(base+'/api/face-login/'+route,{method:'POST',body:form(),headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{})},...opts});
  try{
    const getDevices=(token?:string,suppliedOrigin=origin)=>fetch(base+'/api/face-login/devices?userId='+crypto.randomUUID(),{headers:{Origin:suppliedOrigin,...(token?{Authorization:'Bearer '+token}:{})}});
    assert.equal((await getDevices()).status,401);assert.equal((await getDevices('invalid')).status,401);
    assert.equal((await getDevices('valid','https://wrong.invalid')).status,422);assert.equal(listed,0);
    const devices=await getDevices('valid');assert.equal(devices.status,200);assert.equal(devices.headers.get('cache-control'),'no-store');
    assert.equal((await devices.json()).data.devices[0].browser,'edge');assert.equal(listed,1);
    for(const action of ['enroll','login']){
      const start=await post(action+'/start','valid',{body:JSON.stringify({deviceId:crypto.randomUUID()}),headers:{Origin:origin,Authorization:'Bearer valid','Content-Type':'application/json','User-Agent':'Windows Chrome/130 Edg/130'}});
      assert.equal(start.status,200);
    }
    assert.equal((await post('enroll/finish')).status,401);
    assert.equal((await post('enroll/finish','invalid')).status,401);
    assert.equal((await post('passive-test/finish')).status,401);
    assert.equal((await post('passive-test/start')).status,401);
    assert.equal(processed,0);
    assert.equal((await post('login/finish',undefined,{headers:{Origin:'https://wrong.invalid'}})).status,422);assert.equal(processed,0);
    assert.equal((await post('login/finish',undefined,{body:form(2)})).status,422);assert.equal(processed,0);
    const enroll=await post('enroll/finish','valid');assert.equal(enroll.status,200);assert.equal(enroll.headers.get('cache-control'),'no-store');assert.equal((await enroll.json()).data.registered,true);
    await new Promise(r=>setImmediate(r));assert(retained.every(frame=>frame.every(n=>n===0)),'Request pixels cleared after response');
    const login=await post('login/finish');assert.equal(login.status,200);const data=(await login.json()).data;assert.equal(data.accessToken,'fixture-access');assert(!('embedding'in data));
    const passive=await post('passive-test/finish','valid');assert.equal(passive.status,200);const evaluation=(await passive.json()).data;
    assert.equal(evaluation.evaluationOnly,true);assert(!('accessToken'in evaluation));
    held=true;const abort=new AbortController();const request=post('login/finish',undefined,{signal:abort.signal}).catch(()=>null);
    for(let i=0;i<100&&processed<4;i++)await new Promise(r=>setTimeout(r,10));assert.equal(processed,4);abort.abort();await request;
    for(let i=0;i<100&&!sawAbort;i++)await new Promise(r=>setTimeout(r,10));assert(sawAbort);
    held=false;
    // More than the old 20-request allowance must work when logins succeed.
    for(let i=0;i<25;i++)assert.equal((await post('login/finish')).status,200);
    // Real successful login also clears previous failed HTTP requests.
    for(let round=0;round<2;round++){
      rejectFace=true;
      for(let i=0;i<15;i++)assert.equal((await post('login/finish')).status,422);
      rejectFace=false;assert.equal((await post('login/finish')).status,200);
    }
    rejectFace=true;
    for(let i=0;i<20;i++)assert.equal((await post('login/finish')).status,422);
    assert.equal((await post('login/finish')).status,429);
    rejectFace=false;
    process.env.NODE_ENV='production';assert.equal((await post('login/finish')).status,404);
    console.log('Camera HTTP PASS: real auth with synthetic provider, trusted origin, 3-frame multipart, no-store, enrollment/login responses, pixel cleanup, client-abort propagation and production-off. Face service stubbed.');
  }finally{service.finishFaceChallenge=old;service.listFaceDevices=oldList;service.startFaceChallenge=oldStart;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
}
void run().catch(e=>{console.error(e);process.exitCode=1;});
