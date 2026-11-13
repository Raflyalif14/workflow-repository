const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {createFixture}=require('./fixtures.cjs'),{launch}=require('./cdp.cjs');
const origin=process.env.WORKFLOW_TEST_ORIGIN||'http://127.0.0.1:3000';
async function main(){
 const fixture=createFixture(),base=fixture.respond;fixture.state.role='SALES';
 const phase='90000000-0000-4000-8000-000000000003',changes=[];let effective=['proposal_deck_solusi','assessment'];
 const ok=data=>({status:200,body:{success:true,data}});
 fixture.respond=(url,method,raw)=>{
  const path=new URL(url).pathname.replace(/^\/api/,'');
  if(path===`/projects/${fixture.pid}/scope-changes`&&method==='GET')return ok(changes);
  if(path===`/projects/${fixture.pid}/scope-changes`&&method==='POST'){
   const input=JSON.parse(raw);assert(input.reason.trim());assert(input.additions.length===1);assert(input.expected_updated_at);
   changes.unshift({id:input.request_id,project_id:fixture.pid,phase_id:phase,requested_at:new Date().toISOString(),reason:input.reason,
    before_keys:[...effective],proposal:{...input,additions:input.additions.map(item=>({...item,due_date:item.start_date}))},status:'PENDING'});return ok(changes[0]);
  }
  if(path.startsWith(`/projects/${fixture.pid}/scope-changes/`)&&method==='POST'){
   const input=JSON.parse(raw),change=changes.find(item=>path.endsWith(item.id));assert(change);assert.equal(fixture.state.role,'HEAD_SA');
   if(input.decision==='APPROVED')effective=change.proposal.selected_keys;
   change.status=input.decision;change.review_note=input.note||null;return ok(change);
  }
  if(path===`/projects/${fixture.pid}/output-documents`){
   const template=base(url,method,raw)?.body?.data?.documents?.[0]||{projectId:fixture.pid,milestoneId:'90000000-0000-4000-8000-000000000002',group:'PRA_TENDER'};
   return ok({scenarioKey:'PRA_TENDER',isScopeLocked:true,canSubmit:false,canRetryCompletion:false,missingMandatoryCount:1,missingMandatoryNames:[],unapprovedCount:1,
    documents:fixture.state.role==='SALES'?[]:['proposal_deck_solusi','assessment','timeline_proyek'].map((key,index)=>({...template,id:'output'+index,key,name:key,group:'PRA_TENDER',isRequired:index===0,isSelected:effective.includes(key),status:effective.includes(key)?'TO_DO':'NOT_REQUIRED',draftFiles:[],files:[],draftRevision:0,currentVersionId:null,fileName:null,reviewedBy:null,reviewedAt:null})),scopeCatalog:fixture.state.role==='SALES'?['proposal_deck_solusi','assessment','timeline_proyek'].map((key,index)=>({key,name:key,group:'PRA_TENDER',milestoneId:template.milestoneId,isRequired:index===0,isSelected:effective.includes(key),protected:false})):undefined});
  }
  if(path==='/approvals/overview')return ok({stats:{totalPending:changes.filter(item=>item.status==='PENDING').length,pendingDocs:0,pendingProjectPlans:changes.filter(item=>item.status==='PENDING').length,pendingDeadlines:0},items:changes.map(item=>({...item,category:'PROJECT_SCOPE',title:'Project plan change',projectId:fixture.pid,projectName:'Synthetic scope project',projectCode:'',clientName:'Synthetic customer',targetEntityId:item.id,requestedAt:item.requested_at,submittedAt:item.requested_at,submittedBy:'Sales',requestNote:item.reason,isCurrentApproval:true}))});
  return base(url,method,raw);
 };
 const runtime=await launch(fixture,origin),{cdp}=runtime;
 const button=(text,root='document')=>`[...${root}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
 async function account(role,path){fixture.state.role=role;await cdp.navigate(origin+'/login');await cdp.evaluate("localStorage.setItem('workflow.session',JSON.stringify({id:crypto.randomUUID(),accessToken:'synthetic-only',refreshToken:'synthetic-only'}));localStorage.setItem('workflow-locale','en');");await cdp.navigate(origin+path);}
 try{
  await cdp.viewport(1440,1000);await account('SALES',`/projects/${fixture.pid}#project-scope-changes`);
  await cdp.wait("document.querySelector('#project-scope-changes')?.innerText.includes('No plan changes awaiting review')",'scope section',60000);
  await cdp.click(button('Request plan change',"document.querySelector('#project-scope-changes')"));
  await cdp.wait("[...document.querySelectorAll('h3')].some(e=>e.textContent==='Request plan change')",'request form');
  await cdp.click("[...document.querySelectorAll('input[type=checkbox]')].at(-1)");
  await cdp.evaluate("document.querySelector('textarea[required]').focus()");
  await cdp.send('Input.insertText',{text:'Add output for the revised customer scope'});
  await cdp.click(button('Send to Head SA'));
  await cdp.wait("document.querySelector('#project-scope-changes')?.innerText.includes('Add output for the revised customer scope')",'request saved');
  assert.equal(changes.length,1);assert.equal(effective.length,2,'request does not change effective plan');
  await account('HEAD_SA','/approvals');
  await cdp.wait("document.body.innerText.includes('Add output for the revised customer scope')",'scope approval queue',60000);
  await cdp.click(button('View details'));
  await cdp.wait("location.hash==='#project-scope-changes'&&document.querySelector('#project-scope-changes')?.innerText.includes('Add output for the revised customer scope')",'review deep link');
  await cdp.screenshot('.cache/scope-review.png');
  await cdp.click(button('Approve',"document.querySelector('#project-scope-changes')"));
  await cdp.wait("document.querySelector('#project-scope-changes')?.innerText.includes('No plan changes awaiting review')",'approval applied');
  assert.equal(effective.length,3);assert.equal(changes[0].status,'APPROVED');
  await cdp.click(button('Show change history',"document.querySelector('#project-scope-changes')"));
  assert(await cdp.evaluate("document.querySelector('#project-scope-changes').innerText.includes('Approved')"));
  await cdp.viewport(390,844);assert(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'),'no mobile overflow');
  await cdp.screenshot('.cache/scope-history-mobile.png');
  assert.equal(runtime.traffic.errors.length,0,JSON.stringify(runtime.traffic.errors));
  console.log('PASS Sales request, unchanged effective plan, unified Approvals queue/deep link, Head SA approval, history and mobile; synthetic API');
 }finally{await runtime.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
