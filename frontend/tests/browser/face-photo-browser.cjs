'use strict';
// Real app in Chrome; licensed image frames and synthetic API. MediaPipe inference is real.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createFixture } = require('./fixtures.cjs');
const { launch, pause } = require('./cdp.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback app only');
const output = path.resolve(__dirname, '../../../docs/face-verification-stage3');
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
  const runtime = await launch(fixture, origin), { cdp, traffic } = runtime, checks = [];
  const button = text => `[...document.querySelectorAll('main button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
  try {
    await cdp.viewport(1440); await cdp.navigate(origin + '/settings/face-verification');
    await cdp.wait("document.querySelector('#email')", 'anonymous redirect');
    assert.equal(await cdp.evaluate("document.querySelector('video')===null"), true);
    checks.push({ check: 'Anonymous route uses existing auth redirect; no camera UI', passed: true });
    await cdp.evaluate("(() => {for(const [s,v] of [['#email','sa@fixture.invalid'],['#password','SyntheticOnly!123']]){const e=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()");
    await cdp.click("document.querySelector('form button[type=submit]')"); await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'fixture SA');
    await cdp.navigate(origin + '/settings'); await cdp.wait("document.querySelector('a[href=\"/settings/face-verification\"]')", 'Settings link');
    await cdp.click("document.querySelector('a[href=\"/settings/face-verification\"]')"); await cdp.wait("document.querySelector('video')", 'actual camera page');
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
    const captureButton = () => `[...document.querySelectorAll('main button')].find(e=>['Capture photo','Ambil foto'].includes(e.textContent.trim()))`;
    async function staleFrame(count){
      await cdp.evaluate(`(() => {const v=document.querySelector('video'),held=v.currentTime;Object.defineProperty(v,'currentTime',{configurable:true,get:()=>held});})()`);
      await pause(300); // Any already-transferred preview frame is still the one-face fixture.
      await cdp.evaluate(`window.__cameraFixture.faces=${count};window.__cameraFixture.paint()`);
      await cdp.evaluate("new Promise(resolve=>document.querySelector('video').requestVideoFrameCallback(()=>resolve(true)))");
      assert(await cdp.evaluate(`Boolean(${detected(1)})`),'Preview still contains its genuinely older one-face inference');
      await cdp.click(captureButton());
      await cdp.wait(`document.querySelector('[data-photo-error="${count===0?'none':'multiple'}"]')`,'captured-frame rejection');
      assert.equal(await cdp.evaluate('!!document.querySelector("[data-photo-preview]")'),false);
      assert.equal(await cdp.evaluate('window.__cameraFixture.urls.length'),0);
      const actual=await cdp.evaluate('window.__cameraFixture.workers.at(-1).results.at(-1)');
      assert.equal(actual.count,count);assert.equal(actual.width,1280);assert.equal(actual.height,720);
      checks.push({check:`Fresh native captured frame with ${count} faces rejected despite previous one-face preview`,actual,passed:true});
      await cdp.evaluate("delete document.querySelector('video').currentTime;window.__cameraFixture.faces=1;window.__cameraFixture.paint()");
      await cdp.wait(detected(1),'video inference resumed');
    }
    await staleFrame(0);await staleFrame(2);
    // Two clicks in the same turn exercise the controller latch before React disables UI.
    await cdp.evaluate(`(() => {const b=(${captureButton()});b.click();b.click();})()`);
    await cdp.wait("document.querySelector('[data-photo-preview]') && [...document.querySelectorAll('[data-photo-image]')].every(i=>i.complete&&i.naturalWidth>0)",'valid photo/crop');
    assert(await cdp.evaluate("document.querySelector('video').srcObject===null&&window.__cameraFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))&&window.__cameraFixture.workers.every(w=>w.terminated)"));
    const photoMetric=await cdp.evaluate(`(() => {
      const full=document.querySelector('[data-photo-image=full]'),crop=document.querySelector('[data-photo-image=crop]'),r=window.__cameraFixture.workers.at(-1).results.at(-1),b=r.boxes[0];
      const x=Math.max(0,Math.floor(b.x-b.width*.2)),y=Math.max(0,Math.floor(b.y-b.height*.2)),right=Math.min(r.width,Math.ceil(b.x+b.width*1.2)),bottom=Math.min(r.height,Math.ceil(b.y+b.height*1.2));
      const a=document.createElement('canvas'),c=document.createElement('canvas');a.width=full.naturalWidth;a.height=full.naturalHeight;c.width=crop.naturalWidth;c.height=crop.naturalHeight;const ac=a.getContext('2d'),cc=c.getContext('2d');ac.drawImage(full,0,0);cc.drawImage(crop,0,0);
      const original=ac.getImageData(x,y,c.width,c.height).data,actual=cc.getImageData(0,0,c.width,c.height).data;let different=0;for(let i=0;i<actual.length;i++)if(actual[i]!==original[i])different++;
      const stats={full:[full.naturalWidth,full.naturalHeight],crop:[crop.naturalWidth,crop.naturalHeight],expected:[right-x,bottom-y],cropMatchesSameFrame:different===0,box:b,urls:window.__cameraFixture.urls.filter(e=>!e.revoked).length,transforms:[getComputedStyle(full).transform,getComputedStyle(crop).transform]};a.width=c.width=a.height=c.height=0;return stats;
    })()`);
    assert.deepEqual(photoMetric.full,[1280,720]);assert.deepEqual(photoMetric.crop,photoMetric.expected);assert(photoMetric.cropMatchesSameFrame);assert.equal(photoMetric.urls,2);
    assert(photoMetric.box.x<640);assert(photoMetric.transforms.every(t=>t==='matrix(-1, 0, 0, 1, 0, 0)'));
    checks.push({check:'One-face capture uses native 1280x720 frame, exact matching crop pixels with margin, display-only mirror, two URLs and automatic camera/worker stop; double click cannot duplicate',...photoMetric,passed:true});
    async function screenshot(width,lang,name){
      await cdp.viewport(width);await cdp.evaluate('window.scrollTo(0,0)');await pause(100);
      const metric=await cdp.evaluate("({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,images:[...document.querySelectorAll('[data-photo-image]')].map(i=>({right:i.getBoundingClientRect().right,width:i.getBoundingClientRect().width}))})");
      assert(metric.scroll<=metric.client&&metric.images.every(i=>i.right<=metric.client));checks.push({check:'Photo/crop layout has no overflow',viewport:width,language:lang,...metric,passed:true});await cdp.screenshot(path.join(output,name+'.png'));
    }
    await screenshot(1440,'en','photo-en-1440');
    await cdp.evaluate("(() => {const s=document.querySelector('select[aria-label]');s.value='id';s.dispatchEvent(new Event('change',{bubbles:true}));})()");await cdp.wait("document.documentElement.lang==='id'",'ID');
    assert.equal(await cdp.evaluate("window.__cameraFixture.urls.filter(e=>!e.revoked).length"),2,'Locale does not clear photo');
    await screenshot(390,'id','photo-id-390');await screenshot(360,'id','photo-id-360');
    await cdp.click("document.querySelector('main input[type=checkbox]')");
    assert(await cdp.evaluate("[...document.querySelectorAll('[data-photo-image]')].every(i=>getComputedStyle(i).transform==='none')"));
    checks.push({check:'Locale retains photo and mirror toggle changes display without re-encoding or allocating URLs',passed:true});
    await cdp.click(button('Hapus foto'));await cdp.wait("!document.querySelector('[data-photo-preview]')",'delete');
    assert(await cdp.evaluate('window.__cameraFixture.urls.every(e=>e.revoked)'));assert.equal(await cdp.evaluate("document.querySelector('video').srcObject"),null);
    checks.push({check:'Delete revokes both URLs and leaves camera off',passed:true});
    await cdp.click(button('Nyalakan kamera'));await cdp.wait(detected(1),'restart model',60000);await cdp.click(button('Ambil foto'));await cdp.wait("document.querySelector('[data-photo-preview]')",'second capture');
    await cdp.click(button('Ambil ulang'));await cdp.wait(detected(1),'retake resumes camera',60000);
    assert(!await cdp.evaluate("!!document.querySelector('[data-photo-preview]')"));assert(await cdp.evaluate('window.__cameraFixture.urls.every(e=>e.revoked)'));
    checks.push({check:'Retake clears/revokes photo and explicitly starts a fresh camera stream',passed:true});
    // Delay a real capture bitmap in the harness, then stop/unmount before it transfers.
    const gateCode=`(() => {const original=window.createImageBitmap;window.__bitmapGate={resolve:null};window.createImageBitmap=function(source,...rest){if(source instanceof HTMLCanvasElement){const pending=original(source,...rest);return new Promise((resolve,reject)=>{window.__bitmapGate.resolve=()=>{window.createImageBitmap=original;pending.then(resolve,reject);};});}return original(source,...rest);};})()`;
    await cdp.evaluate(gateCode);await cdp.click(button('Ambil foto'));await cdp.wait("window.__bitmapGate.resolve!==null",'capture gate');
    await cdp.click(button('Matikan kamera'));await cdp.evaluate('window.__bitmapGate.resolve()');await pause(300);
    assert(!await cdp.evaluate("!!document.querySelector('[data-photo-preview]')"));assert(await cdp.evaluate('window.__cameraFixture.workers.every(w=>w.terminated)'));
    checks.push({check:'Stop while bitmap capture is pending produces no photo and terminates loop',passed:true});
    await cdp.click(button('Nyalakan kamera'));await cdp.wait(detected(1),'restart after cancelled capture',60000);
    await cdp.click(button('Ambil foto'));await cdp.wait("document.querySelector('[data-photo-preview]')",'before route exit');
    await cdp.click(`document.querySelector('main a[href="/settings"]')`);await cdp.wait("document.querySelector('video')===null",'route exit');
    assert(await cdp.evaluate('window.__cameraFixture.urls.every(e=>e.revoked)'));
    checks.push({check:'Leaving page with a photo revokes both object URLs',passed:true});
    await cdp.click(`document.querySelector('a[href="/settings/face-verification"]')`);await cdp.wait("document.querySelector('video')",'return');
    await cdp.click(button('Nyalakan kamera'));await cdp.wait(detected(1),'before pending unmount',60000);
    await cdp.evaluate(gateCode);await cdp.click(button('Ambil foto'));await cdp.wait("window.__bitmapGate.resolve!==null",'unmount capture gate');
    await cdp.click(`document.querySelector('main a[href="/settings"]')`);await cdp.wait("document.querySelector('video')===null",'unmount pending capture');
    await cdp.evaluate('window.__bitmapGate.resolve()');await pause(200);
    assert(await cdp.evaluate('window.__cameraFixture.urls.every(e=>e.revoked)&&window.__cameraFixture.workers.every(w=>w.terminated)'));
    checks.push({check:'Capture completing after unmount creates no preview or URLs',passed:true});
    await cdp.click(`document.querySelector('a[href="/settings/face-verification"]')`);await cdp.wait("document.querySelector('video')",'return for logout');
    await cdp.click(button('Nyalakan kamera'));await cdp.wait(detected(1),'before logout capture',60000);await cdp.click(button('Ambil foto'));await cdp.wait("document.querySelector('[data-photo-preview]')",'before logout');
    await cdp.click(`document.querySelector('button[aria-label="Keluar"]')`);await cdp.wait("document.querySelector('#email')",'logout');
    assert(await cdp.evaluate('window.__cameraFixture.urls.every(e=>e.revoked)&&window.__cameraFixture.workers.every(w=>w.terminated)'));
    checks.push({check:'Actual AuthProvider logout revokes photo URLs and leaves no active worker/stream',passed:true});
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ browser: runtime.browser, checks,
      unknownRequests: fixture.state.unknown, runtimeErrors: traffic.errors, liveRequests: 0,
      limits: 'Real app/Chrome with synthetic API and getUserMedia replaced by canvas video. Real CPU/WASM FaceDetector model; licensed 1280x720 photo/blank frames via synthetic canvas stream. Stage 3 physical-camera capture not tested. No physical camera, OS permissions or real GoTrue/Storage tested.' }, null, 2) + '\n');
    await runtime.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
