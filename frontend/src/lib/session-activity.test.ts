import assert from 'node:assert/strict';
import { SESSION_ACTIVITY_KEY, SESSION_IDLE_MS, startSessionActivity } from './session-activity';

const original={window:globalThis.window,document:globalThis.document,interval:globalThis.setInterval,clear:globalThis.clearInterval};
const win=new EventTarget(), doc=Object.assign(new EventTarget(),{visibilityState:'visible'});
const store=new Map<string,string>(), ticks=new Map<number,()=>void>(); let timer=0, now=1000, expired=0, pings=0, current='session-a';
(globalThis as any).window=Object.assign(win,{localStorage:{getItem:(k:string)=>store.get(k)||null,setItem:(k:string,v:string)=>store.set(k,v)}});
(globalThis as any).document=doc;
(globalThis as any).setInterval=(callback:()=>void)=>{ticks.set(++timer,callback);return timer;};
(globalThis as any).clearInterval=(id:number)=>ticks.delete(id);
const tick=()=>[...ticks.values()].forEach(fn=>fn());
const opts=()=>({sessionId:current,isCurrent:()=>current==='session-a',onExpired:()=>expired++,keepAlive:async()=>{pings++;},now:()=>now});
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
let stop=()=>{};
async function main(){
 try {
  stop=startSessionActivity(opts()); await settle(); assert.equal(pings,1);
  for(const event of ['pointerdown','pointermove','keydown','input','scroll','touchstart']) {
   now+=SESSION_IDLE_MS-1000; win.dispatchEvent(new Event(event)); await settle(); tick();
   assert.equal(expired,0,`${event} resets the idle deadline`);
  }
  now+=SESSION_IDLE_MS-1;tick();assert.equal(expired,0);
  now++;tick();assert.equal(expired,1);win.dispatchEvent(new Event('pointerdown'));tick();assert.equal(expired,1,'Expired session cannot be revived');
  stop();assert.equal(ticks.size,0);
  store.clear(); expired=0; now+=1000;stop=startSessionActivity(opts());await settle();
  now+=SESSION_IDLE_MS-1000;
  // Another tab writes activity for this same session.
  store.set(SESSION_ACTIVITY_KEY,JSON.stringify({sessionId:current,at:now}));tick();
  now+=2000;tick();assert.equal(expired,0,'Activity in another tab extends the same session');
  stop(); const saved=JSON.parse(store.get(SESSION_ACTIVITY_KEY)!);
  now=saved.at+SESSION_IDLE_MS;stop=startSessionActivity(opts());assert.equal(expired,1,'Reload must not reset an already idle session');stop();
  store.clear();now+=1000;expired=0;stop=startSessionActivity(opts());await settle();
  const baseline=pings;now+=SESSION_IDLE_MS;doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));tick();
  assert.equal(expired,1,'Timer detects expiration after background/sleep');assert.equal(pings,baseline);stop();
  store.clear();now+=1000;expired=0;doc.visibilityState='visible';stop=startSessionActivity(opts());await settle();
  current='session-b';now+=SESSION_IDLE_MS;win.dispatchEvent(new Event('keydown'));tick();assert.equal(expired,0,'An old timer cannot end a new account session');stop();
  current='session-a';store.clear();now+=1000;pings=0;stop=startSessionActivity(opts());await settle();
  for(let i=0;i<100;i++)win.dispatchEvent(new Event('pointermove'));await settle();assert.equal(pings,1,'Frequent interactions do not flood keep-alive');
  now+=5*60_000;win.dispatchEvent(new Event('pointerdown'));await settle();assert.equal(pings,2,'Recent activity refreshes verification periodically');stop();
  console.log('PASS sliding activity timeout, shared tabs, reload/sleep expiry, no revival, account isolation and throttled keep-alive');
 }finally{stop();globalThis.setInterval=original.interval;globalThis.clearInterval=original.clear;(globalThis as any).window=original.window;(globalThis as any).document=original.document;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
