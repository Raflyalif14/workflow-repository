import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '../../supabase/phase22-output-document-file-collections.sql'), 'utf8');
const functionBody = (name: string) => {
  const start = sql.indexOf(`function public.${name}(`);
  assert(start >= 0, `${name} must exist`);
  const end = sql.indexOf('end $$;', start);
  return sql.slice(start, end >= 0 ? end + 7 : sql.indexOf('end;\n$$;', start) + 9);
};
const mutate = functionBody('mutate_project_output_document_draft');
const submit = functionBody('submit_project_output_document_draft');
const review = functionBody('transition_project_output_document_version');
const lock = functionBody('lock_output_file_document');
const actor = functionBody('assert_output_file_actor');
const protection = functionBody('protect_output_file_snapshot');
const cleanup = functionBody('register_output_upload_cleanup');
const deletion = functionBody('delete_project_with_cleanup');

assert(sql.trimStart().includes('begin;') && sql.trimEnd().endsWith('commit;'));
assert(!/\bdrop\s+(?:table|column)\b/i.test(sql), 'Phase 22 must be additive');
assert(sql.indexOf('Phase 22 requires completed Phase 18b retirement') < sql.indexOf('alter table public.project_output_documents'),
  'Missing retirement must abort before expansion/backfill or replacing deletion cleanup');
assert(!mutate.includes('insert into public.project_output_document_versions'), 'Draft edits must not create history');
assert(!mutate.includes('update public.project_output_document_versions'), 'Draft edits must not mutate history');
assert(!mutate.includes('delete from public.project_output_document_files'), 'Removing draft refs must retain Storage registry');
assert(mutate.indexOf('request_payload is distinct from v_payload') < mutate.indexOf('insert into public.project_output_document_files'));
assert(mutate.indexOf('v_d.draft_revision <> p_expected_revision') < mutate.indexOf('insert into public.project_output_document_files'));
assert(mutate.indexOf('assert_output_file_actor(v_d.id,p_actor_id,false,true)') < mutate.indexOf('insert into public.project_output_document_files'));
for (const fragment of ['v_count + 1 > 10', 'v_size + p_file_size > 209715200', 'p_file_size > 52428800',
  "v_d.status not in ('TO_DO','DRAFT','REVISION_REQUIRED')", "'sha256',p_content_sha256", 'df.file_id = p_target_file_id']) {
  assert(mutate.includes(fragment), `Draft persistence must enforce ${fragment}`);
}
assert(mutate.includes('p_file_size <= 0'), 'Empty uploads must be rejected');
assert(mutate.includes('where c.storage_paths @> jsonb_build_array(p_storage_path)'),
  'Any scheduled or completed cleanup path must stay unavailable to a delayed metadata RPC');
assert(!mutate.includes("c.status <> 'COMPLETED'"), 'Completed cleanup must not allow a late request to attach deleted bytes');
assert(submit.indexOf('v_existing.submission_note is distinct from v_note') < submit.indexOf('insert into public.project_output_document_versions'));
assert(submit.indexOf('v_d.draft_revision <> p_expected_revision') < submit.indexOf('insert into public.project_output_document_versions'));
assert(submit.includes('v_existing.status,false; return;'), 'Submit replay must return persisted snapshot without status mutation');
assert(submit.includes('select v_id,df.output_document_id,df.file_id,df.project_id,df.position'));
assert(submit.includes('from public.project_output_document_draft_files df where df.output_document_id = v_d.id;'));
assert(submit.indexOf('insert into public.project_output_document_version_files') < submit.indexOf("set status = 'IN_REVIEW'"));
for (const fragment of ['v_count < 1', 'v_count > 10', 'v_size > 209715200', 'f.file_size is null', 'f.file_size <= 0',
  "'SUBMITTED',p_expected_revision,p_request_id,p_actor_id"]) assert(submit.includes(fragment));
assert.equal((submit.match(/insert into public.project_output_document_versions\n/g) || []).length, 1);
assert(sql.includes('on public.project_output_document_versions(output_document_id, submission_request_id)'));
assert(sql.includes('on public.project_output_document_versions(output_document_id, submitted_draft_revision)'));

assert(lock.indexOf('from public.projects where id = v_d.project_id for update') < lock.indexOf('from public.project_milestones'));
assert(lock.indexOf('from public.project_milestones') < lock.lastIndexOf('from public.project_output_documents'));
for (const fragment of ["ws.default_role = 'SA'", 'ws.stage_key = c.stage_key', 'ws.scenario_id = v_p.scenario_id',
  'v_m.id is distinct from v_d.milestone_id', '(v_d.is_required or v_d.is_selected)']) assert(lock.includes(fragment));
for (const fragment of ['v_user.is_active is distinct from true', "p_review and v_user.role = 'HEAD_SA'", "v_user.role in ('SA','HEAD_SA')",
  'v_p.pic_id is distinct from p_actor_id', 'v_m.pic_id is distinct from p_actor_id', "v_p.status <> 'ACTIVE'",
  'coalesce(v_p.is_postponed,false)', "v_m.status <> 'IN_PROGRESS'", "time zone 'Asia/Jakarta'"]) assert(actor.includes(fragment));
assert(actor.includes('from public.users u where u.id = p_actor_id for share'), 'Role/activity must remain stable during persistence');
for (const body of [mutate,submit,review,deletion]) {
  assert(body.includes('#variable_conflict use_column'), 'RPC output parameters must not shadow table columns');
}
assert(review.includes("p_action not in ('APPROVE','REVISE')"));
assert(review.includes("snapshot_kind in ('SUBMITTED','LEGACY_SUBMITTED')"));
assert(!review.includes('insert into public.project_output_document_version_files'));

assert.match(sql, /set snapshot_kind = 'LEGACY_SUBMITTED'\s+where submitted_at is not null or status in \('IN_REVIEW','REVISION_REQUIRED','APPROVED'\);/);
assert(sql.includes("default 'LEGACY_UPLOAD_UNCONFIRMED'"));
assert(sql.includes('select id,output_document_id,id,project_id,1 from public.project_output_document_versions;'));
const classify = (status: string, submittedAt: string | null) => submittedAt !== null
  || ['IN_REVIEW', 'REVISION_REQUIRED', 'APPROVED'].includes(status) ? 'LEGACY_SUBMITTED' : 'LEGACY_UPLOAD_UNCONFIRMED';
assert.equal(classify('DRAFT', null), 'LEGACY_UPLOAD_UNCONFIRMED');
assert.equal(classify('DRAFT', '2026-09-01'), 'LEGACY_SUBMITTED');
for (const status of ['IN_REVIEW','REVISION_REQUIRED','APPROVED']) assert.equal(classify(status,null),'LEGACY_SUBMITTED');

assert(protection.includes("tg_op = 'INSERT'"));
assert(protection.includes("current_setting('workflow.output_snapshot_id',true) = new.version_id::text"));
assert(protection.includes("current_setting('workflow.project_deletion_id',true) = old.project_id::text"));
assert(protection.includes("to_jsonb(new) - array['status','reviewed_by','reviewed_at','review_feedback','updated_at']"));
assert(sql.includes('before insert or update or delete on public.project_output_document_version_files'));
assert(deletion.includes("role = 'SUPER_ADMIN' and is_active = true"));
assert(deletion.indexOf("set_config('workflow.project_deletion_id'") < deletion.indexOf('delete from public.project_output_document_versions'));
for (const table of ['project_output_document_files','project_output_documents','project_output_document_versions',
  'document_versions','project_intake_attachments','milestone_contribution_attachments']) {
  assert(deletion.includes(`not exists (select 1 from public.${table}`), `Deletion must exclude shared refs in ${table}`);
  assert(cleanup.includes(`exists (select 1 from public.${table}`), `Orphan tracking must exclude refs in ${table}`);
}
assert(cleanup.includes("dependency_counts ? 'project_output_documents'"), 'Deleted-project orphan tracking requires authorized deletion receipt');
assert(cleanup.includes("split_part(p_storage_path,'/',1) <> 'output-documents'"));
assert(cleanup.includes("split_part(p_storage_path,'/',2) <> p_project_id::text"));
assert(cleanup.includes("split_part(p_storage_path,'/',3) <> v_d.document_key"));
assert(cleanup.includes("array_length(string_to_array(p_storage_path,'/'),1) <> 4"));
assert(!cleanup.includes('assert_output_file_actor'), 'Cleanup tracking must survive a PIC/status/account change after authorized Storage upload');
assert(!cleanup.includes('lock_output_file_document'), 'Tracking unused bytes must not require still-selected milestone work');
const storageBuilder = readFileSync(join(__dirname, '../utils/storage.util.ts'), 'utf8');
assert(storageBuilder.includes('return `output-documents/${projectId}/${documentKey}/${randomUUID()}-${sanitizeStorageFileName(originalName)}`;'),
  'Exact cleanup guard segments must match the actual output upload path builder');
assert(cleanup.includes("jsonb_build_array(p_storage_path),1"));
assert(sql.includes('revoke all on function public.register_output_upload_cleanup(uuid,uuid,uuid,text) from public,anon,authenticated;'));
assert(sql.includes('grant execute on function public.register_output_upload_cleanup(uuid,uuid,uuid,text) to service_role;'));
assert(sql.includes('from public,anon,authenticated,service_role;'), 'Old upload-version RPC must be disabled');
assert(!sql.includes('deliver_pending_output_notifications('), 'Delivery worker/RPC must stay unchanged');
console.log('Phase 22 draft CAS, exact snapshot, legacy classification, permissions and cleanup static checks: passed');
