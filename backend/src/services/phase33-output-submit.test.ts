import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = (name: string) => readFileSync(resolve(__dirname, '../../supabase', name), 'utf8').replace(/\r\n/g, '\n');
const old = sql('phase30-business-mutation-audit.sql');
const fix = sql('phase33-output-submit-column-reference.sql');
const body = (source: string) => source.slice(source.indexOf('function public.submit_project_output_document_draft('))
  .split('as $$')[1].split('end $$;')[0].trim();
const ambiguous = 'from public.project_output_document_version_files where version_id=v_result.version_id';
const qualified = 'from public.project_output_document_version_files vf where vf.version_id=v_result.version_id';
assert(body(old).includes(ambiguous));
assert.equal(body(fix), body(old).replace(ambiguous, qualified), 'Only the file-count column reference may change');
assert(fix.includes('returns table(document_id uuid,version_id uuid,version_number integer,draft_revision bigint,new_status text,created boolean)'));
assert(fix.includes('security definer set search_path=pg_catalog'));
assert(fix.includes('from public,anon,authenticated;') && fix.includes('to service_role;'));
assert(fix.includes('Phase 33 requires Phase 30') && fix.trim().endsWith('commit;'));
assert(!/\bdrop\b|\balter table\b|storage\.objects|deliver_pending/i.test(fix));
console.log('Phase33: exact body delta, contract/security and permissions passed');
