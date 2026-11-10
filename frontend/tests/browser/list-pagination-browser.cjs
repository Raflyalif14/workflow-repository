const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {createFixture}=require('./fixtures.cjs'),{launch}=require('./cdp.cjs');
const origin=process.env.WORKFLOW_TEST_ORIGIN||'http://127.0.0.1:3000';
async function main(){const fixture=createFixture(),base=fixture.respond;fixture.state.role='HEAD_SA';
fixture.respond=(url,method,body)=>{const result=base(url,method,body);if(method==='GET'&&new URL(url).pathname.replace(/^\/api/,'')==='/documents'){const template=result.body.data[0];result.body.data=Array.from({length:18},(_,i)=>({...template,id:`90000000-0000-4000-8000-${String(i+100).padStart(12,'0')}`,title:`Paged Document ${String(i+1).padStart(2,'0')}`}));}
const route=new URL(url).pathname.replace(/^\/api/,'');
if(method==='GET'&&route==='/me/assigned-milestones'){const template=result.body.data[0];result.body.data=Array.from({length:18},(_,i)=>({...template,id:'milestone-'+i,name:`Paged Milestone ${String(i+1).padStart(2,'0')}`}));}
if(method==='GET'&&route==='/approvals/overview'){const template=result.body.data.items[0];result.body.data.items=Array.from({length:18},(_,i)=>({...template,id:'approval-'+i}));result.body.data.stats={totalPending:18,pendingDocs:18,pendingProjectPlans:0,pendingDeadlines:0};}
return result;};
const runtime=await launch(fixture,origin),{cdp}=runtime;
try{await cdp.navigate(origin+'/login');await cdp.wait(`location.origin===${JSON.stringify(origin)}`,'origin');await cdp.evaluate("localStorage.setItem('workflow.session',JSON.stringify({id:crypto.randomUUID(),accessToken:'synthetic-only',refreshToken:'synthetic-only'}));localStorage.setItem('workflow-locale','en');");await cdp.navigate(origin+'/documents');
await cdp.wait("document.body.textContent.includes('Showing 1–10 of 18')",'first page',60000);
const titles=()=>cdp.evaluate("[...document.querySelectorAll('h3')].map(e=>e.textContent).filter(t=>t.startsWith('Paged Document'))");
const first=await titles();assert.equal(first.length,10);
await cdp.click("[...document.querySelectorAll('nav button')].find(e=>e.textContent.trim()==='Next')");await cdp.wait("document.body.textContent.includes('Showing 11–18 of 18')",'last page');
const last=await titles();assert.equal(last.length,8);assert.equal(new Set([...first,...last]).size,18);
assert(await cdp.evaluate("[...document.querySelectorAll('nav button')].find(e=>e.textContent.trim()==='Next').disabled"));
await cdp.click("[...document.querySelectorAll('nav button')].find(e=>e.textContent.trim()==='Previous')");await cdp.wait("document.body.textContent.includes('Showing 1–10 of 18')",'previous page');
await fs.mkdir(path.resolve('.cache/pagination-ui'),{recursive:true});await cdp.screenshot(path.resolve('.cache/pagination-ui/documents.png'));
await cdp.navigate(origin+'/milestones');await cdp.wait("document.body.textContent.includes('Showing 1–10 of 18')",'milestones first page',60000);
assert(await cdp.evaluate("document.body.textContent.includes('Paged Milestone 01')&&!document.body.textContent.includes('Paged Milestone 11')"));
await cdp.click("[...document.querySelectorAll('nav button')].find(e=>e.textContent.trim()==='Next')");await cdp.wait("document.body.textContent.includes('Showing 11–18 of 18')",'milestones last page');
assert(await cdp.evaluate("document.body.textContent.includes('Paged Milestone 11')&&!document.body.textContent.includes('Paged Milestone 01')"));
await cdp.navigate(origin+'/approvals');await cdp.wait("document.body.textContent.includes('Showing 1–10 of 18')",'approvals first page',60000);
await cdp.click("[...document.querySelectorAll('nav button')].find(e=>e.textContent.trim()==='Next')");await cdp.wait("document.body.textContent.includes('Showing 11–18 of 18')",'approvals last page');
assert.equal(runtime.traffic.errors.length,0);console.log('PASS browser Documents/Milestones/Approvals 18 results split 10/8, Next/Previous bounded, no missing or duplicate rows; synthetic API only');
}finally{await runtime.cleanup();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
