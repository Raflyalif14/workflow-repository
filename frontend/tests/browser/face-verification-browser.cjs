'use strict';
// Real app in Chrome; camera frames and every API response are synthetic.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createFixture } = require('./fixtures.cjs');
const { launch, pause } = require('./cdp.cjs');
const origin = process.env.WORKFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback app only');
const output = path.resolve(__dirname, '../../../docs/face-verification-stage1');
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
  async function inspect(width, lang, name) {
    await cdp.viewport(width); await pause(150);
    const metric = await cdp.evaluate(`(() => {const v=document.querySelector('video'),r=v.getBoundingClientRect();return {width:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,videoWidth:r.width,videoRight:r.right,status:document.querySelector('main [role=status]').textContent};})()`);
    assert(metric.scrollWidth <= metric.clientWidth && metric.videoRight <= metric.clientWidth);
    checks.push({ check: 'Responsive preview', viewport: width, language: lang, ...metric, passed: true });
    await cdp.screenshot(path.join(output, name + '.png'));
  }
  try {
    await cdp.viewport(1440); await cdp.navigate(origin + '/settings/face-verification');
    await cdp.wait("document.querySelector('#email')", 'anonymous redirect');
    assert.equal(await cdp.evaluate("document.querySelector('video')===null"), true);
    checks.push({ check: 'Anonymous route uses existing auth redirect; no camera UI', passed: true });
    await cdp.evaluate("(() => {for(const [s,v] of [['#email','sa@fixture.invalid'],['#password','SyntheticOnly!123']]){const e=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()");
    await cdp.click("document.querySelector('form button[type=submit]')"); await cdp.wait("document.querySelector('#dashboard-summary-heading')", 'fixture SA');
    await cdp.navigate(origin + '/settings'); await cdp.wait("document.querySelector('a[href=\"/settings/face-verification\"]')", 'Settings link');
    await cdp.click("document.querySelector('a[href=\"/settings/face-verification\"]')"); await cdp.wait("document.querySelector('video')", 'actual camera page');
    await cdp.evaluate(`(() => {
      const state=window.__cameraFixture={calls:[],streams:[],mode:'ready',resolve:null};
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async constraints=>{
        state.calls.push(constraints);
        if(state.mode==='denied')throw new DOMException('Synthetic private diagnostic','NotAllowedError');
        const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#eff6ff';ctx.fillRect(0,0,640,360);ctx.fillStyle='#2563eb';ctx.font='24px sans-serif';ctx.fillText('Synthetic preview - no physical camera',65,180);
        const stream=canvas.captureStream(5);state.streams.push(stream);
        if(state.mode==='pending')return new Promise(resolve=>{state.resolve=()=>resolve(stream);});
        return stream;
      }});
    })()`);
    assert.equal(await cdp.evaluate("window.__cameraFixture.calls.length"), 0);
    await cdp.click(button('Turn on camera')); await cdp.wait("document.querySelector('video').readyState>=2 && document.querySelector('main [role=status]').textContent.includes('Camera is on')", 'synthetic video playing');
    assert.deepEqual(await cdp.evaluate("window.__cameraFixture.calls"), [{ video: { facingMode: { ideal: 'user' } }, audio: false }]);
    checks.push({ check: 'Explicit click requests front-facing video without audio once and attaches a playing synthetic stream', passed: true });
    await inspect(1440, 'en', 'preview-en-1440');
    await cdp.evaluate("(() => {const s=document.querySelector('select[aria-label]');s.value='id';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await cdp.wait("document.documentElement.lang==='id'", 'locale');
    assert.equal(await cdp.evaluate("window.__cameraFixture.calls.length"), 1);
    await inspect(390, 'id', 'preview-id-390'); await inspect(360, 'id', 'preview-id-360');
    await cdp.click(button('Matikan kamera')); await cdp.wait("document.querySelector('video').srcObject===null", 'stop preview');
    assert(await cdp.evaluate("window.__cameraFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))"));
    checks.push({ check: 'Stop releases every track; locale change retains the running preview without another request', passed: true });
    await cdp.evaluate("window.__cameraFixture.mode='denied'"); await cdp.click(button('Nyalakan kamera'));
    await cdp.wait("document.querySelector('main [role=alert]')?.textContent.includes('ditolak')", 'safe permission denial');
    assert.equal(await cdp.evaluate("document.querySelector('main').textContent.includes('Synthetic private diagnostic')"), false);
    checks.push({ check: 'Denied permission shows localized safe retry guidance without raw diagnostic', passed: true });
    await cdp.evaluate("window.__cameraFixture.mode='ready'"); await cdp.click(button('Nyalakan kamera'));
    await cdp.wait("document.querySelector('main [role=status]').textContent.includes('Kamera aktif')", 'retry');
    await cdp.click("document.querySelector('main a[href=\"/settings\"]')");
    await cdp.wait("document.querySelector('video')===null", 'route left');
    assert(await cdp.evaluate("window.__cameraFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))"));
    checks.push({ check: 'Leaving through the actual Settings link releases the active stream', passed: true });
    await cdp.click("document.querySelector('a[href=\"/settings/face-verification\"]')"); await cdp.wait("document.querySelector('video')", 'camera return');
    await cdp.evaluate("window.__cameraFixture.mode='pending'"); await cdp.click(button('Nyalakan kamera'));
    await cdp.wait("window.__cameraFixture.resolve!==null", 'pending permission');
    await cdp.click("document.querySelector('main a[href=\"/settings\"]')"); await cdp.wait("document.querySelector('video')===null", 'leave pending');
    await cdp.evaluate("window.__cameraFixture.resolve()"); await pause(150);
    assert(await cdp.evaluate("window.__cameraFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))"));
    checks.push({ check: 'Permission completing after route unmount immediately releases its late stream', passed: true });
    await cdp.click("document.querySelector('a[href=\"/settings/face-verification\"]')"); await cdp.wait("document.querySelector('video')", 'camera return');
    await cdp.evaluate("window.__cameraFixture.mode='ready'"); await cdp.click(button('Nyalakan kamera'));
    await cdp.wait("document.querySelector('main [role=status]').textContent.includes('Kamera aktif')", 'before logout');
    await cdp.click("document.querySelector('button[aria-label=\"Keluar\"]')"); await cdp.wait("document.querySelector('#email')", 'logout');
    assert(await cdp.evaluate("window.__cameraFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))"));
    checks.push({ check: 'Actual auth-provider logout unmounts preview and stops all tracks', passed: true });
    assert.deepEqual(fixture.state.unknown, []); assert.deepEqual(traffic.errors, []);
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ browser: runtime.browser, checks,
      unknownRequests: fixture.state.unknown, runtimeErrors: traffic.errors, liveRequests: 0,
      limits: 'Real app/Chrome with synthetic API and getUserMedia replaced by canvas video. No physical camera, OS permissions or real GoTrue/Storage tested.' }, null, 2) + '\n');
    await runtime.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
