'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createFixture}=require('./fixtures.cjs');const {launch,pause}=require('./cdp.cjs');
const origin=process.env.WORKFLOW_TEST_ORIGIN||'http://127.0.0.1:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Only loopback frontend allowed');
const output=path.resolve('docs/dashboard-browser-verification/scenarios');
async function main(){await fs.mkdir(output,{recursive:true});const fixture=createFixture(),runtime=await launch(fixture,origin),{cdp,traffic}=runtime,results=[];
const recent=`document.querySelector('section[aria-labelledby="recent-activity-heading"]')`,button=i=>`${recent}.querySelectorAll('nav button')[${i}]`;
const log=(area,data)=>{results.push({area,...data});console.log(JSON.stringify(results.at(-1)));};
const locale=async value=>{await cdp.evaluate(`(()=>{const e=document.querySelector('select[aria-label]');e.value='${value}';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await cdp.wait(`document.documentElement.lang==='${value}'`,'locale');};
const namedButton=text=>`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
try{
 await cdp.viewport(360,640);await cdp.navigate(origin+'/login');await cdp.wait("document.querySelector('#email')",'login');
 assert.equal(await cdp.evaluate("document.querySelectorAll('button[aria-label=\"Show password\"],button[aria-label=\"Hide password\"]').length"),1,'One password visibility button');
 await cdp.screenshot(path.join(output,'login-360.png'));
 await cdp.evaluate(`(()=>{for(const [selector,value] of [['#email','sales@fixture.invalid'],['#password','SyntheticOnly!123']]){const e=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
 await cdp.click("document.querySelector('form button[type=submit]')");await cdp.wait("document.querySelector('#dashboard-recent-activity-list')?.children.length===8",'dashboard');
 fixture.state.activityFailure=true;fixture.state.activityDelay=500;await cdp.click(button(1));await cdp.wait(`${recent}.querySelector('[role=status]')`,'loading');assert(await cdp.evaluate(`${button(1)}.disabled`));
 await cdp.wait(`${recent}.querySelector('[role=alert]')`,'activity failure',30000);assert(!await cdp.evaluate("Boolean(document.querySelector('#dashboard-recent-activity-list'))"));
 await cdp.screenshot(path.join(output,'activity-error-360.png'));fixture.state.activityFailure=false;
 await cdp.click(`${recent}.querySelector('[role=alert] button')`);await cdp.wait("document.querySelector('#dashboard-recent-activity-list')?.textContent.includes('activity 09')",'retry page 2');
 log('activity-error',{loading:true,errorDistinctFromEmpty:true,retry:true,items:8});
 await locale('id');assert(await cdp.evaluate(`${recent}.querySelector('nav').textContent.includes('Halaman 2')`));
 fixture.state.account=2;const start=traffic.api.length;
 await cdp.evaluate(`(()=>{const key='workflow.session',oldValue=localStorage.getItem(key),newValue=JSON.stringify({id:crypto.randomUUID(),accessToken:'fixture-only-SALES-2',refreshToken:'fixture-only-refresh'});localStorage.setItem(key,newValue);window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue,storageArea:localStorage}));})()`);
 await cdp.wait("document.querySelector('#dashboard-recent-activity-list')?.textContent.includes('activity 01 - account 2')",'new account first page');
 assert(await cdp.evaluate(`${button(0)}.disabled`));assert(!traffic.api.slice(start).some(x=>x.path.includes('/dashboard/activity')),'Old cursor not requested for new account');
 await cdp.screenshot(path.join(output,'activity-account-reset-360.png'));log('account-reset',{profileReloaded:true,page:1,noOldCursorRequest:true,noOldActivityVisible:!await cdp.evaluate("document.querySelector('#dashboard-recent-activity-list').textContent.includes('account 1')")});
 await cdp.navigate(origin+`/projects/${fixture.pid}`);await cdp.wait("document.querySelector('main')?.textContent.includes('25000000')||[...document.querySelectorAll('button')].some(e=>e.textContent.includes('Ubah estimasi'))",'project value');
 await locale('en');await cdp.wait(namedButton('Edit estimated value'),'edit value control');await cdp.click(namedButton('Edit estimated value'));
 const dialog="document.querySelector('div.relative.z-50.overflow-y-auto')";await cdp.wait(dialog,'existing dialog');
 await cdp.evaluate(`(()=>{const e=document.querySelector('input[id^="estimate-"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'30000000');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 // Language control behind a modal is changed programmatically solely to test preserved React state.
 await locale('id');assert.equal(await cdp.evaluate("document.querySelector('input[id^=\"estimate-\"]').value"),'30000000');
 for(const width of [360,390,1440]){await cdp.viewport(width,400);const m=await cdp.evaluate(`(()=>{const e=${dialog},r=e.getBoundingClientRect();e.scrollTop=e.scrollHeight;return {width:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,dialogWidth:r.width,dialogHeight:r.height,scrollable:e.scrollHeight>=e.clientHeight,buttons:[...e.querySelectorAll('button')].map(b=>{const x=b.getBoundingClientRect();return {text:b.textContent.trim(),reachable:x.bottom<=r.bottom&&x.top>=r.top}})}})()`);assert(m.scrollWidth<=m.clientWidth);assert(m.dialogWidth<=width&&m.dialogHeight<=368);assert(m.buttons.filter(x=>x.text==='Batal'||x.text.includes('Tinjau')).every(x=>x.reachable));await cdp.screenshot(path.join(output,`dialog-id-${width}.png`));log('dialog',{...m,inputRetainedAfterLocale:true});}
 await cdp.click(namedButton('Batal'));await cdp.wait(`!${dialog}`,'cancel');assert(!fixture.state.requests.some(x=>x.method!=='GET'&&!['OPTIONS','/auth/login','/auth/preferences/language'].includes(x.method==='OPTIONS'?x.method:x.path)),'No business mutation');
 // Remaining SALES route restriction and empty state, not rerunning passed SALES matrix.
 await cdp.navigate(origin+'/approvals');await cdp.wait("document.querySelector('main')?.textContent.length>20",'Sales access restriction');await cdp.screenshot(path.join(output,'sales-approvals-restricted-1440.png'));log('sales-approvals',{viewport:1440,content:await cdp.evaluate("document.querySelector('main').textContent"),approvalFetchForSales:traffic.api.some(x=>x.role==='SALES'&&x.path.includes('/approvals/overview'))});
 fixture.state.empty=true;await cdp.navigate(origin+'/');await cdp.wait("document.querySelector('#dashboard-summary-heading')",'empty');await pause(700);assert(!await cdp.evaluate("Boolean(document.querySelector('#dashboard-recent-activity-list'))"));await cdp.screenshot(path.join(output,'sales-empty.png'));log('sales-empty',{viewport:1440,noActivity:true});
 assert.deepEqual(fixture.state.unknown,[]);assert.deepEqual(traffic.errors,[]);log('isolation',{unconfigured:0,nonUiNetworkRequestsForwarded:0});
}catch(error){log('failure',{message:error.message});await cdp.screenshot(path.join(output,'failure.png'));throw error;}finally{await fs.writeFile(path.join(output,'results.json'),JSON.stringify({results,traffic,unknown:fixture.state.unknown},null,2)+'\n');await runtime.cleanup();}}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
