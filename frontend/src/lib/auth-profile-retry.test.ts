import assert from 'node:assert/strict';
import { loadVerifiedProfileWithRetry } from './auth-profile';
import { clearStoredAuth, getAuthSession, setAuthTokens } from './auth';

const storage = new Map<string,string>(), events = new EventTarget();
const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
(globalThis as any).window = { localStorage: { getItem:(key:string)=>storage.get(key)||null,
  setItem:(key:string,value:string)=>storage.set(key,value), removeItem:(key:string)=>storage.delete(key) },
  addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events) };
const seed = () => { setAuthTokens({accessToken:'fixture-access',refreshToken:'fixture-refresh'}); return getAuthSession()!; };
async function main() {
  try {
    let calls=0; const delays:number[]=[];
    globalThis.fetch=async()=>{ calls++; return new Response('{}',{status:503}); };
    const failed=await loadVerifiedProfileWithRetry(seed(),()=>true,async ms=>{delays.push(ms);});
    assert.equal(failed.kind,'temporary'); assert.equal(calls,3); assert.deepEqual(delays,[750,1500]);
    calls=0; delays.length=0;
    const stale=await loadVerifiedProfileWithRetry(seed(),()=>true,async()=>{
      setAuthTokens({accessToken:'new-account-access',refreshToken:'new-account-refresh'});
    });
    assert.equal(stale.kind,'stale'); assert.equal(calls,1);
    assert.equal(getAuthSession()?.accessToken,'new-account-access','Old retry cannot clear the new session');
    calls=0; globalThis.fetch=async()=>{calls++;return new Response('{}',{status:403});};
    assert.equal((await loadVerifiedProfileWithRetry(seed(),()=>true,async()=>{throw Error('Forbidden must not retry');})).kind,'forbidden');
    assert.equal(calls,1);
    calls=0;
    assert.equal((await loadVerifiedProfileWithRetry(seed(),()=>false,async()=>{})).kind,'stale'); assert.equal(calls,0);
    console.log('PASS bounded temporary retries, forbidden without retry, cancellation and account-switch safety');
  } finally { clearStoredAuth(); globalThis.fetch=oldFetch; (globalThis as any).window=oldWindow; }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
