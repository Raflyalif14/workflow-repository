import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewOutputDocumentsSchema } from '../validators/output-document.validator';
import { OutputDocumentService } from './output-document.service';
import { supabaseAdmin } from '../config/supabase';
import { OutputNotificationOutboxWorker } from './output-notification-outbox.worker';

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const item = { document_key: 'proposal_teknis', expected_version_id: uuid(1), request_id: uuid(2) };
const marker = { file_id: uuid(3), feedback: ' Update the figures. ' };
for (const file_revisions of [[marker], [marker, { file_id: uuid(4), feedback: 'Replace this file.' }]]) {
  const parsed = reviewOutputDocumentsSchema.parse({ decision: 'REVISE', items: [{ ...item, file_revisions }] });
  assert.equal(parsed.items[0].file_revisions![0].feedback, 'Update the figures.');
}
for (const file_revisions of [[], [marker, marker], [{ ...marker, feedback: ' \t\n' }], [{ ...marker, file_id: 'filename.pdf' }]]) {
  assert(!reviewOutputDocumentsSchema.safeParse({ decision: 'REVISE', items: [{ ...item, file_revisions }] }).success);
}
assert(!reviewOutputDocumentsSchema.safeParse({ decision: 'APPROVE', items: [{ ...item, file_revisions: [marker] }] }).success);
assert(!reviewOutputDocumentsSchema.safeParse({ decision: 'REVISE', items: [item], feedback: 'General feedback alone is insufficient.' }).success);
assert(reviewOutputDocumentsSchema.safeParse({ decision: 'APPROVE', items: [item] }).success);

// Meaningful static migration checks. These do NOT execute/prove PostgreSQL transactions.
const sql = readFileSync(join(__dirname, '../../supabase/phase28-output-file-revisions.sql'), 'utf8');
const review = sql.split('create function public.review_project_output_document_snapshot(')[1].split('end $$;')[0];
const submit = sql.split('create function public.submit_project_output_document_draft(')[1].split('end $$;')[0];
assert(sql.includes('foreign key(version_id,file_id) references public.project_output_document_version_files(version_id,file_id) on delete cascade'));
assert(review.indexOf('lock_output_file_document') < review.indexOf('select * into v_r'));
assert(review.indexOf('assert_output_file_actor(v_d.id,p_actor_id,true,false)') < review.indexOf('if found then'));
assert(review.indexOf('v_r.payload is distinct from v_payload') < review.indexOf('return query select v_d.id,v_r.version_id'));
assert(review.indexOf('return query select v_d.id,v_r.version_id') < review.indexOf('update public.project_output_document_versions'));
assert(review.indexOf('vf.version_id = p_expected_version_id and vf.file_id') < review.indexOf('update public.project_output_document_versions'));
assert(review.includes('vf.output_document_id = v_d.id and vf.project_id = v_d.project_id'));
assert(review.includes("v_d.status <> 'IN_REVIEW'"));
assert(review.includes('v_count <> (select count(distinct'));
assert(review.includes("m->>'feedback' !~ '[^[:space:]]'"), 'SQL rejects newline/tab-only feedback as well as spaces');
assert(review.includes('insert into public.activity_logs'));
assert(review.includes('insert into public.project_output_review_requests'));
assert(!review.includes('exception when'), 'Audit/feedback/intent failure must abort the RPC, not be swallowed');
assert(!review.includes('storage_path') && !review.includes('insert into public.project_output_document_versions'));
assert(submit.indexOf('lock_output_file_document') < submit.indexOf('join public.project_output_document_draft_files'));
assert(submit.indexOf('r.version_id = v_d.current_version_id') < submit.indexOf('return query select * from public.submit_output_draft_phase22_core'));
assert(submit.includes('df.file_id = r.file_id'), 'Gate uses registry identity, not filename/position/path');
assert(sql.includes('from public,anon,authenticated,service_role;'), 'Retired review/core RPC must not allow bypass');
assert(sql.includes('Historical file feedback is immutable'));

async function checkService() {
  const originals = { from: supabaseAdmin.from, rpc: supabaseAdmin.rpc, worker: OutputNotificationOutboxWorker.runOnceBestEffort };
  const head = { userId: 'head', role: 'HEAD_SA', fullName: 'Head' };
  const project: any = { id: 'p', sales_id: 'owner', pic_id: 'pic', status: 'ACTIVE', is_postponed: false, scenario: { name: 'On Submission Tender' } };
  const output: any = { id: 'o', project_id: 'p', document_key: item.document_key, current_version_id: item.expected_version_id, status: 'IN_REVIEW', milestone_id: 'm' };
  const receipts: any[] = [];
  let rpcCalls = 0, lostResponse = true, intentCount = 0, auditCount = 0;
  class Query {
    filters: Array<(row: any) => boolean> = [];
    constructor(readonly table: string) {}
    select() { return this; }
    eq(key: string, value: any) { this.filters.push(row => row[key] === value); return this; }
    in() { return this; }
    execute(single: boolean) {
      const rows = (this.table === 'projects' ? [project] : this.table === 'project_output_documents' ? [output]
        : this.table === 'project_milestones' ? [{ id: 'm', project_id: 'p', status: 'IN_PROGRESS' }]
          : this.table === 'project_output_review_requests' ? receipts : []).filter(row => this.filters.every(filter => filter(row)));
      assert.notEqual(this.table, 'activity_logs', 'Service must not add a non-atomic review audit');
      return { data: single ? rows[0] || null : rows, error: null };
    }
    single() { return Promise.resolve(this.execute(true)); }
    maybeSingle() { return Promise.resolve(this.execute(true)); }
    then(resolve: any) { return Promise.resolve(this.execute(false)).then(resolve); }
  }
  try {
    (supabaseAdmin as any).from = (table: string) => new Query(table);
    (OutputNotificationOutboxWorker as any).runOnceBestEffort = async () => {};
    (supabaseAdmin as any).rpc = async (name: string, payload: any) => {
      rpcCalls++;
      assert.equal(name, 'review_project_output_document_snapshot');
      assert.equal(payload.p_actor_id, head.userId);
      assert.equal(payload.p_expected_version_id, item.expected_version_id);
      assert.deepEqual(payload.p_file_revisions, [{ file_id: marker.file_id, feedback: marker.feedback.trim() }]);
      const existing = receipts.find(row => row.request_id === payload.p_request_id);
      if (!existing) {
        receipts.push({ output_document_id: output.id, request_id: payload.p_request_id });
        output.status = 'REVISION_REQUIRED'; intentCount++; auditCount++;
      }
      if (lostResponse) { lostResponse = false; return { data: null, error: { code: '08006' } }; }
      return { data: [{ replayed: Boolean(existing) }], error: null };
    };
    const input = reviewOutputDocumentsSchema.parse({ decision: 'REVISE', items: [{ ...item, file_revisions: [marker] }] });
    for (const role of ['SA', 'SALES', 'SUPER_ADMIN']) {
      await assert.rejects(OutputDocumentService.review('p', input, { ...head, role }), (error: any) => error.statusCode === 403);
    }
    assert.equal(rpcCalls, 0);
    project.is_postponed = true;
    await assert.rejects(OutputDocumentService.review('p', input, head), (error: any) => error.statusCode === 409);
    assert.equal(rpcCalls, 0); project.is_postponed = false;
    assert.equal((await OutputDocumentService.review('p', input, head)).success, false);
    assert.equal((await OutputDocumentService.review('p', input, head)).success, true, 'Retry must reach receipt despite status transition');
    assert.equal(rpcCalls, 2); assert.equal(intentCount, 1); assert.equal(auditCount, 1);
  } finally {
    (supabaseAdmin as any).from = originals.from; (supabaseAdmin as any).rpc = originals.rpc;
    (OutputNotificationOutboxWorker as any).runOnceBestEffort = originals.worker;
  }
}
void checkService().then(() => console.log('File revision schema, SQL guards/atomic boundaries, role policy and lost-response receipt forwarding passed'))
  .catch(error => { console.error(error); process.exitCode = 1; });
