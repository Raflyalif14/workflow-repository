import assert from 'node:assert/strict';
import { supabaseAdmin as db } from '../config/supabase';
import { calendarConfig,calendarScope,encryptToken,decryptToken,meetingEvent,completeGoogleConnection,beginGoogleConnection,connectionStatus,disconnectGoogle,GoogleCalendarError } from './google-calendar.service';
import { synchronizeGoogleConnection } from './google-calendar.worker';

async function main(){
 const saved={fetch:globalThis.fetch,from:db.from,rpc:db.rpc,env:{...process.env}};
 Object.assign(process.env,{GOOGLE_CALENDAR_CLIENT_ID:'test-client',GOOGLE_CALENDAR_CLIENT_SECRET:'test-secret',GOOGLE_CALENDAR_TOKEN_KEY:'ab'.repeat(32),
  GOOGLE_CALENDAR_REDIRECT_URI:'http://localhost:3000/settings/google-calendar/callback',GOOGLE_CALENDAR_APP_URL:'http://localhost:3000'});
 const user='11111111-1111-4111-8111-111111111111';
 const connection:any={user_id:user,id:'connection',refresh_token:encryptToken('private-refresh',user),calendar_id:'app-calendar',status:'CONNECTED',lease_id:'lease'};
 const mappings:any[]=[],calls:{url:string;method:string;body:any}[]=[];
 let desired:any[]=[],oauth:any=null,oauthConsumed=false,connectionExists=false;
 let simulateLostInsert=false;
 try{
  assert(calendarConfig().ready);
  assert.equal(decryptToken(connection.refresh_token,user),'private-refresh');
  assert.throws(()=>decryptToken(connection.refresh_token,'other-user'));
  assert(!connection.refresh_token.includes('private-refresh'));
  process.env.GOOGLE_CALENDAR_APP_URL='http://unsafe.example';assert(!calendarConfig().ready);process.env.GOOGLE_CALENDAR_APP_URL='http://localhost:3000';
  (db as any).from=(table:string)=>{
   let mode='select',body:any,filters:[string,any][]=[];
   const q:any={select:()=>q,eq:(key:string,value:any)=>{filters.push([key,value]);return q;},order:()=>q,range:()=>q,maybeSingle:()=>q,
    insert:(value:any)=>{mode='insert';body=value;return q;},upsert:(value:any)=>{mode='upsert';body=value;return q;},update:(value:any)=>{mode='update';body=value;return q;},delete:()=>{mode='delete';return q;},
    then:(resolve:any,reject:any)=>Promise.resolve().then(()=>{
     if(table==='google_calendar_oauth'){if(body)oauth=body;return {data:null,error:null};}
     if(table==='google_calendar_connections'){
      if(mode==='select')return {data:connectionExists?connection:null,error:null};
      if(mode==='insert')connectionExists=true;
      if(mode==='update'){Object.assign(connection,body);return {data:[{id:connection.id}],error:null};}
      if(mode==='delete')connectionExists=false;
      return {data:null,error:null};
     }
     assert.equal(table,'google_calendar_events');
     const match=mappings.filter(row=>filters.every(([key,value])=>row[key]===value));
     if(mode==='upsert'){const old=mappings.find(m=>m.meeting_id===body.meeting_id);if(old)Object.assign(old,body);else mappings.push({...body});}
     if(mode==='update')match.forEach(row=>Object.assign(row,body));
     return {data:mode==='select'?match:null,error:null};
    }).then(resolve,reject)};return q;
  };
  (db as any).rpc=(name:string,args:any)=>{
   if(name==='consume_google_calendar_oauth'){
    const valid=!oauthConsumed&&oauth&&args.p_user===oauth.user_id&&args.p_state===oauth.state_hash;
    if(valid)oauthConsumed=true;return Promise.resolve({data:valid?[oauth]:[],error:null});
   }
   assert.equal(name,'google_calendar_meetings');assert.equal(args.p_user,user);
   const q:any={order:()=>q,range:()=>Promise.resolve({data:desired,error:null})};return q;
  };
  globalThis.fetch=(async(url:any,options:any={})=>{
   const method=options.method||'GET';const body=typeof options.body==='string'?JSON.parse(options.body):options.body;
   calls.push({url:String(url),method,body});
   if(String(url).endsWith('/token'))return new Response(JSON.stringify({access_token:'access',refresh_token:'refresh',scope:calendarScope}),{status:200});
   if(method==='DELETE')return new Response(null,{status:204});
   if(simulateLostInsert&&method==='POST'){simulateLostInsert=false;throw Error('simulated lost response');}
   return new Response(JSON.stringify({id:body?.id||'app-calendar'}),{status:200});
  }) as typeof fetch;
  const connect=await beginGoogleConnection(user),authUrl=new URL(connect.url),state=authUrl.searchParams.get('state')!;
  assert.equal(authUrl.searchParams.get('scope'),calendarScope);assert.equal(authUrl.searchParams.get('access_type'),'offline');assert(authUrl.searchParams.get('code_challenge'));
  await assert.rejects(completeGoogleConnection('wrong-user','code',state),(e:any)=>e.code==='GOOGLE_STATE_INVALID');
  assert.equal(calls.length,0,'A wrong actor/state cannot exchange a Google code');
  await completeGoogleConnection(user,'code',state);
  await assert.rejects(completeGoogleConnection(user,'code',state),(e:any)=>e.code==='GOOGLE_STATE_INVALID');
  const meeting={id:'meeting',title:'Review',project_id:'project',project_name:'Project',starts_at:'2026-11-13T08:00:00Z',ends_at:null,agenda:'Review proposal',location:'Office'};
  assert.equal(meetingEvent(meeting).end.dateTime,'2026-11-13T08:30:00.000Z');assert.equal(meetingEvent(meeting).transparency,'transparent');
  desired=[meeting];calls.length=0;
  await synchronizeGoogleConnection({...connection,lease_id:'lease'});
  assert.equal(calls.filter(c=>c.method==='POST'&&c.url.includes('/events')).length,1);
  const eventId=mappings[0].event_id;
  calls.length=0;await synchronizeGoogleConnection({...connection,lease_id:'lease'});
  assert.equal(calls.filter(c=>c.url.includes('/events')).length,0,'Unchanged meetings are not duplicated');
  desired=[{...meeting,starts_at:'2026-11-14T08:00:00Z'}];calls.length=0;await synchronizeGoogleConnection({...connection,lease_id:'lease'});
  assert(calls.some(c=>c.method==='PUT'&&c.url.endsWith(eventId)),'Approved schedule changes update the same event');
  desired=[];calls.length=0;await synchronizeGoogleConnection({...connection,lease_id:'lease'});
  assert(calls.some(c=>c.method==='DELETE'&&c.url.endsWith(eventId)));assert(mappings[0].deleted);
  desired=[meeting];simulateLostInsert=true;await synchronizeGoogleConnection({...connection,lease_id:'lease'});
  const retryId=mappings[0].event_id;assert.notEqual(retryId,eventId,'Reassignment uses a new id after deletion');
  await synchronizeGoogleConnection({...connection,lease_id:'lease'});assert.equal(mappings[0].event_id,retryId,'Retries retain their stored event id');
  calls.length=0;await synchronizeGoogleConnection({...connection,status:'DISCONNECTING',lease_id:'lease'});
  assert(calls.some(c=>c.method==='DELETE'&&c.url.endsWith('/calendars/app-calendar')));
  assert(!connectionExists);

  // Worker disconnect must still clean up local connection if Google returns HTTP 500 or network timeout.
  connectionExists=true;
  const okFetch=globalThis.fetch;
  globalThis.fetch=(async()=>new Response(JSON.stringify({error:'internal'}),{status:500})) as typeof fetch;
  await synchronizeGoogleConnection({...connection,status:'DISCONNECTING',lease_id:'lease'});
  assert(!connectionExists,'Worker disconnect must delete local connection even on non-404 Google errors');

  // Direct disconnectGoogle must perform best-effort remote cleanup and immediately reset to NOT_CONNECTED even when Google fails.
  connectionExists=true;
  globalThis.fetch=(async()=>{throw Error('offline');}) as typeof fetch;
  const disconnected=await disconnectGoogle(user);
  assert.equal(disconnected.status,'NOT_CONNECTED');
  assert(!connectionExists,'disconnectGoogle must remove stuck local connection even if Google API fails');
  assert.equal((await connectionStatus(user)).status,'NOT_CONNECTED');
  const reconnected=await beginGoogleConnection(user);
  assert(reconnected.url.includes('accounts.google.com'),'User can immediately reconnect after disconnect');
  globalThis.fetch=okFetch;

  console.log('PASS OAuth actor/state/replay, encrypted credentials, meeting sync, reschedule, cancellation, retry identity and disconnect');
 }finally{globalThis.fetch=saved.fetch;db.from=saved.from;db.rpc=saved.rpc;for(const key of Object.keys(process.env))if(!(key in saved.env))delete process.env[key];Object.assign(process.env,saved.env);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
