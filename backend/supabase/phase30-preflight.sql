-- READ ONLY. No user content, credentials or Storage paths.
select to_regprocedure('public.mutate_project_output_document_draft(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text)') as draft_rpc,
  to_regprocedure('public.review_project_output_document_snapshot(uuid,uuid,uuid,text,uuid,text,jsonb)') as review_rpc,
  to_regclass('public.document_repository_access') as phase29;
select table_name,column_name,data_type from information_schema.columns where table_schema='public'
  and ((table_name='activity_logs' and column_name in ('action','created_at','estimated_value_audit','pic_assignment_audit','document_access_audit'))
    or (table_name='projects' and column_name='updated_at')) order by table_name,column_name;
select status,count(*) from public.projects where updated_at is null group by status;
select proname,prosecdef from pg_proc where oid in (
  'public.sync_phase_output_scope(uuid,uuid,text[])'::regprocedure,
  'public.sync_draft_output_scope(uuid,uuid,text[])'::regprocedure,
  'public.complete_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[])'::regprocedure);
select has_table_privilege('authenticated','public.projects','INSERT,UPDATE') as inspect_client_direct_writers,
  has_table_privilege('authenticated','public.activity_logs','INSERT,UPDATE') as inspect_client_audit_writers;
-- Stop old API instances and inspect direct writers before deployment. New audit does not backfill old rows.

select to_regprocedure('public.complete_business_milestone(uuid,uuid)') as must_be_null_before_phase30,
  to_regprocedure('public.delete_project_with_cleanup(uuid,text,uuid)') as deletion_rpc,
  to_regprocedure('public.complete_phase_sa_milestone(uuid,uuid,boolean)') as phase_completion_rpc,
  to_regprocedure('public.complete_sa_output_milestone(uuid,uuid,boolean)') as legacy_completion_rpc;

select to_regprocedure('public.record_output_upload_outcome(uuid,uuid,uuid,text,boolean)') as phase23_outcome_rpc;
-- After Phase30, inspect preserved mutate_output_draft_phase30_core for the captured-cleanup-path guard.
-- The public upload RPC delegates to that private unchanged core; do not reapply Phase22/23.
