-- Phase 30 is already applied. Fix only its ambiguous snapshot file-count query.
-- No signature, receipt, audit, intent, role, workflow or Storage change.
begin;
do $$ begin
  if to_regprocedure('public.submit_output_draft_phase30_core(uuid,bigint,uuid,uuid,text)') is null
    or to_regprocedure('public.record_business_change(uuid,uuid,text,text,uuid,jsonb,jsonb,uuid)') is null then
    raise exception 'Phase 33 requires Phase 30';
  end if;
end $$;
create or replace function public.submit_project_output_document_draft(
  p_output_document_id uuid,p_expected_revision bigint,p_request_id uuid,p_actor_id uuid,p_submission_note text)
returns table(document_id uuid,version_id uuid,version_number integer,draft_revision bigint,new_status text,created boolean)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_d public.project_output_documents%rowtype; v_result record; v_count integer;
begin
  v_d:=public.lock_output_file_document(p_output_document_id);
  select * into v_result from public.submit_output_draft_phase30_core(p_output_document_id,p_expected_revision,p_request_id,p_actor_id,p_submission_note);
  if v_result.created then
    select count(*) into v_count from public.project_output_document_version_files vf where vf.version_id=v_result.version_id;
    perform public.record_business_change(v_d.project_id,p_actor_id,'OUTPUT_DOCUMENTS_SUBMITTED','OUTPUT_DOCUMENT',v_d.id,
      jsonb_build_object('status',v_d.status,'version_id',v_d.current_version_id),
      jsonb_build_object('status',v_result.new_status,'version_id',v_result.version_id,'version_number',v_result.version_number,'file_count',v_count),p_request_id);
  end if;
  return query select v_result.document_id,v_result.version_id,v_result.version_number,v_result.draft_revision,v_result.new_status,v_result.created;
end $$;
revoke all on function public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text) to service_role;
commit;
