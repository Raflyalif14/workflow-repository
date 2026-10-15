'use strict';
// Actual app/Chrome/PNG cropping; synthetic camera, auth and PAD API. No PAD inference.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createFixture } = require('./fixtures.cjs'), { launch, pause } = require('./cdp.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Loopback only');
const output = path.resolve(__dirname, '../../../docs/face-verification-stage9k');
const geometry = { version: 'pad-geometry-v1', frame: { width: 640, height: 480 }, faceCount: 1,
  bbox: { x: 140, y: 100, width: 360, height: 260, confidence: .95 },
  cropBeforeClip: { left: 104, top: 14, right: 536, bottom: 446 }, cropAfterClip: { left: 104, top: 14, right: 536, bottom: 446 },
  roi: { width: 432, height: 432 }, clipped: { left: false, top: false, right: false, bottom: false } };
const provenance = { model: 'anti-spoof-mn3', modelSha256: 'c4c99af04603b62d7e44f6f4daeb33e0daeccc696008c0b1d62f6f5cebbb3262',
  detector: 'yunet-2023mar', detectorSha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
  cropVersion: 'yunet-max-side-square-context-1.2-clip-v1', preprocessingVersion: 'mn3-original-onnx-rgb-cubic-128-v1', runtimeVersion: '4.13.0', pythonVersion: '3.10.0' };
async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = createFixture(), base = fixture.respond, checks = [], requests = [];
  fixture.respond = (url, method, body) => {
    const p = new URL(url).pathname.replace(/^\/api/, '');
    if (method === 'OPTIONS') return base(url, method, body);
    if (p === '/face-pad/capabilities') return { status: 200, body: { success: true, data: { enabled: true } } };
    if (p === '/face-experiment/capabilities') return { status: 200, body: { success: true, data: { enabled: false } } };
    if (p === '/notifications/preferences') return { status: 200, body: { success: true, data: { in_app_enabled: true, telegram_enabled: false, telegram_linked: false } } };
    return base(url, method, body);
  };
  let runtime, fault = null;
  try {
    runtime = await launch(fixture, origin); const { cdp, traffic } = runtime;
    const old = cdp.listeners.get('Fetch.requestPaused')[0]; cdp.listeners.set('Fetch.requestPaused', []);
    cdp.on('Fetch.requestPaused', async event => {
      const url = new URL(event.request.url);
      if (url.pathname === '/api/face-pad/inspect' && event.request.method === 'POST') {
        const field = name => event.request.postData?.match(new RegExp('name="' + name + '"\\r?\\n\\r?\\n([^\\r\\n]+)'))?.[1];
        const requestId = field('requestId'), slot = field('slot');
        assert(requestId && ['A', 'B'].includes(slot), 'Fixture requires real multipart request/slot');
        const imageSha256 = await cdp.evaluate(`(async()=>{const url=document.querySelector('img[data-face-slot=${slot}]').src;const blob=window.__roiFixture.blobs.get(url);if(!blob)throw Error('Full capture unavailable');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');})()`);
        requests.push({ operation: 'PAD inspect', slot, fault });
        const diagnostics = fault === 'dimensions' ? { ...geometry, frame: { width: 641, height: 480 } } : geometry;
        const body = fault === 'error' ? { success: false, errors: { code: 'FACE_NONE', requestId, slot, diagnostics: { ...geometry, faceCount: 0, bbox: null, cropBeforeClip: null, cropAfterClip: null, roi: null, clipped: null } } }
          : { success: true, data: { status: 'SUCCESS', reason: null, prediction: null, requestId, slot,
            probabilities: { real: .2, spoof: .8 }, imageSha256: fault === 'checksum' ? 'b'.repeat(64) : imageSha256,
            processedAt: '2026-10-13T00:00:00Z', durationMs: 1, provenance, diagnostics } };
        await cdp.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: fault === 'error' ? 422 : 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Credentials', value: 'true' }],
          body: Buffer.from(JSON.stringify(body)).toString('base64') }); return;
      }
      await old(event);
    });
    const button = text => `[...document.querySelectorAll('main button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
    const field = async (selector, value) => { await cdp.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); await pause(30); };
    await cdp.navigate(origin + '/settings/face-verification'); await cdp.wait("document.querySelector('#email')", 'existing auth redirect');
    await field('#email', 'sa@fixture.invalid'); await field('#password', 'SyntheticOnly!123');
    await cdp.click("document.querySelector('form button[type=submit]')"); await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'fixture login');
    await cdp.navigate(origin + '/settings/face-verification'); await cdp.wait("document.querySelector('[data-pad-panel]')", 'actual PAD page');
    await cdp.evaluate(`(()=>{
      const nativeCreate=URL.createObjectURL.bind(URL),nativeRevoke=URL.revokeObjectURL.bind(URL),nativeBitmap=window.createImageBitmap.bind(window);
      window.__roiFixture={blobs:new Map(),revoked:[],streams:[],bitmapCreated:0,bitmapClosed:0};
      URL.createObjectURL=blob=>{const url=nativeCreate(blob);window.__roiFixture.blobs.set(url,blob);return url;};
      URL.revokeObjectURL=url=>{window.__roiFixture.revoked.push(url);window.__roiFixture.blobs.delete(url);nativeRevoke(url);};
      window.createImageBitmap=async(...args)=>{const image=await nativeBitmap(...args),close=image.close.bind(image);window.__roiFixture.bitmapCreated++;let closed=false;image.close=()=>{if(!closed){closed=true;window.__roiFixture.bitmapClosed++;}close();};return image;};
      window.Worker=class{postMessage(m){if(m.type==='init')setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),0);if(m.type==='frame'){const width=m.bitmap.width,height=m.bitmap.height;m.bitmap.close();setTimeout(()=>this.onmessage?.({data:{type:'result',requestId:m.requestId,width,height,boxes:[{x:80,y:60,width:40,height:60,confidence:.99}]}}),0);}}terminate(){this.onmessage=null;}};
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
        const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d'),image=ctx.createImageData(640,480);
        for(let y=0;y<480;y++)for(let x=0;x<640;x++){const i=(y*640+x)*4;image.data[i]=x%256;image.data[i+1]=y%256;image.data[i+2]=(x+3*y)%256;image.data[i+3]=255;}ctx.putImageData(image,0,0);
        const s=c.captureStream(8);window.__roiFixture.streams.push(s);return s;
      }});
    })()`);
    await cdp.click(button('Turn on camera')); await cdp.wait("document.querySelector('[data-face-count=\"1\"]')", 'synthetic stream');
    await cdp.click(button('Capture photo')); await cdp.wait("document.querySelector('img[data-face-slot=A]')", 'full synthetic capture');
    for (const [key, value] of [['participant', 'P01'], ['session', 'S09K'], ['presentation', 'LIVE']]) await field('#pad-A-' + key, value);
    await cdp.click("document.querySelector('[data-pad-consent]')"); await cdp.click("document.querySelector('[data-pad-inspect=A]')");
    await cdp.wait("document.querySelector('[data-pad-slot=A] [data-pad-roi=ready] img')?.complete", 'native ROI ready');
    const pixels = await cdp.evaluate(`(async()=>{const full=await createImageBitmap(window.__roiFixture.blobs.get(document.querySelector('img[data-face-slot=A]').src)),r=document.querySelector('[data-pad-slot=A] [data-pad-roi=ready] img'),region=await createImageBitmap(window.__roiFixture.blobs.get(r.src));
      const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=full.width;a.height=full.height;b.width=region.width;b.height=region.height;const ac=a.getContext('2d'),bc=b.getContext('2d');ac.drawImage(full,0,0);bc.drawImage(region,0,0);
      const expected=ac.getImageData(104,14,432,432).data,actual=bc.getImageData(0,0,432,432).data;let maxDifference=0;for(let i=0;i<actual.length;i++)maxDifference=Math.max(maxDifference,Math.abs(expected[i]-actual[i]));
      const answer={width:region.width,height:region.height,maxDifference};full.close();region.close();a.width=a.height=b.width=b.height=0;return answer;})()`);
    assert.deepEqual(pixels, { width: 432, height: 432, maxDifference: 0 });
    checks.push({ check: 'Browser PNG ROI matches the exact server rectangle of the full captured PNG, unmirrored, native 432x432', passed: true, ...pixels });
    for (const language of ['en', 'id']) {
      await cdp.evaluate(`(()=>{const s=document.querySelector('select[aria-label]');s.value=${JSON.stringify(language)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await cdp.wait(`document.documentElement.lang==='${language}'`, 'language');
      for (const viewport of [1440, 390, 360]) {
        await cdp.viewport(viewport); await cdp.evaluate("document.querySelector('[data-pad-panel]').scrollIntoView({block:'start'})"); await pause(100);
        const layout = await cdp.evaluate("(()=>{const image=document.querySelector('[data-pad-roi=ready] img'),r=image.getBoundingClientRect(),p=image.parentElement.getBoundingClientRect();return {pageWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,imageWidth:r.width,parentWidth:p.width,nativeWidth:image.naturalWidth,mirror:getComputedStyle(image).transform,hasLabel:document.querySelector('[data-pad-roi=ready]').textContent.includes('432')}})()");
        assert(layout.scrollWidth <= layout.pageWidth && layout.imageWidth <= layout.parentWidth && layout.nativeWidth === 432 && layout.mirror === 'none' && layout.hasLabel);
        checks.push({ check: 'EN/ID responsive ROI native dimensions with bounded display and no page overflow', language, viewport, passed: true, ...layout });
        await cdp.screenshot(path.join(output, `roi-${language}-${viewport}.png`));
      }
    }
    const oldUrl = await cdp.evaluate("document.querySelector('[data-pad-roi=ready] img').src");
    await field('#pad-A-session', 'S09K2'); assert(!await cdp.evaluate("!!document.querySelector('[data-pad-roi]')"));
    assert(await cdp.evaluate(`window.__roiFixture.revoked.includes(${JSON.stringify(oldUrl)})`));
    for (const mode of ['dimensions', 'checksum', 'error']) {
      fault = mode; await cdp.click("document.querySelector('[data-pad-inspect=A]')");
      await cdp.wait("document.querySelector('[data-pad-slot=A] [data-pad-roi=unavailable]')", 'unavailable ' + mode);
      assert(!await cdp.evaluate("!!document.querySelector('[data-pad-slot=A] [data-pad-roi] img')"));
      checks.push({ check: 'No ROI for invalid ' + mode, passed: true });
    }
    fault = null; await cdp.click("document.querySelector('[data-pad-inspect=A]')"); await cdp.wait("document.querySelector('[data-pad-roi=ready] img')", 'ready before delete');
    const deleteUrl = await cdp.evaluate("document.querySelector('[data-pad-roi=ready] img').src");
    await cdp.click(button('Hapus foto')); assert(!await cdp.evaluate("!!document.querySelector('[data-pad-roi]')"));
    assert(await cdp.evaluate(`window.__roiFixture.revoked.includes(${JSON.stringify(deleteUrl)})`));
    assert(await cdp.evaluate('window.__roiFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));
    assert(await cdp.evaluate('window.__roiFixture.bitmapCreated===window.__roiFixture.bitmapClosed'));
    await cdp.click("document.querySelector('button[aria-label=\"Keluar\"]')"); await cdp.wait("document.querySelector('#email')", 'logout');
    checks.push({ check: 'Metadata edit/delete revoke ROI, close all synthetic image bitmaps; logout clears the page', passed: true });
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
    await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ browser: runtime.browser, checks, requests, unknownRequests: fixture.state.unknown, runtimeErrors: traffic.errors,
      limits: 'Actual app and Chrome PNG/canvas/resource lifecycle. Synthetic stream, mocked capture detector/auth/PAD API. No physical camera, user photos, PAD inference or backend authorization proof. Browser pixel equality applies only to this synthetic PNG rectangle, not Python tensor equivalence.' }, null, 2) + '\n');
    console.log('Chrome PAD ROI PASS: synthetic pixel region, 6 EN/ID viewports, mismatch/ERROR refusal, cleanup');
  } finally { if (runtime) await runtime.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
