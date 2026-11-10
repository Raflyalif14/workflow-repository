const assert=require('node:assert/strict'),{createFixture}=require('./fixtures.cjs'),{launch}=require('./cdp.cjs');
const origin=process.env.WORKFLOW_TEST_ORIGIN||'http://127.0.0.1:3000';
async function main(){const fixture=createFixture(),base=fixture.respond;fixture.state.role='HEAD_SA';fixture.respond=(url,method,body)=>{const result=base(url,method,body);if(method==='GET'&&new URL(url).pathname.replace(/^\/api/,'')==='/dashboard')result.body.data.workTasks=Array.from({length:9},(_,i)=>({id:'t'+i,projectId:fixture.pid,projectName:'Synthetic project',name:'Synthetic task '+i,status:'IN_PROGRESS',dueDate:'2030-01-02',startDate:'2030-01-01'}));return result;};
const runtime=await launch(fixture,origin),{cdp}=runtime;try{
await cdp.navigate(origin+'/login');await cdp.wait(`location.origin===${JSON.stringify(origin)}`,'origin');await cdp.evaluate("localStorage.setItem('workflow.session',JSON.stringify({id:crypto.randomUUID(),accessToken:'synthetic-only',refreshToken:'synthetic-only'}));localStorage.setItem('workflow-locale','en');");await cdp.navigate(origin+'/');await cdp.wait("document.querySelector('section[aria-labelledby=quick-insights-heading] ul')",'task cards',60000);
assert.equal(await cdp.evaluate("document.querySelector('section[aria-labelledby=quick-insights-heading]').querySelectorAll('li').length"),4);
const point=await cdp.evaluate("(()=>{const list=document.querySelector('section[aria-labelledby=quick-insights-heading] ul');list.scrollIntoView({block:'center'});const r=list.getBoundingClientRect();return {x:r.left+30,y:r.top+40,scroll:window.scrollY,overflow:getComputedStyle(list).overflowY};})()");assert.equal(point.overflow,'visible');
await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:point.x,y:point.y,deltaX:0,deltaY:400});await cdp.wait(`window.scrollY>${point.scroll}`,'wheel scrolls document over Task List');
await cdp.click("document.querySelector('section[aria-labelledby=quick-insights-heading] button[aria-expanded]')");
await cdp.wait("document.querySelector('section[aria-labelledby=quick-insights-heading]').querySelectorAll('li').length===9",'all tasks expanded');
assert.equal(await cdp.evaluate("document.querySelector('section[aria-labelledby=next-task-heading]').querySelectorAll('li').length"),4);
assert(await cdp.evaluate("document.querySelector('section[aria-labelledby=quick-insights-heading] button[aria-expanded]').getAttribute('aria-expanded')==='true'"));
await cdp.click("document.querySelector('section[aria-labelledby=quick-insights-heading] button[aria-expanded]')");
await cdp.wait("document.querySelector('section[aria-labelledby=quick-insights-heading]').querySelectorAll('li').length===4",'tasks collapsed');
assert.equal(runtime.traffic.errors.length,0);
console.log('PASS wheel over task card scrolls main page, 4-row preview, expand all/collapse, independent panels; synthetic API');
}finally{await runtime.cleanup();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
