const assert=require('node:assert/strict'),{createFixture}=require('./fixtures.cjs'),{launch}=require('./cdp.cjs');const origin=process.env.WORKFLOW_TEST_ORIGIN||'http://127.0.0.1:3000';
async function main(){const fixture=createFixture();fixture.state.role='HEAD_SA';const runtime=await launch(fixture,origin),{cdp}=runtime;try{
await cdp.navigate(origin+'/login');await cdp.wait(`location.origin===${JSON.stringify(origin)}`,'origin');await cdp.evaluate("localStorage.setItem('workflow.session',JSON.stringify({id:crypto.randomUUID(),accessToken:'synthetic-only',refreshToken:'synthetic-only'}));localStorage.setItem('workflow-locale','en');");
for(const route of ['/approvals','/documents','/projects','/milestones','/']){await cdp.navigate(origin+route);await cdp.wait("document.querySelector('main')&&document.querySelector('header')",'shell',60000);
for(const width of [1440,390]){await cdp.viewport(width);await cdp.evaluate("window.scrollTo({left:500,top:100,behavior:'instant'})");
assert.equal(await cdp.evaluate('window.scrollX'),0,route+' root horizontal scroll');
assert(await cdp.evaluate("document.querySelector('main').getBoundingClientRect().left>=-1"),route+' content behind sidebar');
const point=await cdp.evaluate('({x:innerWidth-40,y:innerHeight/2})');await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:350,deltaY:150});await cdp.wait('window.scrollX===0','horizontal wheel bound');
if(width===1440)assert(await cdp.evaluate("document.querySelector('main').getBoundingClientRect().left>=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'))-1"),route+' desktop offset');
}
await cdp.viewport(1440);}
// Local horizontal regions remain usable even when root sideways scrolling is clipped.
await cdp.evaluate("(()=>{const outer=document.createElement('div');outer.id='local-scroll-test';outer.style.cssText='width:200px;overflow-x:auto';const inner=document.createElement('div');inner.style.width='700px';inner.textContent='Synthetic local table';outer.append(inner);document.querySelector('main').append(outer);outer.scrollLeft=200;})()");
assert.equal(await cdp.evaluate("document.querySelector('#local-scroll-test').scrollLeft"),200);assert.equal(runtime.traffic.errors.length,0);console.log('PASS desktop/mobile root horizontal gestures bounded across Approvals/Documents/Projects/Milestones/Dashboard; local scrolling preserved');
}finally{await runtime.cleanup();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
