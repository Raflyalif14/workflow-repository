-- Phase 22 has already been applied. Add safe upload outcome tracking separately.
-- This migration does not modify drafts, versions, decisions or Storage objects.
begin;

do $$ begin
  if to_regprocedure('public.mutate_project_output_document_draft(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text)') is null
    or to_regclass('public.project_output_document_draft_requests') is null then
    raise exception 'Phase 23 requires Phase 22';
  end if;
  if position('where c.storage_paths @> jsonb_build_array(p_storage_path)' in
      pg_get_functiondef('public.mutate_project_output_document_draft(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text)'::regprocedure)) = 0
    or position('c.status <> ''COMPLETED''' in
      pg_get_functiondef('public.mutate_project_output_document_draft(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text)'::regprocedure)) > 0 then
    raise exception 'Phase 23 requires the Phase 22 guard against all captured cleanup paths';
  end if;
end $$;

create function public.record_output_upload_outcome(
  p_project_id uuid,p_output_document_id uuid,p_actor_id uuid,p_storage_path text,p_uncertain boolean
)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_d public.project_output_documents%rowtype; v_p public.projects%rowtype; v_id uuid;
begin
  select * into v_p from public.projects where id = p_project_id for update;
  if found then
    select * into v_d from public.project_output_documents where id = p_output_document_id for update;
    if found and v_d.project_id is distinct from p_project_id then
      raise exception 'Cleanup output/project mismatch' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.project_deletion_cleanups c
      where c.project_id = p_project_id and c.dependency_counts ? 'project_output_documents') then
    raise exception 'Cleanup requires an authorized output or deletion receipt' using errcode = '42501';
  end if;
  -- Only the backend service can record an already-authorized upload attempt.
  -- Operational/PIC/account changes must not prevent tracking unused bytes.
  if p_actor_id is null or p_uncertain is null or nullif(btrim(p_storage_path),'') is null
    or split_part(p_storage_path,'/',1) <> 'output-documents'
    or split_part(p_storage_path,'/',2) <> p_project_id::text
    or (v_d.id is not null and split_part(p_storage_path,'/',3) <> v_d.document_key)
    or not exists (select 1 from public.output_document_stage_catalog where document_key = split_part(p_storage_path,'/',3))
    or array_length(string_to_array(p_storage_path,'/'),1) <> 4
    or split_part(p_storage_path,'/',4) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-.+$' then
    raise exception 'Invalid exact upload outcome path' using errcode = '22023';
  end if;
  -- Registry rows protect draft and immutable snapshot refs through their FKs.
  -- Preserve a concurrent committed upload, even if its response was lost.
  if exists (select 1 from public.project_output_document_files where storage_path = p_storage_path)
    or exists (select 1 from public.document_versions where storage_path = p_storage_path)
    or exists (select 1 from public.project_output_documents where storage_path = p_storage_path)
    or exists (select 1 from public.project_output_document_versions where storage_path = p_storage_path)
    or exists (select 1 from public.project_intake_attachments where storage_path = p_storage_path)
    or exists (select 1 from public.milestone_contribution_attachments where storage_path = p_storage_path) then
    return null;
  end if;
  select c.id into v_id from public.project_deletion_cleanups c
    where c.storage_paths = jsonb_build_array(p_storage_path) for update;
  if found then
    if p_uncertain then
      update public.project_deletion_cleanups set status = 'PENDING',failure_code = 'OUTPUT_UPLOAD_UNCONFIRMED',
        failed_at = null,updated_at = now(),
        dependency_counts = dependency_counts || jsonb_build_object('output_upload_unconfirmed',1)
      where id = v_id and status <> 'COMPLETED';
    end if;
    -- A pending uncertainty is never promoted to retryable just by another call.
    return v_id;
  end if;
  insert into public.project_deletion_cleanups
    (project_id,project_name,initiated_by,status,storage_paths,storage_object_count,dependency_counts,failure_code,failed_at)
  values (p_project_id,'Output upload cleanup',p_actor_id,
    case when p_uncertain then 'PENDING' else 'FAILED' end,jsonb_build_array(p_storage_path),1,
    jsonb_build_object('output_upload_orphans',1,'output_upload_unconfirmed',case when p_uncertain then 1 else 0 end),
    case when p_uncertain then 'OUTPUT_UPLOAD_UNCONFIRMED' else 'STORAGE_DELETE_FAILED' end,
    case when p_uncertain then null else now() end) returning id into v_id;
  -- Phase 22 refuses to attach any recorded cleanup path, including COMPLETED.
  -- Late metadata persistence cannot attach bytes scheduled for investigation.
  return v_id;
end $$;

revoke all on function public.record_output_upload_outcome(uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.record_output_upload_outcome(uuid,uuid,uuid,text,boolean) to service_role;

commit;
