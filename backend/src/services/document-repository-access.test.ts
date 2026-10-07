import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { supabaseAdmin } from '../config/supabase';
import { accessQuery } from '../test-utils/repository-access.fixture';
import { DocumentAccessError, DocumentAccessService } from './document-access.service';
import { DocumentService } from './document.service';
import { OutputDocumentService } from './output-document.service';
import { GlobalSearchService } from './global-search.service';
import { ProjectActivityService } from './project-activity.service';
import { DocumentStorageService } from '../utils/storage.util';
import { DocumentAccessController } from '../controllers/document-access.controller';
import express from 'express';
import documentRoutes from '../routes/document.routes';

type Row = Record<string, any>;
const stamp = '2026-10-07T00:00:00Z';
const users: Row[] = ['SALES','SA','HEAD_SA','SUPER_ADMIN'].map((role, n) =>
  ({ id: `reader-${n}`, full_name: `Reader ${n}`, role, is_active: true }));
users.push({ id:'owner', full_name:'Owner', role:'SALES', is_active:true },
  { id:'pic', full_name:'PIC', role:'SA', is_active:true },
  { id:'inactive', full_name:'Inactive', role:'SA', is_active:false });
const actor = (id: string) => ({ userId:id, role:users.find(u => u.id === id)?.role ?? 'UNKNOWN', fullName:'Fixture' });
const projects: Row[] = [{ id:'p', name:'PRIVATE_PROJECT', customer:'PRIVATE_CUSTOMER',sales_id:'owner',pic_id:'pic',status:'ACTIVE',is_postponed:false }];
const docs: Row[] = [{ id:'d',project_id:'p',title:'Official result',category:'MOM',status:'APPROVED',created_at:stamp,updated_at:stamp },
  { id:'hidden',project_id:'p',title:'PRIVATE_DRAFT',category:'OTHER',status:'SUBMITTED',created_at:stamp,updated_at:stamp }];
const docVersions: Row[] = [{ id:'dv',document_id:'d',version_number:2,file_name:'official.pdf',file_size:3,mime_type:'application/pdf',
  storage_path:'fixture/official',status:'APPROVED',is_latest:true,created_at:stamp,uploaded_by:'pic',changelog:'PRIVATE_CHANGELOG' },
  { id:'old',document_id:'d',version_number:1,file_name:'PRIVATE_OLD.pdf',file_size:3,mime_type:'application/pdf',
    storage_path:'fixture/old',status:'SUPERSEDED',is_latest:false,created_at:stamp,uploaded_by:'pic' }];
const outputs: Row[] = [{ id:'o',project_id:'p',document_key:'proposal_teknis',title:'Tender result',milestone_id:'m',is_selected:true,is_required:true,
  status:'APPROVED',current_version_id:'ov',updated_at:stamp },
  { id:'work',project_id:'p',document_key:'timeline_proyek',title:'PRIVATE_WORK',milestone_id:'m',is_selected:true,is_required:true,
    status:'IN_REVIEW',current_version_id:'workv',updated_at:stamp }];
const snapshots: Row[] = [{ id:'ov',project_id:'p',output_document_id:'o',version_number:2,status:'APPROVED',snapshot_kind:'SUBMITTED' },
  { id:'previous',project_id:'p',output_document_id:'o',version_number:1,status:'REVISION_REQUIRED',snapshot_kind:'SUBMITTED' },
  { id:'workv',project_id:'p',output_document_id:'work',version_number:1,status:'IN_REVIEW',snapshot_kind:'SUBMITTED' }];
const files: Row[] = ['f1','f2','oldf'].map((id, n) => ({ id,project_id:'p',output_document_id:'o',file_name:`part-${n}.pdf`,file_size:3,
  storage_path:`fixture/${id}`,mime_type:'application/pdf',uploaded_at:stamp,uploaded_by:'pic' }));
const refs: Row[] = files.map((file, n) => ({ version_id:n < 2 ? 'ov':'previous',file_id:file.id,project_id:'p',output_document_id:'o',position:n }));
const activities: Row[] = [{ id:'a',project_id:'p',user_id:'reader-2',action:'DOCUMENT_ACCESS_CHANGED',created_at:stamp,description:'DOCUMENT_ACCESS_CHANGED',
  document_access_audit:{ source_type:'OFFICIAL',object_id:'d',revision:1,before:{ mode:'RESTRICTED',grants:[] },after:{ mode:'RESTRICTED',grants:['reader-0'] } } }];
const tables: Record<string,Row[]> = { users,projects,documents:docs,document_versions:docVersions,project_output_documents:outputs,
  project_output_document_versions:snapshots,project_output_document_files:files,project_output_document_version_files:refs,
  project_output_document_draft_files:[],project_milestones:[],document_comments:[{ document_id:'d',content:'PRIVATE_COMMENT' }],
  document_version_approvals:[],activity_logs:activities,document_repository_access:[{ id:'acl',document_id:'d' }],
  document_repository_grants:[{ access_id:'acl',user_id:'reader-0' }] };
let nullNative = false;
let readFailure: string | null = null;
let mode = 'RESTRICTED', grants = new Set<string>(), rpcError: any = null;
const reads: Array<{ table:string; fields:string; beforePaging:boolean }> = [];
const writes: Row[] = [], signed: string[] = [];
function query(table: string) {
  assert(table in tables, `Unexpected table ${table}`);
  const filters: Array<(row:Row) => boolean> = [];
  let fields = '', bounds: [number,number] | undefined, ordered: Array<[string,boolean]> = [];
  const result = (single = false) => {
    if (readFailure === table) return { data:null,error:{ message:'PRIVATE_DATABASE_ERROR' },count:null };
    let data = tables[table].filter(row => filters.every(f => f(row)));
    const count = data.length;
    data = [...data].sort((a,b) => { for (const [k,asc] of ordered) { const c = String(a[k] ?? '').localeCompare(String(b[k] ?? '')); if(c) return asc ? c : -c; } return 0; });
    if(bounds) data = data.slice(bounds[0],bounds[1]+1);
    reads.push({ table,fields,beforePaging:filters.length>0 });
    if(fields && fields !== '*') data = data.map(row => Object.fromEntries(fields.split(',').map(f => f.trim()).map(f => [f,row[f]])));
    return { data:single ? data[0] ?? null : data,error:null,count };
  };
  const q: any = { select:(s:string) => { fields=s; return q; },eq:(k:string,v:any) => { filters.push(r => r[k]===v); return q; },
    neq:(k:string,v:any) => { filters.push(r => r[k]!==v); return q; },in:(k:string,v:any[]) => { filters.push(r => v.includes(r[k])); return q; },
    not:(k:string) => { filters.push(r => r[k] != null); return q; },
    contains:(k:string,v:Row) => { filters.push(r => Object.entries(v).every(([key,value]) => r[k]?.[key] === value)); return q; },
    ilike:(k:string,v:string) => { filters.push(r => String(r[k] ?? '').toLowerCase().includes(v.replaceAll('%','').toLowerCase())); return q; },
    or:(s:string) => { if(s.includes('is_required')) filters.push(r => r.is_required || r.is_selected); return q; },
    order:(k:string,o:any = {}) => { ordered.push([k,o.ascending !== false]); return q; },limit:(n:number) => { bounds=[0,n-1]; return q; },
    range:(a:number,b:number) => { bounds=[a,b]; return q; },maybeSingle:async () => result(true),single:async () => result(true),
    then:(resolve:any,reject:any) => Promise.resolve(result()).then(resolve,reject) };
  return q;
}
// Read-only fixture models the RPC transport. SQL lock/transaction behavior is
// checked statically below, not claimed to have executed in PostgreSQL.
function scope(input:Row) {
  const user = users.find(u => u.id === input.p_actor_id && u.is_active);
  if(!user) return [];
  return (input.p_source_type === 'OFFICIAL' ? docs : outputs).flatMap(row => {
    const native = ['HEAD_SA','SUPER_ADMIN'].includes(user.role) || (user.role==='SALES' && user.id===projects[0].sales_id) || (user.role==='SA' && user.id===projects[0].pic_id);
    const approved = row.status === 'APPROVED';
    const visible = native && (input.p_source_type === 'OFFICIAL' ? user.role !== 'SALES' || approved : approved || ['HEAD_SA','SA'].includes(user.role));
    if(!visible && !(approved && mode === 'SHARED_INTERNAL')) return [];
    return [{ source_id:row.id,project_id:row.project_id,access_mode:mode,revision:1,project_access:!native && nullNative ? null : native,
      can_manage:native && ['HEAD_SA','SUPER_ADMIN'].includes(user.role) && approved,approved }];
  });
}
async function main() {
  const originals = { from:supabaseAdmin.from,rpc:supabaseAdmin.rpc,sign:DocumentStorageService.createSignedDownloadUrl,fetch:global.fetch,getUser:supabaseAdmin.auth.getUser };
  try {
    (supabaseAdmin as any).from = query;
    (supabaseAdmin as any).rpc = (name:string,input:Row) => {
      if(name === 'list_document_repository_access') {
        if(readFailure === 'repository_rpc') {
          const failed:any={ order:() => failed,range:() => failed,then:(resolve:any) => Promise.resolve({ data:null,error:{ message:'PRIVATE_DATABASE_ERROR' } }).then(resolve) };
          return failed;
        }
        return accessQuery(() => scope(input));
      }
      assert.equal(name,'set_document_repository_access'); writes.push(input);
      return Promise.resolve({ data:rpcError ? null:{ revision:2,changed:true,replayed:false },error:rpcError });
    };
    (DocumentStorageService as any).createSignedDownloadUrl = async (path:string,ttl:number=300) => { assert.equal(ttl,300); signed.push(path); return 'https://example.invalid/fixture'; };
    global.fetch = (async () => new Response('abc')) as typeof fetch;
    assert.deepEqual(await DocumentService.listDocuments({},actor('reader-0')),[]);
    assert.deepEqual(await OutputDocumentService.listAccessibleFiles(actor('reader-1')),[]);
    assert.equal((await DocumentService.listDocuments({},actor('owner'))).length,1);
    const assigned = await OutputDocumentService.listAccessibleFiles(actor('pic'));
    assert.equal(assigned.length,1); assert.equal(assigned[0].canReadProject,true);
    assert.equal(assigned[0].isSharedWithMe,false,'Native assignment alone is not sharing');
    tables.document_repository_grants.push({ access_id:'acl',user_id:'owner' });
    const overlapping = await DocumentService.listDocuments({},actor('owner'));
    assert.equal(overlapping.length,1); assert.equal(overlapping[0].canReadProject,true);
    assert.equal(overlapping[0].isSharedWithMe,false,'Legacy individual grants do not open additional project access after cutover');
    tables.document_repository_grants.pop();

    projects[0].pic_id='reader-1';
    assert.equal((await OutputDocumentService.listAccessibleFiles(actor('reader-1'))).length,1);
    assert.deepEqual(await OutputDocumentService.listAccessibleFiles(actor('pic')),[],'Former PIC does not retain native repository access');
    projects[0].pic_id='pic';
    assert.equal((await DocumentAccessService.read(actor('reader-3'),'OFFICIAL','d')).can_manage,true);
    assert.equal((await DocumentAccessService.read(actor('reader-2'),'OUTPUT','work')).can_manage,false);

    mode='SHARED_INTERNAL';
    for(const user of users.filter(u => u.is_active)) {
      assert((await DocumentAccessService.list(actor(user.id),'OFFICIAL')).some(r => r.source_id==='d'));
      assert((await DocumentAccessService.list(actor(user.id),'OUTPUT')).some(r => r.source_id==='o'));
    }
    for(const id of ['anonymous','inactive']) {
      assert.deepEqual(await DocumentAccessService.list(actor(id),'OUTPUT'),[]);
      await assert.rejects(() => DocumentAccessService.read(actor(id),'OFFICIAL','d'));
    }
    reads.length=0; nullNative=true;
    const detail = await DocumentService.getDocumentById('d',actor('reader-0'));
    assert.equal(detail.canReadProject,false); assert.equal(detail.canManageAccess,false); assert.equal(detail.canUploadVersion,false);
    assert.equal(detail.versions.length,1); assert.equal(detail.versions[0].id,'dv');
    assert(!JSON.stringify(detail).includes('PRIVATE_'));
    for(const field of ['project','milestone','comments','_count']) assert(!(field in detail));
    assert(!reads.some(r => ['projects','users','document_comments','document_version_approvals'].includes(r.table)), 'Sharing detail never queries private context');
    await DocumentService.getDownloadUrl('dv',actor('reader-0'));
    const signedBefore = signed.length;
    await assert.rejects(() => DocumentService.getDownloadUrl('old',actor('reader-0')));
    assert.equal(signed.length,signedBefore);
    const list = await OutputDocumentService.listAccessibleFiles(actor('reader-1'),{ approvedOnly:false });
    assert.equal(list.length,1); assert.equal(list[0].files.length,2);
    assert.equal(list[0].isSharedWithMe,true,'Internal sharing is a safe per-actor category');
    outputs[1].status='APPROVED';snapshots[2].status='APPROVED';
    files.push({ ...files[0],id:'future-file',output_document_id:'work' });
    refs.push({ version_id:'workv',file_id:'future-file',project_id:'p',output_document_id:'work',position:0 });
    assert.equal((await OutputDocumentService.listAccessibleFiles(actor('reader-1'))).length,2,'Later approval follows the project setting without per-output writes');
    refs.pop();files.pop();outputs[1].status='IN_REVIEW';snapshots[2].status='IN_REVIEW';

    assert.equal(list[0].projectName,''); assert.equal(list[0].milestoneId,''); assert(!JSON.stringify(list).includes('PRIVATE_'));
    assert(!JSON.stringify(list).includes('uploadedBy')); assert(!JSON.stringify(list).includes('fixture/'));
    await OutputDocumentService.getFileDownloadUrl('p','proposal_teknis','f2',actor('reader-1'),'ov');
    for(const [file,version] of [['oldf','previous'],['oldf','ov'],['f1','workv']]) {
      await assert.rejects(() => OutputDocumentService.getFileDownloadUrl('p','proposal_teknis',file,actor('reader-1'),version));
    }
    await assert.rejects(() => OutputDocumentService.listVersions('p','proposal_teknis',actor('reader-1')));
    const archive = await OutputDocumentService.downloadAllApproved('p',actor('reader-0'),'o');
    assert(archive.zipBuffer.length>0); assert(!archive.fileName.includes('PRIVATE_'));
    assert(signed.includes('fixture/f1') && signed.includes('fixture/f2') && !signed.includes('fixture/oldf'));
    const found = await GlobalSearchService.search({ q:'result' },actor('reader-0'));
    assert.equal(found.documents.length,1); assert.equal(found.outputDocuments.length,1);
    assert.deepEqual(found.projects,[]); assert.deepEqual(found.milestones,[]);
    assert.equal(found.outputDocuments[0].canReadProject,false); assert.equal(found.outputDocuments[0].repositorySourceId,'o');
    await assert.rejects(() => DocumentService.addComment('d',{ content:'Attempted write' },actor('reader-0')));
    await assert.rejects(() => ProjectActivityService.list('p',{ limit:20 },actor('reader-0')));
    for(const id of ['reader-0','reader-1','inactive']) {
      await assert.rejects(() => DocumentAccessService.save(actor(id),'OFFICIAL','d',{ mode:'RESTRICTED',grants:[],expected_revision:1,request_id:'r' }));
    }
    assert.equal(writes.length,0,'Denied managers do not write');

    mode='RESTRICTED'; grants=new Set(['reader-0']);
    assert.deepEqual(await DocumentService.listDocuments({},actor('reader-0')),[],'Old grants are retained but ignored');
    grants.clear();
    assert.deepEqual(await DocumentService.listDocuments({},actor('reader-0')),[],'Revoked grant removes the list entry too');
    await assert.rejects(() => DocumentService.getDownloadUrl('dv',actor('reader-0')));
    await assert.rejects(() => OutputDocumentService.getFileDownloadUrl('p','proposal_teknis','f1',actor('reader-0'),'ov'));
    assert.equal((await DocumentService.listDocuments({},actor('owner'))).length,1,'Revocation retains native rights');
    assert((await OutputDocumentService.getFileDownloadUrl('p','proposal_teknis','f1',actor('owner'),'ov')).url);
    await assert.rejects(() => DocumentAccessService.save(actor('reader-2'),'OFFICIAL','d',
      { mode:'RESTRICTED',grants:[],expected_revision:1,request_id:'old' }),error => error instanceof DocumentAccessError && error.statusCode===410);
    assert.equal(writes.length,0,'Retired writer never calls the old RPC');
    // Authorized source pagination spans several RPC/database pages, without counting hidden rows.
    mode='SHARED_INTERNAL';
    for(let n=0;n<260;n++) {
      docs.push({ ...docs[0],id:`extra-${n}`,title:`Result ${n}` });
      docVersions.push({ ...docVersions[0],id:`extra-version-${n}`,document_id:`extra-${n}` });
    }
    const many = await DocumentService.listDocuments({},actor('reader-0'));
    assert.equal(many.length,261); assert(many.some(d => d.id==='extra-259'));
    assert(!many.some(d => d.id==='hidden'));
    mode='RESTRICTED';
    for (const doc of docs.filter(row => row.id.startsWith('extra-'))) {
      tables.document_repository_access.push({ id:`acl-${doc.id}`,document_id:doc.id });
      tables.document_repository_grants.push({ access_id:`acl-${doc.id}`,user_id:'owner' });
    }
    const grantedMany=await DocumentService.listDocuments({},actor('owner'));
    assert.equal(grantedMany.length,261);
    assert.equal(grantedMany.filter(row => row.isSharedWithMe).length,0,'No hidden legacy grant survives the project-level cutover');
    tables.document_repository_access.splice(1);tables.document_repository_grants.splice(1);
    mode='SHARED_INTERNAL';
    docs.splice(2);docVersions.splice(2);
    // Strict body validation excludes client-supplied actor and non-UUID identities.
    const response:any = { status(n:number) { this.code=n; return this; },json(value:any) { this.value=value; return this; } };
    await DocumentAccessController.save({ user:actor('reader-2'),params:{ source:'OFFICIAL',sourceId:'00000000-0000-4000-8000-000000000001' },
      body:{ actor_id:'fake' } } as any,response);
    assert.equal(response.code,410);
    // Authorization must precede list paging; no path or signed URL in list projections.
    assert(reads.filter(r => ['documents','project_output_documents'].includes(r.table)).every(r => r.beforePaging));
    assert(reads.filter(r => ['documents','project_output_documents'].includes(r.table)).every(r => !r.fields.includes('storage_path') && r.fields !== '*'));
    // Real route/auth/controller chain over local HTTP; provider/database/Storage are fixtures.
    const uuidDoc='00000000-0000-4000-8000-000000000001';
    docs.push({ ...docs[0],id:uuidDoc });docVersions.push({ ...docVersions[0],id:'http-version',document_id:uuidDoc });
    (supabaseAdmin.auth as any).getUser=async (token:string) => ({ data:{ user:{ id:token } },error:null });
    const app=express();app.use(express.json());app.use('/documents',documentRoutes);
    const server=await new Promise<ReturnType<typeof app.listen>>(resolve => { const listener=app.listen(0,'127.0.0.1',() => resolve(listener)); });
    try {
      const address=server.address();assert(address && typeof address==='object');
      const request=(path:string,userId?:string) => originals.fetch(`http://127.0.0.1:${address.port}/documents${path}`,
        { headers:userId ? { Authorization:`Bearer ${userId}` }:{} });
      assert.equal((await request('/')).status,401);
      assert.equal((await request('/','inactive')).status,401);
      for(const id of ['reader-0','reader-1']) assert.equal((await request(`/access/OFFICIAL/${uuidDoc}`,id)).status,403);
      for(const id of ['reader-2','reader-3']) assert.equal((await request(`/access/OFFICIAL/${uuidDoc}`,id)).status,410);
      const publicDetail=await request(`/${uuidDoc}`,'reader-0');assert.equal(publicDetail.status,200);
      assert(!(await publicDetail.text()).includes('PRIVATE_'));
      assert.equal((await request('/versions/http-version/download-url','reader-0')).status,200);
      const sharedResponse=await request('/outputs','reader-1');
      assert.equal(sharedResponse.status,200);
      const sharedBody=await sharedResponse.json() as any;
      assert.equal(sharedBody.data.length,1);assert.equal(sharedBody.data[0].files.length,2);
      assert.equal(sharedBody.data[0].isSharedWithMe,true);assert.equal(sharedBody.data[0].canReadProject,false);
      assert(!JSON.stringify(sharedBody).includes('PRIVATE_') && !JSON.stringify(sharedBody).includes('fixture/'));
      mode='RESTRICTED';grants.clear();
      const deniedList=await request('/outputs','reader-1');assert.equal(deniedList.status,200);
      assert.deepEqual((await deniedList.json() as any).data,[],'Nonnative actor without approved sharing gets successful emptiness');
      readFailure='repository_rpc';
      const failedList=await request('/','owner');assert.equal(failedList.status,503);
      assert(!(await failedList.text()).includes('PRIVATE_'),'Source error is safe HTTP failure, not successful empty data');
      readFailure=null;
      assert.equal((await request('/versions/http-version/download-url','reader-0')).status,404,'Fresh HTTP request observes revocation');
    } finally { await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error):resolve())); }
  } finally { supabaseAdmin.from=originals.from; supabaseAdmin.rpc=originals.rpc; DocumentStorageService.createSignedDownloadUrl=originals.sign; global.fetch=originals.fetch; supabaseAdmin.auth.getUser=originals.getUser; }

  const sql = readFileSync(resolve(__dirname,'../../supabase/phase29-document-repository-access.sql'),'utf8').replace(/\r\n/g,'\n');
  const mutate=sql.slice(sql.indexOf('create function public.set_document_repository_access'));
  const projectLock=mutate.indexOf('perform 1 from public.projects');
  const sourceLock=mutate.indexOf("if p_source_type='OFFICIAL' then perform 1");
  const receipt=mutate.indexOf('select * into v_receipt');
  const cas=mutate.indexOf('if v_acl.revision <> p_expected_revision');
  const changed=mutate.indexOf('if v_changed then');
  const audit=mutate.indexOf('insert into public.activity_logs');
  assert(projectLock<sourceLock && sourceLock<receipt && receipt<cas && cas<changed && changed<audit);
  assert(mutate.includes('v_receipt.payload is distinct from v_payload'));
  assert(mutate.includes("return v_receipt.result || jsonb_build_object('replayed',true)"));
  assert(mutate.indexOf('end if;',audit)<mutate.indexOf('insert into public.document_repository_access_requests'));
  assert.equal((mutate.match(/insert into public.activity_logs/g) ?? []).length,1);
  assert(!/exception\s+when/i.test(mutate),'An audit failure cannot be swallowed after changing ACLs');
  assert(sql.includes('coalesce((u.role') && sql.includes(')),false) as native_access'),'NULL PIC must never yield an ambiguous project grant');
  assert(sql.includes("s.valid_approved and (s.mode='SHARED_INTERNAL'"));
  assert(sql.includes("v.snapshot_kind <> 'LEGACY_UPLOAD_UNCONFIRMED'"));
  assert(sql.includes('f.output_document_id is distinct from d.id'));
  assert(sql.includes('as restrictive\nfor select to anon,authenticated'));
  assert(sql.includes('for insert to anon,authenticated with check'));
  assert(sql.includes('for update to anon,authenticated using'));
  assert(sql.includes('for delete to anon,authenticated using'));
  assert(sql.includes('from public,anon,authenticated,service_role;'));
  assert(sql.includes('primary key(access_id,user_id)') && sql.includes('primary key(access_id,request_id)'));
  assert(!/notification_deliveries|createSignedUrl|storage\.objects|drop table/i.test(sql));
  assert.equal((sql.match(/on delete cascade/g) ?? []).length,7,'All ACL metadata cascades without introducing file references');
  console.log('Repository ACL: both sources, approved privacy, download/archive, search, roles, revocation, pagination, RPC transport and SQL static guards passed (no database execution)');
}
void main().catch(error => { console.error(error); process.exitCode=1; });
