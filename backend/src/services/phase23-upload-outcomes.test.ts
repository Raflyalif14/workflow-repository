import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '../../supabase/phase23-output-upload-outcomes.sql'), 'utf8');
const phase22 = readFileSync(join(__dirname, '../../supabase/phase22-output-document-file-collections.sql'), 'utf8');
assert(sql.trimEnd().endsWith('commit;'));
assert(sql.indexOf('Phase 23 requires Phase 22') < sql.indexOf('create function'));
assert(sql.indexOf('from public.projects where') < sql.indexOf('from public.project_output_documents where'));
const referenceGuard = sql.indexOf('if exists (select 1 from public.project_output_document_files');
const insert = sql.indexOf('insert into public.project_deletion_cleanups');
for (const table of ['project_output_document_files', 'document_versions', 'project_output_documents',
  'project_output_document_versions', 'project_intake_attachments', 'milestone_contribution_attachments']) {
  assert(sql.slice(referenceGuard, insert).includes(`from public.${table} where storage_path = p_storage_path`), `${table} references protect bytes`);
}
assert(sql.slice(referenceGuard, insert).includes('return null;'), 'Referenced paths cannot become deletion jobs');
assert(sql.includes("case when p_uncertain then 'PENDING' else 'FAILED' end"));
assert(sql.includes("status = 'PENDING',failure_code = 'OUTPUT_UPLOAD_UNCONFIRMED'"));
assert(sql.includes('jsonb_build_array(p_storage_path),1'), 'Only the exact attempted path is captured');
assert(sql.includes('array_length(string_to_array(p_storage_path,\'/\'),1) <> 4'));
assert(sql.includes('from public,anon,authenticated') && sql.includes('to service_role;'));
assert(!/\bdelete\s+from\b|\bdrop\s+|storage\.objects/i.test(sql), 'Migration records outcomes without deleting data or Storage');
assert(phase22.includes('where c.storage_paths @> jsonb_build_array(p_storage_path)'), 'Late metadata must reject captured paths');
const mutate = phase22.slice(phase22.indexOf('function public.mutate_project_output_document_draft('), phase22.indexOf('function public.submit_project_output_document_draft('));
assert(mutate.indexOf('request_payload is distinct from v_payload') < mutate.indexOf('assert_output_file_actor(v_d.id,p_actor_id,false,true)'));
for (const key of ['action', 'expectedRevision', 'targetFileId', 'fileId', 'fileName', 'fileSize', 'mimeType', 'sha256']) {
  assert(mutate.includes(`'${key}'`), `Replay identity includes ${key}`);
}
assert(mutate.includes('v_receipt.actor_id is distinct from p_actor_id'));
console.log('Phase 23 static checks: exact-path uncertainty, reference protection, permissions and replay guards passed');
