'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {launch}=require('./cdp.cjs'),{createFixture}=require('./fixtures.cjs');
require('../register.cjs');const {en}=require('../../src/i18n/en'),{id}=require('../../src/i18n/id');
const origin=process.env.WORKFLOW_TEST_ORIGIN||'http://127.0.0.1:3036';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Loopback only');
async function main(){
 const fixture=createFixture(),base=fixture.respond,out=path.resolve(__dirname,'../../../.cache/list-summaries');
 fixture.state.role='HEAD_SA';await fs.mkdir(out,{recursive:true});
 fixture.respond=(url,method,body)=>{const result=base(url,method,body),p=new URL(url).pathname.replace(/^\/api/,'');
  if(method==='GET'&&p==='/projects'&&result.body?.data?.pagination)Object.assign(result.body.data.pagination,{total:24,totalPages:3});
  return result;
 };
 const runtime=await launch(fixture,origin),{cdp,traffic}=runtime,checks=[];
 try{
  await cdp.navigate(origin+'/login');await cdp.evaluate("localStorage.setItem('workflow.session',JSON.stringify({id:crypto.randomUUID(),accessToken:'synthetic-only',refreshToken:'synthetic-only'}))");
  for(const locale of ['en','id'])for(const theme of ['light','dark']){
   fixture.state.locale=locale;await cdp.evaluate(`localStorage.setItem('workflow-theme',${JSON.stringify(theme)})`);
   const dictionary=locale==='en'?en:id;
   for(const page of ['projects','milestones','documents','approvals']){
    await cdp.navigate(origin+'/'+page);await cdp.wait("document.querySelector('[data-testid=list-summary]')",page+' summary');
    await cdp.wait("document.querySelectorAll('[data-summary-value]').length===4",page+' counts loaded');
    assert.equal(await cdp.evaluate('document.documentElement.lang'),locale);
    if(page==='projects'){
     assert.deepEqual(await cdp.evaluate("[...document.querySelectorAll('[data-summary-value]')].map(e=>Number(e.dataset.summaryValue))"),[24,1,2,1]);
     assert(await cdp.evaluate(`document.querySelector('[data-testid=list-summary]').textContent.includes(${JSON.stringify(dictionary.listSummary.allResults)})`));
     assert(await cdp.evaluate(`document.querySelector('[data-testid=list-summary]').textContent.includes(${JSON.stringify(dictionary.listSummary.thisPage)})`));
    }
    if(page==='approvals'){
     const before=await cdp.evaluate("[...document.querySelectorAll('[data-summary-value]')].map(e=>e.dataset.summaryValue)");
     const history=`[...document.querySelectorAll('main button')].find(e=>e.textContent.trim()===${JSON.stringify(dictionary.approvalUi.history)})`;
     await cdp.click(history);assert.deepEqual(await cdp.evaluate("[...document.querySelectorAll('[data-summary-value]')].map(e=>e.dataset.summaryValue)"),before,'Pending overview is independent of History');
    }
    for(const width of [1440,360]){
     await cdp.viewport(width);assert(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`${page} overflow`);
     await cdp.evaluate('window.scrollTo(0,0)');
     const clip=await cdp.evaluate("(()=>{const r=document.querySelector('[data-testid=list-summary]').getBoundingClientRect();return{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1}})()");
     const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});await fs.writeFile(path.join(out,`${page}-${locale}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
     checks.push(`${page}/${locale}/${theme}/${width}`);
    }
   }
  }
  assert.deepEqual(traffic.errors,[]);assert.deepEqual(fixture.state.unknown,[]);
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors:traffic.errors},null,2));console.log(JSON.stringify({passed:checks.length}));
 }finally{await runtime.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
