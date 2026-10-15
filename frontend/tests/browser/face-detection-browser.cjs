'use strict';
// Real app in Chrome; licensed image frames and synthetic API. MediaPipe inference is real.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createFixture } = require('./fixtures.cjs');
const { launch, pause } = require('./cdp.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback app only');
const output = path.resolve(__dirname, '../../../docs/face-verification-stage2');
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
        state.canvas=canvas;state.paint=()=>{ctx.fillStyle='#eff6ff';ctx.fillRect(0,0,canvas.width,canvas.height);if(state.faces>=1)ctx.drawImage(photo,120,0,200,200,30,35,280,280);if(state.faces>=2)ctx.drawImage(photo,120,0,200,200,350,35,280,280);};
        state.paint();const interval=setInterval(state.paint,125);const stream=canvas.captureStream(8);
        stream.getTracks().forEach(t=>{const stop=t.stop.bind(t);t.stop=()=>{clearInterval(interval);stop();};});state.streams.push(stream);return stream;
      }});
    })()`);
    assert.equal(await cdp.evaluate("window.__cameraFixture.calls.length"), 0);
    assert.equal(await cdp.evaluate('window.__cameraFixture.workers.length'),0);
    assert(!traffic.allowed.some(r=>r.path.startsWith('/vendor/mediapipe/')||r.path==='/face-detection-worker.js'));
    checks.push({check:'Dashboard, Settings and idle camera page never load detector/model/WASM',passed:true});
    await cdp.click(button('Turn on camera')); await cdp.wait("document.querySelector('video').readyState>=2 && document.querySelector('main [role=status]').textContent.includes('Camera is on')", 'synthetic video playing');
    assert.deepEqual(await cdp.evaluate("window.__cameraFixture.calls"), [{ video: { facingMode: { ideal: 'user' } }, audio: false }]);
    checks.push({ check: 'Explicit click requests front-facing video without audio once and attaches a playing synthetic stream', passed: true });
    const detected = n => `document.querySelector('[data-face-status="ready"][data-face-count="${n}"]')`;
    await cdp.wait(detected(0), 'real model no-face inference',60000);
    checks.push({check:'Real BlazeFace inference on a blank video frame: zero faces',passed:true});
    await cdp.evaluate('window.__cameraFixture.faces=1;window.__cameraFixture.paint()');
    await cdp.wait(detected(1), 'real model one face');
    async function overlay(width,lang,name,mirrored=true,source=[640,360]){
      await cdp.viewport(width);await pause(250);
      const metric=await cdp.evaluate(`(() => {const v=document.querySelector('video'),svg=document.querySelector('[data-face-overlay]'),rect=svg.querySelector('rect'),vbox=v.getBoundingClientRect(),sbox=svg.getBoundingClientRect();return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,videoRight:vbox.right,overlayRight:sbox.right,videoTransform:getComputedStyle(v).transform,overlayTransform:getComputedStyle(svg).transform,viewBox:svg.getAttribute('viewBox'),preserve:svg.getAttribute('preserveAspectRatio'),box:{x:+rect.getAttribute('x'),y:+rect.getAttribute('y'),width:+rect.getAttribute('width'),height:+rect.getAttribute('height')},count:svg.querySelectorAll('rect').length,coordinateError:(()=>{const point=svg.createSVGPoint();point.x=+rect.getAttribute('x');point.y=+rect.getAttribute('y');const actual=point.matrixTransform(svg.getScreenCTM());const scale=Math.min(vbox.width/v.videoWidth,vbox.height/v.videoHeight),left=vbox.left+(vbox.width-v.videoWidth*scale)/2,top=vbox.top+(vbox.height-v.videoHeight*scale)/2,mirror=getComputedStyle(v).transform!=='none';const x=left+(mirror?v.videoWidth-point.x:point.x)*scale,y=top+point.y*scale;return Math.max(Math.abs(actual.x-x),Math.abs(actual.y-y));})()};})()`);
      assert(metric.scrollWidth<=metric.clientWidth&&metric.videoRight<=metric.clientWidth&&metric.overlayRight<=metric.clientWidth);
      assert.equal(metric.videoTransform,metric.overlayTransform);assert.equal(metric.viewBox,`0 0 ${source[0]} ${source[1]}`);assert.equal(metric.preserve,'xMidYMid meet');
      assert(metric.coordinateError<1,'SVG matches object-contain + mirror mapping within one pixel');assert.equal(metric.count,1);assert(metric.box.x<320,'Fixture face is on the left in source coordinates');
      assert.equal(metric.videoTransform,mirrored?'matrix(-1, 0, 0, 1, 0, 0)':'none');
      checks.push({check:'Real overlay: contained preview/SVG coordinates and identical mirror transform',viewport:width,language:lang,mirrored,...metric,passed:true});
      await cdp.screenshot(path.join(output,name+'.png'));
    }
    await overlay(1440,'en','one-face-en-1440');
    await cdp.click("document.querySelector('main input[type=checkbox]')");await overlay(1440,'en','one-face-unmirrored-en-1440',false);
    await cdp.click("document.querySelector('main input[type=checkbox]')");
    await cdp.evaluate("(() => {const s=document.querySelector('select[aria-label]');s.value='id';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await cdp.wait("document.documentElement.lang==='id'",'locale');
    await overlay(390,'id','one-face-id-390');await overlay(360,'id','one-face-id-360');
    // Actual portrait-resolution video exercises letterboxing, not only viewport resizing.
    await cdp.evaluate('window.__cameraFixture.canvas.width=480;window.__cameraFixture.canvas.height=640;window.__cameraFixture.paint()');
    await cdp.wait("document.querySelector('[data-face-overlay]')?.getAttribute('viewBox')==='0 0 480 640'",'portrait source resolution');
    await overlay(360,'id','portrait-source-id-360',true,[480,640]);
    await cdp.evaluate('window.__cameraFixture.canvas.width=640;window.__cameraFixture.canvas.height=360;window.__cameraFixture.paint()');
    await cdp.wait("document.querySelector('[data-face-overlay]')?.getAttribute('viewBox')==='0 0 640 360'",'landscape restored');
    assert.equal(await cdp.evaluate('window.__cameraFixture.calls.length'),1);
    assert.equal(await cdp.evaluate('window.__cameraFixture.workers.length'),1,'Locale/resize never restarts the model');
    await cdp.evaluate('window.__cameraFixture.faces=2;window.__cameraFixture.paint()');await cdp.wait(detected(2),'real model two faces');
    assert(await cdp.evaluate("document.querySelector('[data-face-status]').textContent.includes('Lebih dari satu')"));
    await cdp.screenshot(path.join(output,'two-faces-id-360.png'));
    checks.push({check:'Real inference on two copies of the licensed photo returns two boxes and multiple-face warning',passed:true});
    const realMetrics=await cdp.evaluate('window.__cameraFixture.workers.map(w=>({frames:w.frames,maxInFlight:w.maxInFlight,last:w.results.at(-1)}))');
    assert(realMetrics.every(w=>w.maxInFlight===1));checks.push({check:'No frame queue: one frame in flight throughout real inference',metrics:realMetrics,passed:true});
    await cdp.click(button('Matikan kamera'));await cdp.wait("document.querySelector('video').srcObject===null",'stop');
    assert(await cdp.evaluate("window.__cameraFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))&&window.__cameraFixture.workers.every(w=>w.terminated)&&!document.querySelector('[data-face-overlay]')"));
    const sent=await cdp.evaluate('window.__cameraFixture.workers[0].frames');await pause(400);assert.equal(await cdp.evaluate('window.__cameraFixture.workers[0].frames'),sent);
    checks.push({check:'Stop clears overlay, ends tracks and terminates worker; no further frames',passed:true});
    await cdp.evaluate('window.__cameraFixture.faces=1');await cdp.click(button('Nyalakan kamera'));await cdp.wait(detected(1),'restart real model',60000);
    checks.push({check:'Restart creates a fresh worker on the new camera stream and performs real inference',passed:true});
    // Fault injection only in the harness: real package/WASM, model fetch returns 503.
    await cdp.click(button('Matikan kamera'));
    const workerSource = (await fs.readFile(path.resolve(__dirname,'../../public/face-detection-worker.js'),'utf8'))
      .replace('importScripts("/vendor/', 'importScripts("'+origin+'/vendor/');
    const faultSource = `const originalFetch=self.fetch.bind(self);self.fetch=(resource,...args)=>{if(String(resource).endsWith('.tflite')){self.postMessage({type:'fixture-model-blocked'});return Promise.resolve(new Response('',{status:503}));}return originalFetch(resource,...args);};\n` + workerSource;
    await cdp.evaluate(`(() => {const Working=window.Worker,source=${JSON.stringify(faultSource)};window.__restoreWorker=()=>{window.Worker=Working;};window.Worker=function(){const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const worker=new Working(url);URL.revokeObjectURL(url);return worker;};})()`);
    await cdp.click(button('Nyalakan kamera'));await cdp.wait("document.querySelector('[data-face-status="+JSON.stringify('error')+"]')",'worker failure');
    assert.equal(await cdp.evaluate("document.querySelector('main').textContent.includes('Synthetic startup failure')"),false);
    await cdp.screenshot(path.join(output,'detection-failed-id-360.png'));
    assert(await cdp.evaluate('window.__cameraFixture.workers.at(-1).modelBlocked'),'Failure reached the real model fetch');
    const calls=await cdp.evaluate('window.__cameraFixture.calls.length');await cdp.evaluate('window.__restoreWorker()');
    await cdp.click(button('Coba deteksi lagi'));await cdp.wait(detected(1),'retry model without camera request',60000);
    assert.equal(await cdp.evaluate('window.__cameraFixture.calls.length'),calls);
    checks.push({check:'Actual model fetch 503 is safe/localized; retry performs real inference on the same stream',passed:true});
    await cdp.click(`document.querySelector('main a[href="/settings"]')`);await cdp.wait("document.querySelector('video')===null",'route left');
    assert(await cdp.evaluate("window.__cameraFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))&&window.__cameraFixture.workers.every(w=>w.terminated)"));
    checks.push({check:'SPA navigation stops stream and terminates model worker',passed:true});
    await cdp.click(`document.querySelector('a[href="/settings/face-verification"]')`);await cdp.wait("document.querySelector('video')",'return');
    await cdp.click(button('Nyalakan kamera'));await cdp.wait(detected(1),'before logout',60000);
    await cdp.click(`document.querySelector('button[aria-label="Keluar"]')`);await cdp.wait("document.querySelector('#email')",'logout');
    assert(await cdp.evaluate("window.__cameraFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))&&window.__cameraFixture.workers.every(w=>w.terminated)"));
    checks.push({check:'Actual auth-provider logout releases stream and worker',passed:true});
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ browser: runtime.browser, checks,
      unknownRequests: fixture.state.unknown, runtimeErrors: traffic.errors, liveRequests: 0,
      limits: 'Real app/Chrome with synthetic API and getUserMedia replaced by canvas video. Real CPU/WASM FaceDetector model; licensed photo/blank frames via synthetic canvas stream. No physical camera, OS permissions or real GoTrue/Storage tested.' }, null, 2) + '\n');
    await runtime.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
