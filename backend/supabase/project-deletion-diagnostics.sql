-- READ ONLY. Run manually; never invokes the deletion RPC or touches Storage.
-- Replace NULL below with the failed project's UUID, not its name.
with params as (select null::uuid as project_id)
select project_id is not null as project_id_provided,
  case when project_id is not null then exists
    (select 1 from public.projects p where p.id = params.project_id) end as project_still_exists,
  case when project_id is not null then
    (select count(*) from public.project_deletion_cleanups c where c.project_id = params.project_id
      and c.dependency_counts ? 'milestones') end as project_deletion_receipts
from params;

-- Run with the SAME UUID. Output-upload orphan receipts are classified separately.
with params as (select null::uuid as project_id)
select c.id, c.status, c.created_at, c.completed_at, c.failed_at, c.storage_object_count,
  c.failure_code, c.dependency_counts ? 'milestones' as is_project_deletion_receipt
from public.project_deletion_cleanups c join params on c.project_id = params.project_id
order by c.created_at desc, c.id desc limit 20;

-- Inspect installed function features, without returning body/user content/paths.
with installed as (
  select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
    p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in
    ('delete_project_with_cleanup','protect_output_file_snapshot','record_output_upload_outcome')
)
select proname, arguments, prosecdef, proconfig,
  md5(body) as definition_fingerprint,
  position('project_output_document_files' in body) > 0 as includes_file_registry,
  position('milestone_submission_packages' in body) > 0 as references_retired_packages,
  position('milestone_approvals' in body) > 0 as references_retired_approvals,
  position('workflow.project_deletion_id' in body) > 0 as includes_historical_deletion_gate,
  case when proname = 'delete_project_with_cleanup' then
    position('workflow.project_deletion_id' in body) > 0 and
    position('workflow.project_deletion_id' in body) <
      position('delete from public.project_output_document_versions' in body)
  end as gate_precedes_snapshot_deletion
from installed order by proname, arguments;

select c.conrelid::regclass as relation, c.conname,
  c.confrelid::regclass as referenced_relation, c.condeferrable, c.condeferred,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c join pg_namespace n on n.oid = c.connamespace
where n.nspname = 'public' and c.contype in ('f','c')
  and (c.conrelid in (to_regclass('public.projects'),to_regclass('public.project_phases'),
    to_regclass('public.project_output_documents'),to_regclass('public.project_output_document_files'),
    to_regclass('public.project_output_document_version_files'),to_regclass('public.project_output_document_versions'))
    or c.confrelid in (to_regclass('public.projects'),to_regclass('public.project_phases'),
      to_regclass('public.project_output_documents'),to_regclass('public.project_output_document_versions')))
order by c.conrelid::regclass::text, c.conname;

select t.tgrelid::regclass as relation, t.tgname, t.tgenabled, p.proname
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and t.tgrelid in
  (to_regclass('public.projects'),to_regclass('public.project_phases'),
   to_regclass('public.project_output_documents'),to_regclass('public.project_output_document_files'),
   to_regclass('public.project_output_document_version_files'),to_regclass('public.project_output_document_versions'))
order by t.tgrelid::regclass::text, t.tgname;
