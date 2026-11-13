const assert=require('node:assert/strict');
const {createFixture}=require('./fixtures.cjs'),{launch}=require('./cdp.cjs');
const origin=process.env.WORKFLOW_TEST_ORIGIN||'http://127.0.0.1:3000';
async function main(){
 const fixture=createFixture(),base=fixture.respond;fixture.state.role='SALES';
 let configured=false,status='NOT_CONNECTED',disconnects=0,completions=0;
 fixture.respond=(url,method,raw)=>{
  if(method==='OPTIONS')return base(url,method,raw);
  const path=new URL(url).pathname.replace(/^\/api/,'');
  if(path==='/google-calendar/status')return {status:200,body:{success:true,data:{configured,status,lastSyncedAt:null,lastError:null}}};
  if(path==='/google-calendar/disconnect'){assert.equal(method,'POST');disconnects++;status='DISCONNECTING';return {status:200,body:{success:true,data:{disconnecting:true}}};}
  if(path==='/google-calendar/complete'){assert.equal(method,'POST');assert.deepEqual(JSON.parse(raw),{code:'synthetic-code',state:'synthetic-state'});completions++;return {status:200,body:{success:true,data:{connected:true}}};}
  return base(url,method,raw);
 };
 const runtime=await launch(fixture,origin),{cdp}=runtime;
 const button=text=>`[...document.querySelectorAll('#google-calendar button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
 try{
  await cdp.navigate(origin+'/login');await cdp.evaluate("localStorage.setItem('workflow.session',JSON.stringify({id:crypto.randomUUID(),accessToken:'synthetic-only',refreshToken:'synthetic-only'}));localStorage.setItem('workflow-locale','en');");
  await cdp.navigate(origin+'/settings');
  await cdp.wait("document.querySelector('#google-calendar')?.innerText.includes('not configured yet')",'unconfigured integration',60000);
  assert(!await cdp.evaluate(`Boolean(${button('Connect Google Calendar')})`));
  configured=true;await cdp.navigate(origin+'/settings');
  await cdp.wait(`Boolean(${button('Connect Google Calendar')})`,'connect available',60000);
  status='CONNECTED';await cdp.navigate(origin+'/settings');
  await cdp.wait(`Boolean(${button('Disconnect Google Calendar')})`,'connected settings',60000);
  await cdp.click(button('Disconnect Google Calendar'));
  await cdp.wait("document.querySelector('#google-calendar').innerText.includes('entire dedicated')",'explicit disconnect confirmation');
  assert.equal(disconnects,0,'Opening confirmation does not disconnect');
  await cdp.click("[...document.querySelectorAll('#google-calendar button')].filter(b=>b.textContent==='Disconnect Google Calendar').at(-1)");
  await cdp.wait("document.querySelector('#google-calendar').innerText.includes('Disconnecting')",'disconnect pending');
  assert.equal(disconnects,1);
  await cdp.viewport(390,844);assert(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'),'mobile width');
  await cdp.navigate(origin+'/settings/google-calendar/callback?code=synthetic-code&state=synthetic-state');
  await cdp.wait("document.body.innerText.includes('Google Calendar connected')",'authenticated callback',60000);
  assert.equal(completions,1,'Callback completes once, including React strict effects');
  assert.equal(await cdp.evaluate('location.search'),'','OAuth code removed from address bar');
  assert.equal(runtime.traffic.errors.length,0,JSON.stringify(runtime.traffic.errors));
  console.log('PASS unconfigured, connect/connected states, confirmed disconnect, callback and mobile with synthetic API');
 }finally{await runtime.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
