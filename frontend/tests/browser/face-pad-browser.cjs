'use strict';
// Real app/Chrome/Node/Python PAD. Canvas camera + browser detection + identity provider are fixtures.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createFixture } = require('./fixtures.cjs'), { launch, pause } = require('./cdp.cjs');
const { startPadFixture } = require('../../../backend/tests/face-pad-fixture.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback only');
const output = path.resolve(__dirname, '../../../docs/face-verification-stage9g');
async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = createFixture(), base = fixture.respond, checks = [];
  fixture.respond = (url, method, body) => {
    const p = new URL(url).pathname.replace(/^\/api/, '');
    if (p === '/face-experiment/capabilities') return { status: 200, body: { success: true, data: { enabled: false } } };
    if (p === '/notifications/preferences') return { status: 200, body: { success: true, data: { in_app_enabled: true, telegram_enabled: false, telegram_linked: false } } };
    return base(url, method, body);
  };
  const local = await startPadFixture(); let runtime;
  try {
    runtime = await launch(fixture, origin); const { cdp, traffic } = runtime;
    const old = cdp.listeners.get('Fetch.requestPaused')[0]; cdp.listeners.set('Fetch.requestPaused', []);
    const padRequests = [];
    cdp.on('Fetch.requestPaused', async event => {
      const url = new URL(event.request.url);
      if (url.pathname.startsWith('/api/face-pad/')) {
        padRequests.push({ path: url.pathname, method: event.request.method });
        await cdp.send('Fetch.continueRequest', { requestId: event.requestId, url: local.origin + url.pathname, headers: Object.entries(event.request.headers).map(([name, value]) => ({ name, value })) }); return;
      }
      await old(event);
    });
    const button = text => `[...document.querySelectorAll('main button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
    await cdp.navigate(origin + '/settings/face-verification'); await cdp.wait("document.querySelector('#email')", 'existing auth redirect');
    await cdp.evaluate("(()=>{for(const [s,v]of[['#email','sa@fixture.invalid'],['#password','SyntheticOnly!123']]){const e=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()");
    await cdp.click("document.querySelector('form button[type=submit]')"); await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'fixture SA');
    await cdp.navigate(origin + '/settings/face-verification'); await cdp.wait("document.querySelector('[data-pad-panel]')", 'PAD panel');
    const image = (await fs.readFile(path.resolve(__dirname, '../../../services/face-experiment/tests/fixtures/same-person-a.jpg'))).toString('base64');
    await cdp.evaluate(`(async()=>{
      const image=new Image();image.src='data:image/jpeg;base64,${image}';await image.decode();
      window.__padCamera={streams:[],blank:false};
      window.Worker=class {postMessage(m){if(m.type==='init')setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),0);if(m.type==='frame'){const width=m.bitmap.width,height=m.bitmap.height;m.bitmap.close();setTimeout(()=>this.onmessage?.({data:{type:'result',requestId:m.requestId,width,height,boxes:[{x:width*.2,y:height*.2,width:width*.5,height:height*.5,confidence:.99}]}}),0);}}terminate(){this.onmessage=null;}};
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
        const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');
        const draw=()=>{if(window.__padCamera.blank){ctx.fillStyle='#eff6ff';ctx.fillRect(0,0,c.width,c.height);}else ctx.drawImage(image,0,0);};draw();const timer=setInterval(draw,100),s=c.captureStream(8);
        s.getTracks().forEach(t=>{const stop=t.stop.bind(t);t.stop=()=>{clearInterval(timer);stop();};});window.__padCamera.streams.push(s);return s;
      }});
    })()`);
    await cdp.click(button('Turn on camera')); await cdp.wait("document.querySelector('[data-face-count=\"1\"]')", 'synthetic camera/detection');
    await cdp.click(button('Capture photo')); await cdp.wait("document.querySelector('[data-face-slot=A]')", 'captured A');
    await cdp.click(button('Photo B')); await cdp.evaluate('window.__padCamera.blank=true'); await cdp.click(button('Turn on camera'));
    await cdp.wait("document.querySelector('[data-face-count=\"1\"]')", 'B mock capture eligibility'); await cdp.click(button('Capture photo')); await cdp.wait("document.querySelector('[data-face-slot=B]')", 'captured B');
    assert(await cdp.evaluate('window.__padCamera.streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));
    async function field(selector, value) {
      await cdp.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); await pause(30);
    }
    for (const slot of ['A', 'B']) { await field(`#pad-${slot}-participant`, 'P01'); await field(`#pad-${slot}-session`, 'S09G'); await field(`#pad-${slot}-presentation`, slot === 'A' ? 'LIVE' : 'SCREEN_PHOTO'); }
    await field('#pad-B-mediaId', 'M01');
    assert(await cdp.evaluate("document.querySelector('[data-pad-inspect=A]').disabled")); assert.equal(padRequests.filter(r => r.path.endsWith('inspect') && r.method === 'POST').length, 0);
    await cdp.click("document.querySelector('[data-pad-consent]')"); await cdp.click("document.querySelector('[data-pad-inspect=A]')");
    await cdp.wait("document.querySelector('[data-pad-result=A]')?.textContent.includes('Processing complete')", 'real YuNet + MN3 result', 30000);
    assert.equal(padRequests.filter(r => r.path.endsWith('inspect') && r.method === 'POST').length, 1);
    assert(!await cdp.evaluate("!!document.querySelector('[data-comparison-result]')"));
    await cdp.click("[...document.querySelectorAll('[data-pad-slot=A] button')].find(b=>b.textContent==='Record PAD result')");
    assert.equal(await cdp.evaluate("document.querySelectorAll('[data-pad-row]').length"), 1);
    await cdp.click("document.querySelector('[data-pad-inspect=B]')");
    await cdp.wait("document.querySelector('[data-pad-result=B]')?.textContent.includes('No face')", 'real YuNet blank frame refusal', 30000);
    assert(!await cdp.evaluate("document.querySelector('[data-pad-result=B] dl')"));
    checks.push({ check: 'Original captures sent only after consent; real Python YuNet/MN3 success A; blank B refused with no probabilities; SFace result remains separate; one PAD row', passed: true });
    for (const lang of ['en', 'id']) {
      await cdp.evaluate(`(()=>{const s=document.querySelector('select[aria-label]');s.value=${JSON.stringify(lang)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await cdp.wait(`document.documentElement.lang==='${lang}'`, 'locale');
      for (const width of [1440, 390, 360]) {
        await cdp.viewport(width); await cdp.evaluate("document.querySelector('[data-pad-panel]').scrollIntoView({block:'start'})"); await pause(100);
        const metric = await cdp.evaluate('({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})'); assert(metric.scroll <= metric.client);
        assert(await cdp.evaluate("!!document.querySelector('[data-pad-result=A]')"));
        checks.push({ check: 'PAD responsive layout/result survives locale', language: lang, viewport: width, ...metric, passed: true });
        await cdp.screenshot(path.join(output, `pad-${lang}-${width}.png`));
      }
    }
    await field('#pad-A-session', 'S09G2'); assert(!await cdp.evaluate("document.querySelector('[data-pad-result=A]')"));
    await cdp.click("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Hapus foto')");
    assert(!await cdp.evaluate("document.querySelector('[data-face-slot=A]')")); assert(await cdp.evaluate("document.querySelector('[data-pad-inspect=A]').disabled"));
    await cdp.click("document.querySelector('button[aria-label=\"Keluar\"]')"); await cdp.wait("document.querySelector('#email')", 'logout');
    checks.push({ check: 'Metadata edits and delete invalidate result; logout removes experiment page', passed: true });
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
    await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ browser: runtime.browser, checks, padRequests, liveRequests: 0, unknownRequests: fixture.state.unknown, runtimeErrors: traffic.errors,
      limits: 'Actual app, Chrome, Node route and Python pretrained YuNet/MN3. Canvas uses attributed NASA fixture and blank frame; browser FaceDetector mocked for capture eligibility. Auth provider/profile mocked. No physical camera, real GoTrue/Storage, PAD accuracy or login verification.' }, null, 2) + '\n');
    console.log('Chrome PAD browser checks PASS: 6 EN/ID viewports, capture/consent/success/failure/separation/record/invalidation/logout');
  } finally { if (runtime) await runtime.cleanup(); await local.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
