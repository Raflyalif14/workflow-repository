'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFixture}=require('./fixtures.cjs');
const get=(f,p)=>f.respond('http://localhost:5000/api'+p,'GET');
test('Unknown reads and writes fail closed; no generic success fallback',()=>{
 const f=createFixture();
 assert.deepEqual(get(f,'/face-login/capabilities').body.data,{enabled:false});
 assert.equal(f.state.unknown.length,0,'Camera availability is explicitly disabled for UI fixtures');
 assert.equal(get(f,'/not-configured').status,501);
 assert.equal(f.respond('http://localhost:5000/api/projects/fixture','DELETE').status,501);
 assert.equal(f.state.unknown.length,2);
});
test('Synthetic session changes use distinct identities and language preferences',()=>{
 const f=createFixture();const before=get(f,'/auth/me').body.data.id;
 f.state.account=2;assert.notEqual(get(f,'/auth/me').body.data.id,before);
 const result=f.respond('http://localhost:5000/api/auth/login','POST',JSON.stringify({email:'head_sa@fixture.invalid',password:'synthetic'}));
 assert.equal(result.body.data.user.role,'HEAD_SA');assert.match(result.body.data.accessToken,/^fixture-only-/);
 f.respond('http://localhost:5000/api/auth/preferences/language','PUT','{"language":"id"}');
 assert.equal(get(f,'/auth/preferences/language').body.data.language,'id');
});
test('Activity fixtures have 17 distinct ordered items across actual 8/8/1 cursor responses',()=>{
 const f=createFixture(),first=get(f,'/dashboard').body.data;
 const second=get(f,'/dashboard/activity?cursor='+first.recentActivityPagination.nextCursor).body.data;
 const last=get(f,'/dashboard/activity?cursor='+second.nextCursor).body.data;
 assert.deepEqual([first.recentActivity.length,second.items.length,last.items.length],[8,8,1]);assert.equal(last.nextCursor,null);
 const all=[...first.recentActivity,...second.items,...last.items];assert.equal(new Set(all.map(x=>x.id)).size,17);
 assert(all.every((x,i)=>i===0||Date.parse(all[i-1].createdAt)>Date.parse(x.createdAt)));
 f.state.activityFailure=true;assert.equal(get(f,'/dashboard/activity').status,503);
 f.state.activityFailure=false;f.state.empty=true;assert.equal(get(f,'/dashboard').body.data.recentActivity.length,0);
});
test('Numbered activity fixture pages include exact totals and direct last-page access',()=>{
 const f=createFixture(),first=get(f,'/dashboard').body.data.recentActivityPagination;
 assert.equal(first.total,17);assert.equal(first.totalPages,3);assert.equal(first.page,1);
 const last=get(f,'/dashboard/activity?page=3').body.data;
 assert.equal(last.page,3);assert.equal(last.items.length,1);assert.equal(last.total,17);
 assert.equal(get(f,'/dashboard/activity?page=999').body.data.page,3);
});
test('Activity filter fixtures combine project, kind and date before count and paging',()=>{
 const f=createFixture();Object.assign(f.state,{activityCount:33,activityMixed:true});
 const data=get(f,`/dashboard/activity?page=2&projectId=${f.pid}&kind=DOCUMENT&from=2026-10-08T00:00:00Z&to=2026-10-09T00:00:00Z`).body.data;
 assert.equal(data.total,9);assert.equal(data.totalPages,2);assert.equal(data.items.length,1);
 assert(data.items.every(a=>a.project.id===f.pid&&a.action==='OUTPUT_DRAFT_ADD'));
 assert.equal(get(f,'/dashboard/activity?page=1&kind=ASSIGNMENT').body.data.total,0);
});
test('Role fixtures provide review/revision links without pretending to verify backend authorization',()=>{
 const f=createFixture();for(const role of ['SALES','SA','HEAD_SA','SUPER_ADMIN']){
  f.state.role=role;const d=get(f,'/dashboard').body.data;
  assert.equal(d.outputDocuments.reviewQueue.length,role==='HEAD_SA'?1:0);
  assert.equal(d.outputDocuments.revisionQueue.length,role==='SA'?1:0);
  assert.equal(get(f,'/approvals/overview').status,['HEAD_SA','SUPER_ADMIN'].includes(role)?200:403);
 }
});
