// Isolated synthetic API fixtures. No requests are sent to Supabase or real application API.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {launch}=require('./cdp.cjs'),{createFixture}=require('./fixtures.cjs');
require('../register.cjs');const {en}=require('../../src/i18n/en'),{id}=require('../../src/i18n/id');
const origin=process.env.WORKFLOW_TEST_ORIGIN||'http://127.0.0.1:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Loopback only');
const pid='90000000-0000-4000-8000-000000000001';
async function main(){
 const fixture=createFixture(),base=fixture.respond;let meetings=[],mutations=0;
 const out=path.resolve(__dirname,'../../../.cache/project-meeting-ui');await fs.mkdir(out,{recursive:true});
 fixture.respond=(url,method,body)=>{
  const u=new URL(url),p=u.pathname.replace(/^\/api/,'');
  const ok=data=>({status:200,body:{success:true,data}});
  if(p.startsWith('/calendar/')){
   if(method==='OPTIONS')return {status:204};
   if(method==='GET'&&p===`/calendar/projects/${pid}/meetings/synthetic-meeting`)return ok(meetings[0]);
   if(method==='GET'&&p==='/calendar/meetings'){
    let rows=meetings.filter(m=>!u.searchParams.get('status')||m.status===u.searchParams.get('status')||(u.searchParams.get('status')==='PENDING'&&m.proposedSchedule));
    if(fixture.state.role==='SA')rows=rows.filter(m=>m.status==='APPROVED');
    return ok({items:rows,total:rows.length,page:1,totalPages:1});
   }
   if(method==='GET'&&p==='/calendar/events')return ok(meetings.filter(m=>m.status==='APPROVED').map(m=>({id:'meeting:'+m.id,kind:'meeting',title:m.title,projectId:pid,projectName:m.projectName,start:m.startsAt,end:m.endsAt,allDay:false,status:'APPROVED',href:`/projects/${pid}#project-meetings`,picName:m.picName})).concat(['milestone-start','milestone-due'].map((kind,index)=>({id:kind,kind,title:index?'Submit tender proposal':'Prepare technical proposal',projectId:pid,projectName:'Synthetic milestone project',start:new Date(Date.now()+2*86400000).toLocaleDateString('en-CA'),end:new Date(Date.now()+2*86400000).toLocaleDateString('en-CA'),allDay:true,status:'IN_PROGRESS',href:`/projects/${pid}`}))));
   if(method==='POST'&&p.endsWith('/meeting-conflicts'))return ok({count:1,limited:true,noPic:false});
   if(method==='POST'&&p.endsWith('/minutes')){const data=JSON.parse(body);assert(data.completed);assert(data.notes);assert.equal(data.revision,meetings[0].revision);mutations++;meetings[0].minutes={notes:data.notes,decisions:data.decisions,followUp:data.followUp};meetings[0].minutesUpdatedAt=new Date().toISOString();meetings[0].minutesAuthor='Synthetic SA';meetings[0].revision++;return ok({id:meetings[0].id});}
   if(method==='POST'){
    const data=JSON.parse(body);assert(data.requestId);mutations++;
    if(p.endsWith('/meetings')){
     assert.equal(fixture.state.role,'SALES');assert.equal(data.endsAt,null,'Unknown end must stay unset');
     meetings.push({...data,id:'synthetic-meeting',projectId:pid,projectName:'Synthetic meeting project',picName:'Synthetic PIC',status:'PENDING',revision:1,reviewNote:null});
    }else{
     if(data.action==='RESCHEDULE'){assert.equal(fixture.state.role,'SALES');meetings[0].proposedSchedule=data;}else {assert.equal(fixture.state.role,'HEAD_SA');if(data.action==='APPROVE_RESCHEDULE'){Object.assign(meetings[0],meetings[0].proposedSchedule);meetings[0].proposedSchedule=null;}else assert.equal(data.action,'APPROVE');meetings[0].status='APPROVED';}meetings[0].revision++;
    }
    return ok({id:'synthetic-meeting',status:meetings[0].status});
   }
   throw Error('Unexpected calendar request '+method+' '+p);
  }
  const response=base(url,method,body);
  // The actual project DTO exposes the assignment as nested pic, not pic_id.
  if(method==='GET'&&p===`/projects/${pid}`&&response.body?.data){delete response.body.data.pic_id;}
  return response;
 };
 const runtime=await launch(fixture,origin),{cdp,traffic}=runtime;
 const button=text=>`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
 const seed=async(role,locale='en')=>{
  fixture.state.role=role;fixture.state.locale=locale;
  await cdp.navigate(origin+'/login');
  await cdp.evaluate(`localStorage.setItem('workflow.session',JSON.stringify({id:crypto.randomUUID(),accessToken:'synthetic-only',refreshToken:'synthetic-only'}));localStorage.setItem('workflow-locale',${JSON.stringify(locale)});`);
 };
 try{
  await seed('SALES');await cdp.navigate(origin+'/projects/'+pid);await cdp.wait(button(en.meetings.request),'meeting request control',60000);
  await cdp.click(button(en.meetings.request));
  const fill=async(label,value)=>{
   await cdp.evaluate(`(()=>{const l=[...document.querySelectorAll('label')].find(e=>e.querySelector('span')?.textContent.startsWith(${JSON.stringify(label)}));const input=l?.querySelector('input,textarea');if(!input)throw Error('Missing input');Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  };
  assert(await cdp.evaluate(`(()=>{const fields=[...document.querySelectorAll('form input')];return fields.filter(e=>e.required).length===2&&fields.filter(e=>e.type==='datetime-local'&&!e.required).length===1&&document.body.textContent.includes(${JSON.stringify(en.meetings.requiredHelp)});})()`),'Required fields and optional end are indicated');
  const future=new Date();future.setDate(future.getDate()+2);future.setHours(10,0,0,0);
  const local=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  await fill(en.meetings.name,'Synthetic planning meeting');await fill(en.meetings.starts,local(future));await fill(en.meetings.agenda,'Synthetic agenda');
  await cdp.wait(`document.body.textContent.includes(${JSON.stringify(en.meetings.overlapWarning.replace('{count}','1'))})`,'conflict warning');
  assert(await cdp.evaluate(`document.body.textContent.includes(${JSON.stringify(en.meetings.limitedCheck)})`));
  await cdp.click(button(en.meetings.submit));await cdp.wait(`document.querySelector('#project-meetings').textContent.includes(${JSON.stringify(en.meetings.PENDING)})`,'pending meeting');
  await seed('HEAD_SA');await cdp.navigate(origin+'/calendar');await cdp.wait(button(en.meetings.approve),'Head SA approval',60000);
  await cdp.click(button(en.meetings.approve));await cdp.click(button(en.meetingReview.approve));await cdp.wait(`document.body.textContent.includes(${JSON.stringify(en.meetings.noPending)})`,'approved queue');
  await cdp.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.includes('Synthetic planning meeting'))",'meeting on calendar');
  await cdp.click("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Synthetic planning meeting'))");
  await cdp.wait("document.querySelector('[data-testid=calendar-agenda]').textContent.includes('Synthetic planning meeting')",'selected day agenda');
  assert(await cdp.evaluate(`document.querySelector('[data-testid=calendar-agenda]').textContent.includes(${JSON.stringify(en.meetings.endUnknown)})`),'Calendar shows unknown end without an invalid date');
  const originalStart=meetings[0].startsAt;
  await seed('SALES');await cdp.navigate(origin+'/projects/'+pid);await cdp.wait(button(en.meetings.reschedule),'reschedule button');await cdp.click(button(en.meetings.reschedule));
  assert(await cdp.evaluate("[...document.querySelectorAll('input')].some(e=>e.value==='Synthetic planning meeting')"),'Existing title is prefilled');
  future.setDate(future.getDate()+1);await fill(en.meetings.starts,local(future));await cdp.click(button(en.meetings.submit));
  await cdp.wait(`document.body.textContent.includes(${JSON.stringify(en.meetings.reschedulePending)})`,'reschedule pending');assert.equal(meetings[0].startsAt,originalStart);
  await seed('HEAD_SA');await cdp.navigate(origin+'/calendar');await cdp.wait(button(en.meetings.approve),'reschedule approval');await cdp.click(button(en.meetings.approve));await cdp.click(button(en.meetingReview.approveReschedule));await cdp.wait(`document.body.textContent.includes(${JSON.stringify(en.meetings.noPending)})`,'reschedule approved');
  assert.notEqual(meetings[0].startsAt,originalStart);assert.equal(meetings[0].proposedSchedule,null);
  for(const [role,locale] of [['HEAD_SA','en'],['SA','id']]){
   await seed(role,locale);await cdp.navigate(origin+'/calendar');await cdp.wait("document.querySelector('select')",'calendar filters');
   await cdp.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.includes('Synthetic planning meeting'))",'role calendar events');
   await cdp.click("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Synthetic planning meeting'))");
   for(const width of [1440,390]){await cdp.viewport(width);assert(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`${role} ${width} overflow`);await cdp.evaluate('window.scrollTo(0,0);new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await cdp.screenshot(path.join(out,`${role}-${locale}-${width}.png`));}
   if(role==='SA')assert(!await cdp.evaluate(`document.body.textContent.includes(${JSON.stringify(id.meetings.pendingTitle)})`));
  }
  meetings[0].startsAt=new Date(Date.now()-7200000).toISOString();meetings[0].endsAt=null;
  await seed('SA');await cdp.navigate(origin+'/projects/'+pid);await cdp.wait(button(en.meetings.addMinutes),'SA add MoM');await cdp.click(button(en.meetings.addMinutes));
  await fill(en.meetings.notes,'Synthetic meeting notes');await fill(en.meetings.decisions,'Proceed with proposal');await fill(en.meetings.followUp,'SA prepares proposal next week');
  await cdp.click("document.querySelector('input[type=checkbox]')");await cdp.click(button(en.meetings.saveMinutes));
  await cdp.wait(button(en.meetings.editMinutes),'MoM saved');
  await seed('HEAD_SA');await cdp.navigate(origin+'/projects/'+pid);await cdp.wait("document.body.textContent.includes('Synthetic meeting notes')",'saved MoM shared with Head SA');
  assert(await cdp.evaluate("document.body.textContent.includes('SA prepares proposal next week')"));
  const downloads=path.join(out,'downloads');await fs.mkdir(downloads,{recursive:true});
  for(const name of await fs.readdir(downloads)){if(name.startsWith('MoM-')&&name.endsWith('.pdf'))await fs.unlink(path.join(downloads,name));}
  await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await cdp.wait(button(en.meetings.exportMinutes),'MoM PDF export');await cdp.click(button(en.meetings.exportMinutes));
  let exported;for(let i=0;i<80;i++){exported=(await fs.readdir(downloads)).find(name=>name.startsWith('MoM-')&&name.endsWith('.pdf'));if(exported)break;await new Promise(resolve=>setTimeout(resolve,250));}
  assert(exported,'MoM PDF downloaded');assert.equal((await fs.readFile(path.join(downloads,exported))).subarray(0,5).toString(),'%PDF-');
  assert.equal(mutations,5);assert(!traffic.api.some(r=>!['GET','OPTIONS'].includes(r.method)&&!r.path.includes('/calendar/')));
  assert.equal(traffic.errors.length,0,traffic.errors.join('\n'));
  console.log('PASS browser: request/conflict warning, approval, reschedule, SA MoM save and Head read, calendar, EN/ID, desktop/mobile; isolated fixtures');
 }catch(error){await cdp.screenshot(path.join(out,'failure.png')).catch(()=>{});throw error;}finally{await runtime.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
