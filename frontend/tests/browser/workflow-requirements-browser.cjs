'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {launch,pause}=require('./cdp.cjs'),{createFixture}=require('./fixtures.cjs');
require('../register.cjs');const {en}=require('../../src/i18n/en'),{id}=require('../../src/i18n/id');
const origin=process.env.WORKFLOW_TEST_ORIGIN||'http://127.0.0.1:3036';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Loopback only');
const out=path.resolve(__dirname,'../../../.cache/workflow-requirements/browser');
const uuid=n=>`91000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main(){
 await fs.mkdir(out,{recursive:true});const fixture=createFixture(),base=fixture.respond,checks=[],starts=[],outcomes=[];let mode='dashboard',uploads=0;
 const startedMilestones=new Set();
 fixture.respond=(url,method,body)=>{const u=new URL(url),p=u.pathname.replace(/^\/api/,'');const ok=data=>({status:200,body:{success:true,data}});
  if(method==='GET'&&p==='/face-login/capabilities')return ok({enabled:true,singleGlance:true});
  if(method==='GET'&&p==='/face-login/devices')return ok({devices:[]});
  if(method==='GET'&&p.startsWith('/face-login/device/'))return ok({registered:true});
  if(method==='POST'&&p==='/face-login/login/start'){starts.push(JSON.parse(body));return {status:422,body:{success:false,message:'Synthetic camera stop',errors:{code:'FACE_NONE'}}};}
  if(method==='POST'&&p===`/projects/${fixture.pid}/outcome-evidence`){uploads++;return ok({documents:[{id:uuid(90)}]});}
  if(method==='POST'&&mode==='start'&&[fixture.mid,uuid(80)].some(id=>p===`/milestones/${id}/start`)){startedMilestones.add(p.split('/')[2]);return ok({changed:true});}
  if(method==='POST'&&p===`/milestones/${fixture.mid}/complete`){outcomes.push(JSON.parse(body));return outcomes.length===1?{status:503,body:{success:false,message:'Synthetic retry'}}:ok({status:'COMPLETED'});}
  if(method==='GET'&&[uuid(80),uuid(81)].some(id=>p.startsWith(`/milestones/${id}/`)))return base(url.replace(/91000000-0000-4000-8000-00000000008[01]/,fixture.mid),method,body);
  const result=base(url,method,body);
  if(method==='GET'&&p==='/dashboard'){
   result.body.data.salesPipeline={preTender:{active:2,postponed:1,estimatedRevenue:15000000},submissionTender:{advancedFromPreTender:3,inProgress:1,waitingResult:1,postponed:0,estimatedRevenue:25000000},results:{won:1,lost:1,finalRevenue:20000000}};
   result.body.data.projectPipeline=fixture.state.role==='HEAD_SA'?{preTender:{active:4,postponed:2,estimatedRevenue:45000000},submissionTender:{advancedFromPreTender:7,inProgress:3,waitingResult:1,postponed:0,estimatedRevenue:75000000},results:{won:3,lost:1,finalRevenue:60000000}}:null;
   result.body.data.workTasks=[...Array.from({length:12},(_,i)=>({id:uuid(i+1),projectId:fixture.pid,projectName:`Priority ${i+1}`,name:`Task ${i+1}`,status:'IN_PROGRESS',dueDate:'2026-01-02',startDate:'2026-01-01'})),{id:uuid(20),projectId:fixture.pid,projectName:'Later project',name:'Later task',status:'CREATED',dueDate:'2099-12-01',startDate:'2099-11-01'},{id:uuid(21),projectId:fixture.pid,projectName:'Plan project',name:'Plan review',status:'CREATED',dueDate:null,startDate:null,href:`/projects/${fixture.pid}`}];
   result.body.data.projectProgress=result.body.data.projectProgress.slice(0,2).map((v,i)=>({...v,name:i?'Revenue Tender':'Revenue Pra',status:i?'ACTIVE':'WON',scenarioKey:i?'ON_SUBMISSION_TENDER':'PRA_TENDER',estimatedRevenue:200000000,finalRevenue:i?null:150000000}));
  }
  if(method==='GET'&&p===`/projects/${fixture.pid}`&&mode==='evidence'){
   Object.assign(result.body.data,{status:'ACTIVE',scenario:{id:uuid(50),name:'On Submission Tender',workflow_model:'OPERATIONAL_V2',workflow_version:2},active_scenario:{name:'On Submission Tender'},phases:[{id:result.body.data.active_phase_id,phase_key:'ON_SUBMISSION_TENDER',status:'ACTIVE'}]});
  }
  if(method==='GET'&&p===`/projects/${fixture.pid}/milestones`&&mode==='evidence'){
   const v=result.body.data[0];result.body.data=[{...v,id:uuid(80),name:'Previous work',status:'COMPLETED',step_order:1},{...v,name:'Final Sales',status:'IN_PROGRESS',step_order:2,workflow_stage:{id:uuid(82),default_role:'SALES'}}];
  }
  if(method==='GET'&&p===`/projects/${fixture.pid}/milestones`&&mode==='start'){
   const v=result.body.data[0];result.body.data=[fixture.mid,uuid(80),uuid(81)].map((id,i)=>({...v,id,name:`Parallel ${i+1}`,step_order:i+1,pic_id:null,pic:null,status:startedMilestones.has(id)?'IN_PROGRESS':'CREATED',start_date:i===2?'2099-01-01':'2026-01-01',duration_working_days:i+1}));
  }
  return result;
 };
 const runtime=await launch(fixture,origin),{cdp,traffic}=runtime;
 const account=async role=>{fixture.state.role=role;await cdp.evaluate("localStorage.setItem('workflow.session',JSON.stringify({id:crypto.randomUUID(),accessToken:'synthetic-only',refreshToken:'synthetic-only'}))");};
 const button=text=>`[...document.querySelectorAll('main button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
 const seed=async legacy=>cdp.evaluate(`(async()=>{const pairA=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']),pairB=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);const devices=[{id:'${uuid(60)}',owner:'${fixture.user('SALES').id}',label:'Account A',registered:true,privateKey:pairA.privateKey,publicKey:await crypto.subtle.exportKey('jwk',pairA.publicKey)},{id:'${uuid(61)}',owner:'${fixture.user('SA').id}',label:'Account B',registered:true,privateKey:pairB.privateKey,publicKey:await crypto.subtle.exportKey('jwk',pairB.publicKey)}];if(${legacy})delete devices[0].label;const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('workflow-camera-device-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('device');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});await new Promise((resolve,reject)=>{const tx=db.transaction('device','readwrite'),s=tx.objectStore('device');s.clear();s.put(devices[0],${legacy}?'current':'account:'+devices[0].owner);s.put(devices[1],'account:'+devices[1].owner);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();})()`);
 try{
  await cdp.viewport(1440);await cdp.navigate(origin+'/login');await cdp.wait("document.querySelector('#email')",'login');await seed(false);
  await cdp.navigate(origin+'/login');await cdp.wait("document.querySelector('#face-account')?.options.length===3",'two registered accounts');
  assert.equal(await cdp.evaluate("document.querySelector('#face-account').value"),'','Account choice required when there is more than one');
  for(const n of [61,60]){await cdp.evaluate(`(()=>{const e=document.querySelector('#face-account');e.value='${uuid(n)}';e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await cdp.click(button(en.faceLogin.signIn));await cdp.wait(`document.querySelector('main').textContent.includes(${JSON.stringify(en.faceLogin.FACE_NONE)})`,'synthetic stopped challenge');assert.equal(starts.at(-1).deviceId,uuid(n));}
  checks.push('Two accounts select different signed device IDs; no camera used');
  await seed(true);await account('SALES');await cdp.navigate(origin+'/settings/face-verification');await cdp.wait("document.querySelector('#face-devices-heading')",'existing account settings');
  const stored=await cdp.evaluate(`(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('workflow-camera-device-v1',1);r.onsuccess=()=>resolve(r.result)});const values=await new Promise(resolve=>{const tx=db.transaction('device','readonly'),s=tx.objectStore('device'),keys=s.getAllKeys(),rows=s.getAll();tx.oncomplete=()=>resolve({keys:keys.result,rows:rows.result.map(v=>({id:v.id,owner:v.owner,registered:v.registered,label:v.label,extractable:v.privateKey.extractable}))})});db.close();return values})()`);
  assert(!stored.keys.includes('current'));assert.equal(stored.rows.length,2);assert(stored.rows.every(v=>v.registered&&!v.extractable));assert(stored.rows.some(v=>v.id===uuid(61)&&v.label==='Account B'));
  checks.push('Legacy current record migrates to its owner slot and preserves the other account and non-exportable keys');
  for(const locale of ['en','id'])for(const theme of ['light','dark']){
   fixture.state.locale=locale;await account('SALES');await cdp.evaluate(`localStorage.setItem('workflow-theme',${JSON.stringify(theme)})`);await cdp.navigate(origin+'/');
   await cdp.wait("document.querySelector('#next-task-heading')?.textContent==='Priority Task'",'priority dashboard');
   await cdp.wait(`document.documentElement.lang===${JSON.stringify(locale)}`,'dashboard locale');
   assert.equal(await cdp.evaluate("document.querySelector('#next-task-heading').parentElement.querySelectorAll('li').length"),12,'All equal deadlines shown');
   assert.equal(await cdp.evaluate("document.querySelector('#quick-insights-heading').parentElement.querySelectorAll('li').length"),14,'Task List includes dated and undated tasks');
   await cdp.wait("document.querySelector('[data-testid=sales-pipeline-summary]')",'phase-aware Sales summary');
   assert(await cdp.evaluate("document.querySelector('#sales-tender-heading').parentElement.parentElement.textContent.includes('On Progress Tender')"));
   assert(await cdp.evaluate("document.querySelector('#sales-result-heading').parentElement.parentElement.textContent.includes('Final Revenue')"));
   const filter="document.querySelector('select[aria-label="+JSON.stringify((locale==='en'?en:id).dashboardPage.revenuePhaseFilter)+"]')";
   await cdp.evaluate(`(()=>{const e=${filter};e.value='ON_SUBMISSION_TENDER';e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
   await cdp.wait("document.querySelector('.sales-delivery-row')?.textContent.includes('Revenue Tender')",'phase filter');
   assert.equal(await cdp.evaluate("document.querySelectorAll('.sales-delivery-row').length"),1);
   assert(await cdp.evaluate("document.querySelector('.sales-delivery-row').textContent.includes('On Progress Tender')"));
   await cdp.evaluate(`(()=>{const e=${filter};e.value='PRA_TENDER';e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await cdp.wait("document.querySelector('.sales-delivery-row')?.textContent.includes('Revenue Pra')",'pre-tender filter');
   assert(await cdp.evaluate("document.querySelector('.sales-delivery-row').textContent.includes('150')"));
   for(const width of [1440,360]){
    await cdp.viewport(width);assert(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await cdp.evaluate('window.scrollTo(0,0)');await cdp.screenshot(path.join(out,`dashboard-${locale}-${theme}-${width}.png`));
    const clip=await cdp.evaluate("(()=>{const r=document.querySelector('[data-testid=sales-pipeline-summary]').parentElement.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1}})()");
    const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});
    await fs.writeFile(path.join(out,`sales-pipeline-${locale}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
    if(width===1440){const heights=await cdp.evaluate("[...document.querySelectorAll('[data-testid=sales-pipeline-summary] section')].map(e=>e.getBoundingClientRect().height)");assert(Math.max(...heights)-Math.min(...heights)<2,'Pipeline cards align');}
    checks.push(`Dashboard ${locale}/${theme}/${width}: ties, Task List, phase filter, Sales Pipeline, Final Revenue, no overflow`);
   }
  }
  fixture.state.locale='id';await account('HEAD_SA');
  for(const theme of ['light','dark']){
   await cdp.evaluate(`localStorage.setItem('workflow-theme',${JSON.stringify(theme)})`);await cdp.navigate(origin+'/');
   await cdp.wait("document.querySelector('#head-sa-project-values-heading')?.textContent==='Project Pipeline'",'Head SA pipeline');
   assert(await cdp.evaluate("document.querySelector('#sales-pra-heading').parentElement.parentElement.textContent.includes('4')"));
   assert(await cdp.evaluate("document.querySelector('#sa-workload-heading')!==null"));
   for(const width of [1440,360]){
    await cdp.viewport(width);assert(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    assert(await cdp.evaluate("document.querySelector('#dashboard-summary-heading')===null"),'Head SA Workspace Summary is removed');
    await cdp.evaluate('window.scrollTo(0,0)');
    const clip=await cdp.evaluate("(()=>{const r=document.querySelector('#head-sa-project-values-heading').closest('section').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1}})()");
    const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});await fs.writeFile(path.join(out,`head-pipeline-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
    checks.push(`Head SA ${theme}/${width}: all-Sales scope, compact pipeline, Workspace Summary removed, SA Workload retained`);
   }
  }
  fixture.state.locale='en';mode='start';await account('SA');await cdp.viewport(1440);await cdp.navigate(origin+`/projects/${fixture.pid}`);
  for(const id of [fixture.mid,uuid(80),uuid(81)]){
   await cdp.wait(`document.querySelector('#project-milestone-${id}')`,'parallel milestone');
   const exp=`document.querySelector('#project-milestone-${id} button[aria-expanded]')`;
   if(await cdp.evaluate(`(${exp})?.getAttribute('aria-expanded')==='false'`))await cdp.click(exp);
  }
  const start=id=>`[...document.querySelectorAll('#project-milestone-${id} button')].find(e=>e.textContent.trim()===${JSON.stringify(en.workflowUpdate.start)})`;
  await cdp.wait(start(fixture.mid),'project PIC can start an unassigned stage');
  assert(await cdp.evaluate(`Boolean(${start(uuid(80))})`));assert(!await cdp.evaluate(`Boolean(${start(uuid(81))})`),'Future date cannot start');
  await cdp.click(start(fixture.mid));await cdp.wait(`!(${start(fixture.mid)})`,'first stage started');
  await cdp.click(start(uuid(80)));await cdp.wait(`!(${start(uuid(80))})`,'second stage starts without waiting for first completion');
  assert.equal(startedMilestones.size,2);checks.push('Project PIC starts two parallel stages without a milestone PIC; future start remains blocked');
  mode='evidence';await account('SALES');await cdp.navigate(origin+`/projects/${fixture.pid}`);
  const final=`document.querySelector('#project-milestone-${fixture.mid}')`;
  await cdp.wait(`(${final})?.textContent.includes('Final Sales')`,'final Sales stage');
  const complete=`[...(${final}).querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(en.outputScope.markComplete)})`;
  await cdp.wait(complete,'final completion button');await cdp.click(complete);await cdp.wait("document.querySelector('select[id^=outcome-]')",'outcome modal');
  await cdp.evaluate("(()=>{const s=document.querySelector('select[id^=outcome-]');s.value='WON';s.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await cdp.evaluate("(()=>{const e=document.querySelector('input[id^=contract-]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'150000000');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await cdp.evaluate("document.querySelector('select[id^=outcome-]').closest('form').requestSubmit()");
  await cdp.wait(`document.querySelector('select[id^=outcome-]')?.closest('form').textContent.includes(${JSON.stringify(en.workflowUpdate.evidenceRequired)})`,'evidence required');assert.equal(uploads,0);assert.equal(outcomes.length,0);
  await cdp.evaluate("(()=>{const e=document.querySelector('select[id^=outcome-]').closest('form').querySelector('input[type=file]'),dt=new DataTransfer();dt.items.add(new File(['%PDF-synthetic'],'evidence.pdf',{type:'application/pdf'}));e.files=dt.files;e.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await cdp.evaluate("document.querySelector('select[id^=outcome-]').closest('form').requestSubmit()");await pause(100);await cdp.evaluate("document.querySelector('select[id^=outcome-]').closest('form').requestSubmit()");
  await cdp.wait(`document.querySelector('select[id^=outcome-]')?.closest('form')?.textContent.includes(${JSON.stringify(en.projectDetail.finalCompletionFailed)})`,'retry after uncertain save');
  assert.equal(uploads,1);await cdp.evaluate("document.querySelector('select[id^=outcome-]').closest('form').requestSubmit()");await cdp.wait("!document.querySelector('select[id^=outcome-]')?.closest('form')",'outcome saved');
  assert.equal(uploads,1,'Uploaded evidence reused on outcome retry');assert.equal(outcomes.length,2);assert.deepEqual(outcomes[0].evidence_document_ids,[uuid(90)]);assert.deepEqual(outcomes[1],outcomes[0]);
  checks.push('Final outcome requires evidence; retry reuses the same uploaded document IDs');
  assert.deepEqual(traffic.errors,[]);assert.deepEqual(fixture.state.unknown,[]);
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({checks,starts:starts.map(v=>({deviceId:v.deviceId})),uploads,outcomeAttempts:outcomes.length,errors:traffic.errors},null,2));console.log(JSON.stringify({passed:checks.length,uploads,outcomeAttempts:outcomes.length}));
 }catch(error){await cdp.screenshot(path.join(out,'failure.png')).catch(()=>{});await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({checks,unknown:fixture.state.unknown,errors:traffic.errors},null,2));throw error;}finally{await runtime.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
