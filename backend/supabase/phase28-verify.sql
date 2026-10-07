-- READ ONLY after Phase 28. Mismatch queries must return zero rows.
select r.version_id,r.file_id from public.project_output_file_revisions r
left join public.project_output_document_version_files vf on vf.version_id = r.version_id and vf.file_id = r.file_id
left join public.project_output_document_versions v on v.id = r.version_id
where vf.file_id is null or v.status <> 'REVISION_REQUIRED' or v.reviewed_by is null or v.reviewed_at is null
  or length(btrim(r.feedback)) not between 1 and 2000 or r.feedback !~ '[^[:space:]]';
select r.output_document_id,r.request_id from public.project_output_review_requests r
join public.project_output_document_versions v on v.id = r.version_id
where v.output_document_id is distinct from r.output_document_id or v.status is distinct from r.new_status
  or v.reviewed_by is distinct from r.actor_id;
select has_function_privilege('service_role','public.transition_project_output_document_version(uuid,uuid,text,uuid,text,text)','EXECUTE') as retired_must_be_false,
  has_function_privilege('service_role','public.submit_output_draft_phase22_core(uuid,bigint,uuid,uuid,text)','EXECUTE') as core_must_be_false,
  has_function_privilege('authenticated','public.review_project_output_document_snapshot(uuid,uuid,uuid,text,uuid,text,jsonb)','EXECUTE') as client_must_be_false,
  has_function_privilege('service_role','public.review_project_output_document_snapshot(uuid,uuid,uuid,text,uuid,text,jsonb)','EXECUTE') as server_must_be_true;
select count(*) as reviewed_snapshots from public.project_output_review_requests;