-- READ ONLY. No feedback, recipient data, Storage paths or signed URLs.
select to_regclass('public.project_output_document_version_files') as snapshot_files,
  to_regclass('public.project_pic_requests') as phase27_receipts,
  to_regprocedure('public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text)') as submit_rpc,
  to_regprocedure('public.assert_output_file_actor(uuid,uuid,boolean,boolean)') as actor_guard;
select status,snapshot_kind,count(*) from public.project_output_document_versions group by status,snapshot_kind;
-- Must be empty before rollout: do not infer or reconstruct invalid snapshots.
select od.id,od.project_id,od.current_version_id
from public.project_output_documents od
left join public.project_output_document_versions v on v.id = od.current_version_id and v.output_document_id = od.id
where od.status = 'IN_REVIEW' and (v.id is null or v.status <> 'IN_REVIEW'
  or v.project_id is distinct from od.project_id or v.snapshot_kind not in ('SUBMITTED','LEGACY_SUBMITTED')
  or not exists(select 1 from public.project_output_document_version_files vf where vf.version_id = v.id));
select vf.version_id,vf.file_id from public.project_output_document_version_files vf
join public.project_output_document_versions v on v.id = vf.version_id
join public.project_output_document_files f on f.id = vf.file_id
where vf.output_document_id is distinct from v.output_document_id or vf.project_id is distinct from v.project_id
  or f.output_document_id is distinct from vf.output_document_id or f.project_id is distinct from vf.project_id;
