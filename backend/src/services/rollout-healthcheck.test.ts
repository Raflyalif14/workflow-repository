import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const sql=readFileSync(path.join(__dirname,'../../supabase/workflow-healthcheck.sql'),'utf8');
type Spec={name:string;deps:Record<string,string[]>;query:string;kind:string;expected:string};
const specs:Spec[]=[];
const pattern=/\('([^']+)',\s*'((?:''|[^'])*)'::jsonb,\$read\$([\s\S]*?)\$read\$,'(mismatch|review|runtime|inventory)','((?:''|[^'])*)'\)/g;
for(const match of sql.matchAll(pattern))specs.push({name:match[1],deps:JSON.parse(match[2].replace(/''/g,"'")),query:match[3],kind:match[4],expected:match[5]});
assert(specs.length>=40,'The shipped healthcheck must expose its guarded count specs');
assert.equal(new Set(specs.map(s=>s.name)).size,specs.length);
const columns=new Map<string,string>();
for(const match of sql.matchAll(/\('public\.([a-z_]+)','([a-z_]+)','(jsonb|)'\)/g))columns.set(`${match[1]}.${match[2]}`,match[3]);
const prohibited=/\b(insert|update|delete|truncate|create|alter|drop|grant|revoke|call|do|execute|setval|nextval|dblink)\b/i;
const strip=(text:string)=>text.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/'(?:''|[^'])*'/g,"''");
for(const spec of specs){
  assert(/^select count\(\*\) as n /i.test(spec.query),`${spec.name}: return only one count, never raw content`);
  assert(!spec.query.includes(';'),`${spec.name}: exactly one read query`);
  assert(!prohibited.test(strip(spec.query)),`${spec.name}: no write operations`);
  const tables=[...spec.query.matchAll(/\b(?:from|join)\s+public\.([a-z_]+)/gi)].map(m=>m[1]);
  assert(tables.every(table=>table in spec.deps),`${spec.name}: every referenced table needs a schema/visibility guard`);
  for(const [table,required] of Object.entries(spec.deps))for(const col of required)
    assert(columns.has(`${table}.${col}`),`${spec.name}: ${table}.${col} must be introspected`);
  assert(!/\bpublic\.\w+\s*\(/i.test(spec.query),'No business/helper RPC calls, even from SELECT');
}
const outer=strip(sql.replace(/\$read\$[\s\S]*?\$read\$/g,"''"));
assert(!prohibited.test(outer),'Top-level healthcheck must be a single SELECT, not a DO/temp helper');
assert.equal((outer.match(/;/g)||[]).length,1,'One statement and one result set');
assert(sql.trimEnd().endsWith('select check_name,status,observed,expected from results order by check_name;'));
assert(!/::reg(class|procedure)\b/i.test(outer),'Missing objects cannot be eagerly cast');
assert(sql.includes('pg_catalog.to_regclass')&&sql.includes('pg_catalog.to_regprocedure'));
assert(sql.includes('case when schema_present and safe_to_read then'),'Read must be protected by CASE, not optimizer-dependent WHERE ordering');
assert(sql.includes('me.rolsuper or me.rolbypassrls')&&sql.includes('c.relkind in (\'r\',\'p\')'),'Filtered RLS/views cannot yield a fake zero count');
assert(sql.includes('i.indisunique and i.indisvalid'),'An empty table alone does not establish idempotency uniqueness');
assert(sql.includes('private core: no client/service EXECUTE'));
assert(sql.includes('existing service grant/policy is legitimate'),'Service grants on model-authorized tables are not automatically a leak');

// Schema/visibility fixtures validate coverage and intended branch outcomes only.
// They do NOT execute SQL, reproduce PostgreSQL planning, or prove live locking.
type Fixture={missing:Set<string>;wrongType:Set<string>;visible:boolean};
const complete=():Fixture=>({missing:new Set(),wrongType:new Set(),visible:true});
function decision(spec:Spec,fixture:Fixture,n:number){
  const deps=Object.entries(spec.deps).flatMap(([table,cols])=>[table,...cols.map(c=>`${table}.${c}`)]);
  if(deps.some(d=>fixture.missing.has(d)))return 'MISSING';
  if(!fixture.visible||deps.some(d=>fixture.wrongType.has(d)))return 'NEEDS_REVIEW';
  if(spec.kind==='runtime')return 'NEEDS_RUNTIME_CHECK';
  if(spec.kind==='inventory'||n===0)return 'PASS';
  return spec.kind==='review'?'NEEDS_REVIEW':'FAIL';
}
const spec=(name:string)=>{const s=specs.find(s=>s.name===name);assert(s);return s;};
const phase=spec('relations.ready_active_phase');assert.equal(decision(phase,complete(),0),'PASS');assert.equal(decision(phase,complete(),1),'FAIL');
const missing=complete();missing.missing.add('project_phases');assert.equal(decision(phase,missing,0),'MISSING');
missing.missing.clear();missing.missing.add('projects.current_scenario_id');assert.equal(decision(phase,missing,0),'MISSING');
const filtered=complete();filtered.visible=false;assert.equal(decision(phase,filtered,0),'NEEDS_REVIEW');
const drift=complete();drift.wrongType.add('project_pic_requests.result');assert.equal(decision(spec('receipts.pic_shape'),drift,0),'NEEDS_REVIEW');
assert.equal(decision(spec('create.active_jobs'),complete(),2),'NEEDS_RUNTIME_CHECK','A legitimate active lease must not be a mismatch');
assert.equal(decision(spec('create.active_jobs'),complete(),0),'NEEDS_RUNTIME_CHECK','No jobs cannot prove concurrency/retry');
assert.equal(decision(spec('create.expired_or_released_jobs'),complete(),1),'NEEDS_REVIEW');
assert(spec('create.expired_or_released_jobs').query.includes("interval '10 minutes'"));
assert.equal(decision(spec('create.deletion_tombstones'),complete(),3),'PASS','Deleted committed-project receipts are valid tombstones');
assert(spec('create.live_receipt_audit').query.includes("r.status='COMMITTED'"),'Historical projects must not be required to have new receipts');
assert.equal(decision(spec('legacy.classification_inventory'),complete(),1),'NEEDS_REVIEW');
assert(spec('ops.outbox_pending_failed').query.includes('delivered_at is null and attempt_count>0'),'Delivered historical errors must not be counted as active failures');
assert.equal(decision(spec('ops.cleanup_pending'),complete(),1),'NEEDS_REVIEW','Pending cleanup has no invented timeout/status');
console.log(`Read-only healthcheck: ${specs.length} aggregate queries, schema/type/visibility guards, no writes/business RPCs, one result set, missing/empty/lease/tombstone/history fixtures passed. Static fixtures, not executed SQL.`);
