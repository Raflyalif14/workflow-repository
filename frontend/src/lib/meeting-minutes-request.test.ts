import assert from 'node:assert/strict';
import {setAuthTokens} from './auth';
import {SessionChangedError} from './api-client';
import {loadMeetingMinutes} from './meeting-minutes-request';
async function run(){
 const original={window:globalThis.window,fetch:globalThis.fetch};const store=new Map<string,string>();
 (globalThis as any).window={localStorage:{getItem:(key:string)=>store.get(key)||null,setItem:(key:string,value:string)=>store.set(key,value),removeItem:(key:string)=>store.delete(key)}};
 const controller=new AbortController();let data:any={id:'m',projectId:'p',minutes:{notes:'Saved notes'}};
 try{
 await assert.rejects(loadMeetingMinutes('p','m',controller.signal),SessionChangedError);
 setAuthTokens({accessToken:'synthetic-a'});
 globalThis.fetch=async()=>new Response(JSON.stringify({success:true,data}));
 assert.equal((await loadMeetingMinutes('p','m',controller.signal)).meeting.minutes!.notes,'Saved notes');
 data={...data,projectId:'foreign'};await assert.rejects(loadMeetingMinutes('p','m',controller.signal),/No saved/);
 data={id:'m',projectId:'p',minutes:null};await assert.rejects(loadMeetingMinutes('p','m',controller.signal),/No saved/);
 globalThis.fetch=async()=>new Response(JSON.stringify({success:false,message:'Forbidden'}),{status:403});await assert.rejects(loadMeetingMinutes('p','m',controller.signal),/Forbidden/);
 globalThis.fetch=async()=>{setAuthTokens({accessToken:'synthetic-b'});return new Response(JSON.stringify({success:true,data:{id:'m',projectId:'p',minutes:{notes:'Notes'}}}));};
 await assert.rejects(loadMeetingMinutes('p','m',controller.signal),SessionChangedError);
 console.log('PASS MoM export fresh server data, access denial, identity validation, missing minutes and account switch');
 }finally{(globalThis as any).window=original.window;globalThis.fetch=original.fetch;}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
