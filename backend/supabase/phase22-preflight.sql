-- Read-only before Phase 22. Counts and IDs only; no user content or paths.
-- A historical review state or a submitted timestamp proves submission.
select case when submitted_at is not null or status in ('IN_REVIEW','REVISION_REQUIRED','APPROVED')
  then 'LEGACY_SUBMITTED' else 'LEGACY_UPLOAD_UNCONFIRMED' end as classification,
  status, count(*) as version_count,
  count(*) filter (where file_size is null) as unknown_file_size_count,
  count(*) filter (where file_size > 52428800) as oversized_file_count
from public.project_output_document_versions
group by classification,status order by classification,status;

-- These two queries must return no rows; Phase 22 aborts on these mismatches.
select v.id as version_id,v.output_document_id,v.project_id,od.project_id as expected_project_id
from public.project_output_document_versions v
join public.project_output_documents od on od.id = v.output_document_id
where v.project_id is distinct from od.project_id;
select od.id as output_id,od.current_version_id
from public.project_output_documents od
left join public.project_output_document_versions v on v.id = od.current_version_id
where od.current_version_id is not null and (v.id is null
  or v.output_document_id is distinct from od.id or v.storage_path is distinct from od.storage_path);

-- Existing IDs/numbers and upload-only history remain; the migration creates
-- references, never deletes legacy rows or Storage objects.
select (select count(*) from public.project_output_document_versions) as legacy_versions_preserved,
  (select count(*) from public.project_output_documents where current_version_id is null
    and file_name is not null and storage_path is not null) as unversioned_active_files_preserved,
  0::bigint as storage_objects_deleted_by_migration;

-- Unknown-size draft uploads must be replaced before new submission so the
-- server can enforce the aggregate size limit. Existing reviewed downloads stay.
select od.id as output_id,od.current_version_id,od.status
from public.project_output_documents od
where od.storage_path is not null and od.file_size is null
  and od.status in ('DRAFT','REVISION_REQUIRED','TO_DO');

select to_regclass('public.output_document_stage_catalog') as phase19_catalog,
  to_regclass('public.milestone_submission_packages') as phase18b_packages_must_be_null,
  to_regclass('public.milestone_submission_attachments') as phase18b_attachments_must_be_null,
  to_regclass('public.milestone_approvals') as phase18b_approvals_must_be_null,
  to_regclass('public.output_notification_outbox') as notification_outbox,
  to_regprocedure('public.complete_sa_output_milestone(uuid,uuid,boolean)') as completion_rpc,
  to_regprocedure('public.deliver_pending_output_notifications(integer)') as notification_delivery_rpc;
