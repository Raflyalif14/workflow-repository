import assert from 'node:assert/strict';
import { captureFaceBurst, validPassiveResult } from './face-passive-test';
export async function testBurst() {
  const original={document:globalThis.document,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,performance:Object.getOwnPropertyDescriptor(globalThis,'performance')};
  let now=0, id=0, photos=0, updating=true, delayed:((value:Blob)=>void)|null=null;
  const timers=new Map<number,{at:number;fn:()=>void}>(), page=Object.assign(new EventTarget(),{visibilityState:'visible'});
  (globalThis as any).document=page;
  (globalThis as any).setTimeout=(fn:()=>void,ms=0)=>{const key=++id;timers.set(key,{at:now+ms,fn});return key;};
  (globalThis as any).clearTimeout=(key:number)=>timers.delete(key);
  Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
  const video={readyState:2,paused:false,get currentTime(){return updating?now/1000:0;}} as HTMLVideoElement;
  const capture=async()=>{photos++;return delayed ? new Promise<Blob>(resolve=>{delayed=resolve;}) : new Blob([String(photos)]);};
  const advance=async(ms:number)=>{
    const end=now+ms;
    while(true){const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
      now=next[1].at;timers.delete(next[0]);next[1].fn();await new Promise(r=>setImmediate(r));}
    now=end;await new Promise(r=>setImmediate(r));
  };
  try {
    const run=captureFaceBurst(video,new AbortController().signal,capture);
    await advance(999);assert.equal(photos,0);await advance(701);
    assert.equal((await run).length,3);assert.equal(photos,3);assert.equal(timers.size,0);
    updating=false;const stalled=assert.rejects(captureFaceBurst(video,new AbortController().signal,capture),/FACE_SCAN_INTERRUPTED/);
    await advance(8000);await stalled;assert.equal(photos,3);
    updating=true;const hidden=assert.rejects(captureFaceBurst(video,new AbortController().signal,capture),/FACE_SCAN_INTERRUPTED/);
    await advance(1000);page.visibilityState='hidden';page.dispatchEvent(new Event('visibilitychange'));await hidden;
    const before=photos;await advance(5000);assert.equal(photos,before);assert.equal(timers.size,0);
    page.visibilityState='visible';delayed=()=>{};const abort=new AbortController();
    const cancelled=assert.rejects(captureFaceBurst(video,abort.signal,capture),/FACE_SCAN_INTERRUPTED/);
    await advance(1000);abort.abort();await cancelled;(delayed as any)(new Blob(['late']));delayed=null;await advance(5000);assert.equal(timers.size,0);
    const alreadyAborted=new AbortController();alreadyAborted.abort();
    await assert.rejects(captureFaceBurst(video,alreadyAborted.signal,capture),/FACE_SCAN_INTERRUPTED/);assert.equal(timers.size,0);
    assert.equal(validPassiveResult({accepted:true,accessToken:'not-a-test'},'live'),false);
    console.log('Passive capture PASS: fresh spaced frames from one scan, no early capture, freeze timeout, hidden tab and abort discard, no pending timers. Video/clock mocked.');
  } finally {
    (globalThis as any).document=original.document;globalThis.setTimeout=original.setTimeout;globalThis.clearTimeout=original.clearTimeout;
    if(original.performance)Object.defineProperty(globalThis,'performance',original.performance);
  }
}
