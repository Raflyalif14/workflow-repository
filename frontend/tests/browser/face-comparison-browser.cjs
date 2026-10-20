'use strict';
// Real app in Chrome; licensed image frames and synthetic API. MediaPipe inference is real.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createFixture } = require('./fixtures.cjs');
const { launch, pause } = require('./cdp.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback app only');
const output = path.resolve(__dirname, '../../../docs/face-verification-stage4');
async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = createFixture(), respond = fixture.respond;
  fixture.respond = (url, method, body) => {
    if (new URL(url).pathname.replace(/^\/api/, "") === "/face-experiment/capabilities" && method === "GET")
      return { status: 200, body: { success: true, data: { enabled: false } } };
    if (new URL(url).pathname.replace(/^\/api/, '') === '/notifications/preferences' && method === 'GET')
      return { status: 200, body: { success: true, data: { in_app_enabled: true, telegram_enabled: false, telegram_linked: false } } };
    return respond(url, method, body);
  };
  const local=await require('../../../backend/tests/face-experiment-fixture.cjs').startFixture();
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime, checks = [];
  const old=cdp.listeners.get('Fetch.requestPaused')[0];cdp.listeners.set('Fetch.requestPaused',[]);
  cdp.on('Fetch.requestPaused',async event=>{
    const u=new URL(event.request.url);
    if(u.pathname.startsWith('/api/face-experiment/')) {
      // Rewrite only these requests to an owned Node/Python fixture; never allow the user's backend.
      await cdp.send('Fetch.continueRequest',{requestId:event.requestId,url:local.origin+u.pathname+u.search,headers:Object.entries(event.request.headers).map(([name,value])=>({name,value}))});
      return;
    }
    await old(event);
  });
  const button = text => `[...document.querySelectorAll('main button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
  try {
    await cdp.viewport(1440); await cdp.navigate(origin + '/settings/face-verification');
    await cdp.wait("document.querySelector('#email')", 'anonymous redirect');
    assert.equal(await cdp.evaluate("document.querySelector('video')===null"), true);
    checks.push({ check: 'Anonymous route uses existing auth redirect; no camera UI', passed: true });
    await cdp.evaluate("(() => {for(const [s,v] of [['#email','sa@fixture.invalid'],['#password','SyntheticOnly!123']]){const e=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()");
    await cdp.click("document.querySelector('form button[type=submit]')"); await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'fixture SA');
    await cdp.navigate(origin + '/settings'); await cdp.wait("document.querySelector('a[href=\"/settings/face-verification\"]')", 'Settings link');
    await cdp.evaluate("document.fonts.ready.then(()=>true)");await cdp.evaluate("document.querySelector('a[href=\"/settings/face-verification\"]').focus()");await cdp.key("Enter","Enter",13); try { await cdp.wait("document.querySelector('video')", 'actual camera page',60000); } catch(error) { const safe=await cdp.evaluate("({path:location.pathname,title:document.title,headings:[...document.querySelectorAll('h1,h2')].map(e=>e.textContent.slice(0,120))})");throw Error(error.message+' '+JSON.stringify(safe)+' '+JSON.stringify(local.traffic)); }
    const image = (await fs.readFile(path.resolve(__dirname, '../fixtures/face-detection/astronaut.png'))).toString('base64');
    await cdp.evaluate(`(async () => {
      const photo=new Image();photo.src='data:image/png;base64,${image}';await photo.decode();
      const state=window.__cameraFixture={calls:[],streams:[],mode:'ready',faces:0,workers:[],paint:null};
      const makeURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
      state.urls=[];URL.createObjectURL=blob=>{const url=makeURL(blob);state.urls.push({url,revoked:false});return url;};
      URL.revokeObjectURL=url=>{const entry=state.urls.find(e=>e.url===url);if(entry)entry.revoked=true;revokeURL(url);};
      const OriginalWorker=window.Worker;
      window.Worker=function(...args){
        const w=new OriginalWorker(...args),entry={frames:0,inFlight:0,maxInFlight:0,terminated:false,results:[]};state.workers.push(entry);
        const post=w.postMessage.bind(w),terminate=w.terminate.bind(w);
        w.postMessage=(message,...rest)=>{if(message.type==='frame'){entry.frames++;entry.inFlight++;entry.maxInFlight=Math.max(entry.maxInFlight,entry.inFlight);}return post(message,...rest);};
        w.terminate=()=>{entry.terminated=true;return terminate();};
        w.addEventListener('message',event=>{if(event.data.type==='result'){entry.inFlight--;entry.results.push({count:event.data.boxes.length,boxes:event.data.boxes,width:event.data.width,height:event.data.height});}else if(event.data.type==='error'){entry.error=true;}else if(event.data.type==='fixture-model-blocked'){entry.modelBlocked=true;}});
        return w;
      };
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async constraints=>{
        state.calls.push(constraints);
        const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');
        state.canvas=canvas;canvas.width=1280;canvas.height=720;state.paint=()=>{const scale=canvas.width/640;ctx.fillStyle='#eff6ff';ctx.fillRect(0,0,canvas.width,canvas.height);if(state.faces>=1)ctx.drawImage(photo,120,0,200,200,30*scale,35*scale,280*scale,280*scale);if(state.faces>=2)ctx.drawImage(photo,120,0,200,200,350*scale,35*scale,280*scale,280*scale);};
        state.paint();const interval=setInterval(state.paint,125);const stream=canvas.captureStream(8);
        stream.getTracks().forEach(t=>{const stop=t.stop.bind(t);t.stop=()=>{clearInterval(interval);stop();};});state.streams.push(stream);return stream;
      }});
    })()`);
    assert.equal(await cdp.evaluate("window.__cameraFixture.calls.length"), 0);
    assert.equal(await cdp.evaluate('window.__cameraFixture.workers.length'),0);
    assert(!traffic.allowed.some(r=>r.path.startsWith('/vendor/mediapipe/')||r.path==='/face-detection-worker.js'));
    checks.push({check:'Dashboard, Settings and idle camera page never load detector/model/WASM',passed:true});
    assert(await cdp.evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='Capture photo').disabled"));
    await cdp.click(button('Turn on camera')); await cdp.wait("document.querySelector('video').readyState>=2 && document.querySelector('main [role=status]').textContent.includes('Camera is on')", 'synthetic video playing');
    assert.deepEqual(await cdp.evaluate("window.__cameraFixture.calls"), [{ video: { facingMode: { ideal: 'user' } }, audio: false }]);
    checks.push({ check: 'Explicit click requests front-facing video without audio once and attaches a playing synthetic stream', passed: true });
    const detected = n => `document.querySelector('[data-face-status="ready"][data-face-count="${n}"]')`;
    await cdp.wait(detected(0), 'real model no-face inference',60000);
    checks.push({check:'Real BlazeFace inference on a blank video frame: zero faces',passed:true});
    await cdp.evaluate('window.__cameraFixture.faces=1;window.__cameraFixture.paint()');
    await cdp.wait(detected(1), 'real model one face');
    await cdp.click(button('Capture photo'));await cdp.wait("document.querySelector('[data-face-slot=A]')",'Photo A');
    assert(await cdp.evaluate('window.__cameraFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));
    await cdp.click(button('Photo B'));await cdp.click(button('Turn on camera'));await cdp.wait(detected(1),'Photo B camera',60000);
    await cdp.click(button('Capture photo'));await cdp.wait("document.querySelector('[data-face-slot=B]')",'Photo B');
    assert.equal(await cdp.evaluate('window.__cameraFixture.urls.filter(e=>!e.revoked).length'),4);
    assert(await cdp.evaluate(`${button('Compare')}.disabled`),'Consent required before sending');
    await cdp.evaluate("(() => { for (const [key,value] of Object.entries({participantA:'P01',participantB:'P01',sessionA:'S01',sessionB:'S02',truth:'SAME',sourceA:'LIVE',sourceB:'LIVE',condition:'NORMAL'})) { const e=document.querySelector('#trial-'+key); Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,value); e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true})); } })()");
    await cdp.click("[...document.querySelectorAll('main input[type=checkbox]')].at(-1)");
    await cdp.click(button('Compare'));await cdp.wait("document.querySelector('[data-comparison-result]')",'real Node/Python inference',30000);
    const score=await cdp.evaluate("document.querySelector('[data-comparison-result]').textContent");
    assert(score.includes('1.0000'),'Identical captured fixture is only a sanity check');assert(!score.includes('%'));
    checks.push({check:'Two real camera-pipeline captures sent via real authenticated Node route to real Python SFace; identical-photo sanity score, not recognition evidence',passed:true});
    async function inspect(width,lang,name){
      await cdp.viewport(width);await cdp.evaluate('window.scrollTo(0,0)');await pause(100);
      const metric=await cdp.evaluate("({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})");
      assert(metric.scroll<=metric.client);checks.push({check:'A/B comparison layout without page overflow',viewport:width,language:lang,...metric,passed:true});await cdp.screenshot(path.join(output,name+'.png'));
    }
    await inspect(1440,'en','comparison-en-1440');
    await cdp.evaluate("(() => {const s=document.querySelector('select[aria-label]');s.value='id';s.dispatchEvent(new Event('change',{bubbles:true}));})()");await cdp.wait("document.documentElement.lang==='id'",'ID');
    assert(await cdp.evaluate("document.querySelector('[data-comparison-result]').textContent.includes('Skor kemiripan eksperimen')"));
    assert.equal(await cdp.evaluate('window.__cameraFixture.urls.filter(e=>!e.revoked).length'),4);
    await inspect(390,'id','comparison-id-390');await inspect(360,'id','comparison-id-360');
    checks.push({check:'Locale retains both photos, consent and result',passed:true});
    await cdp.click(`[...document.querySelectorAll('main button')].find(e=>e.textContent.trim()==='Hapus foto')`);
    await cdp.wait("!document.querySelector('[data-comparison-result]')&&!document.querySelector('[data-face-slot=A]')",'deleting A invalidates result');
    assert(await cdp.evaluate("!!document.querySelector('[data-face-slot=B]')"));assert.equal(await cdp.evaluate('window.__cameraFixture.urls.filter(e=>!e.revoked).length'),2);
    checks.push({check:'Delete A revokes its URLs, invalidates result/consent and preserves B',passed:true});
    await cdp.click(button('Foto A'));await cdp.click(button('Nyalakan kamera'));await cdp.wait(detected(1),'recapture A',60000);await cdp.click(button('Ambil foto'));await cdp.wait("document.querySelector('[data-face-slot=A]')",'recaptured A');
    await local.stopPython();await cdp.click("[...document.querySelectorAll('main input[type=checkbox]')].at(-1)");await cdp.click(button('Bandingkan'));
    await cdp.wait("[...document.querySelectorAll('main [role=alert]')].some(e=>e.textContent.includes('layanan')||e.textContent.includes('Layanan'))",'dead service localized error');
    assert(!await cdp.evaluate("!!document.querySelector('[data-comparison-result]')"));assert.equal(await cdp.evaluate('window.__cameraFixture.urls.filter(e=>!e.revoked).length'),4);
    checks.push({check:'Dead real Python service produces safe localized error, no score and retains A/B for retry',passed:true});
    await cdp.screenshot(path.join(output,'service-error-id-360.png'));
    await cdp.click(`document.querySelector('button[aria-label="Keluar"]')`);await cdp.wait("document.querySelector('#email')",'logout');
    assert(await cdp.evaluate('window.__cameraFixture.urls.every(e=>e.revoked)&&window.__cameraFixture.workers.every(w=>w.terminated)'));
    checks.push({check:'Logout releases both slots and all camera/model resources',passed:true});
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ browser: runtime.browser, checks,
      localApiRequests: local.traffic, unknownRequests: fixture.state.unknown, runtimeErrors: traffic.errors, liveRequests: 0,
      limits: 'Real app/Chrome with synthetic API and getUserMedia replaced by canvas video. Real CPU/WASM FaceDetector model; licensed 1280x720 photo/blank frames via synthetic canvas stream. Stage 4 Node authentication uses synthetic provider/profile, Python model is real; fixture captures here are identical sanity only. Separate Python/HTTP tests cover different photos of same and different people. Physical camera stage 4 not tested. No physical camera, OS permissions or real GoTrue/Storage tested.' }, null, 2) + '\n');
    await runtime.cleanup();await local.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
