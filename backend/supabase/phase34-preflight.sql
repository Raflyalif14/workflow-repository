-- READ ONLY. Review before applying Phase34; no paths/content/receiver data.
select to_regprocedure('public.delete_project_with_cleanup(uuid,text,uuid)') as deletion_rpc,
  to_regprocedure('public.mutate_official_artifact(uuid,uuid,text,jsonb,text,uuid)') as new_rpc_must_be_absent;
select status,count(*) from public.milestone_contributions group by status;
select promotion_status,count(*) from public.milestone_contribution_attachments group by promotion_status;
-- Old STAGING/CLEANUP_FAILED/PROMOTING jobs require manual investigation, not forced reset.
select count(*) as duplicate_latest from (select document_id from public.document_versions where is_latest group by document_id having count(*)>1) d;
select count(*) as duplicate_pending from (select document_version_id from public.document_version_approvals where status='PENDING' group by document_version_id having count(*)>1) d;
select column_name,data_type from information_schema.columns where table_schema='public' and table_name='activity_logs' and column_name='business_audit';
