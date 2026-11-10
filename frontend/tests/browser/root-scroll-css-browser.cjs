const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');const {createFixture}=require('./fixtures.cjs'),{launch}=require('./cdp.cjs');
async function main(){const css=await fs.readFile(path.resolve('frontend/src/app/globals.css'),'utf8');const rootRule=css.match(/html, body \{([^}]+)\}/)[1];assert(rootRule.includes('overflow-x: clip'));assert(rootRule.includes('overscroll-behavior: none'));const runtime=await launch(createFixture(),'http://127.0.0.1:3000'),{cdp}=runtime;try{
const tree=await cdp.send('Page.getFrameTree');await cdp.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:`<html><head><style>html,body{${rootRule}}body{margin:0}.sidebar{position:fixed;left:0;top:0;bottom:0;width:248px;background:white}.content{margin-left:248px;min-width:0}header{position:sticky;top:0;height:64px;background:white}.wide{width:2500px;height:2500px}.local{width:200px;overflow-x:auto}.local div{width:700px;height:50px}@media(max-width:1023px){.sidebar{display:none}.content{margin-left:0}}</style></head><body><aside class="sidebar">Sidebar</aside><div class="content"><header>Header</header><main><div class="local"><div>Local table</div></div><div class="wide">Synthetic oversized content</div></main></div></body></html>`});
for(const width of [1440,390]){await cdp.viewport(width);await cdp.evaluate("window.scrollTo({left:600,top:200,behavior:'instant'})");assert.equal(await cdp.evaluate('scrollX'),0);assert.equal(await cdp.evaluate('scrollY'),200);assert.equal(await cdp.evaluate("document.querySelector('header').getBoundingClientRect().top"),0);await cdp.evaluate("document.querySelector('.local').scrollLeft=200");assert.equal(await cdp.evaluate("document.querySelector('.local').scrollLeft"),200);
assert.equal(await cdp.evaluate("getComputedStyle(document.documentElement).overscrollBehaviorY"),'none');
await cdp.evaluate("window.scrollTo({top:0,behavior:'instant'})");
await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:width-40,y:200,deltaX:0,deltaY:-700});
await cdp.wait('scrollY===0','top bound');assert.equal(await cdp.evaluate("document.querySelector('header').getBoundingClientRect().top"),0);
await cdp.evaluate("window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})");
await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:width-40,y:200,deltaX:0,deltaY:700});
assert(await cdp.evaluate('scrollY<=document.documentElement.scrollHeight-innerHeight+1'));
}
console.log('PASS isolated CSS: root overscroll disabled and top/bottom bounds checked; sideways movement blocked; vertical scroll, sticky header and local table scrolling preserved desktop/mobile');
}finally{await runtime.cleanup();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
