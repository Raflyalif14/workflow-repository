-- Read-only after Phase 22. Invariant queries should return zero rows.
select snapshot_kind,status,count(*) as versions
from public.project_output_document_versions group by snapshot_kind,status order by snapshot_kind,status;

select v.id as version_id,v.output_document_id
from public.project_output_document_versions v
left join public.project_output_document_version_files vf on vf.version_id = v.id
group by v.id,v.output_document_id
having count(vf.file_id) = 0;

select vf.version_id,vf.file_id,vf.output_document_id
from public.project_output_document_version_files vf
join public.project_output_document_versions v on v.id = vf.version_id
join public.project_output_document_files f on f.id = vf.file_id
where vf.output_document_id is distinct from v.output_document_id
  or vf.output_document_id is distinct from f.output_document_id
  or vf.project_id is distinct from v.project_id or vf.project_id is distinct from f.project_id;

select df.output_document_id,count(*) as files,coalesce(sum(f.file_size),0) as total_bytes
from public.project_output_document_draft_files df
join public.project_output_document_files f on f.id = df.file_id
group by df.output_document_id having count(*) > 10 or coalesce(sum(f.file_size),0) > 209715200;

select v.id,v.output_document_id,v.submitted_draft_revision
from public.project_output_document_versions v
where v.snapshot_kind = 'SUBMITTED' and (v.submitted_at is null or v.submission_request_id is null
  or v.submission_actor_id is null or v.submitted_draft_revision is null);

select r.output_document_id,r.request_id
from public.project_output_document_draft_requests r
join public.project_output_documents od on od.id = r.output_document_id
where r.result_revision > od.draft_revision;

select has_function_privilege('service_role',
  'public.create_project_output_document_version(uuid,uuid,text,text,bigint,text,uuid,timestamptz)','execute') as old_upload_must_be_false,
  has_function_privilege('service_role',
    'public.mutate_project_output_document_draft(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text)','execute') as draft_rpc_must_be_true,
  has_function_privilege('service_role',
    'public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text)','execute') as snapshot_rpc_must_be_true,
  has_function_privilege('authenticated',
    'public.register_output_upload_cleanup(uuid,uuid,uuid,text)','execute') as direct_cleanup_must_be_false;

select tgname,tgenabled from pg_catalog.pg_trigger
where tgname in ('output_files_immutable','output_snapshot_refs_immutable','output_snapshot_metadata_immutable')
order by tgname;
