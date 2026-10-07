-- Additive. Deploy with the matching backend; old review writes are retired.
begin;
do $$ begin
  if to_regprocedure('public.assert_output_file_actor(uuid,uuid,boolean,boolean)') is null
    or to_regclass('public.project_output_document_version_files') is null
    or to_regclass('public.project_pic_requests') is null then
    raise exception 'Phase 28 requires Phases 22 through 27';
  end if;
end $$;

create table public.project_output_file_revisions (
  version_id uuid not null,
  file_id uuid not null,
  feedback text not null check (length(btrim(feedback)) between 1 and 2000 and feedback ~ '[^[:space:]]'),
  primary key(version_id,file_id),
  foreign key(version_id,file_id) references public.project_output_document_version_files(version_id,file_id) on delete cascade
);
-- No backfill: a legacy general review does not identify individual files.
create table public.project_output_review_requests (
  output_document_id uuid not null references public.project_output_documents(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null,
  payload jsonb not null,
  version_id uuid not null references public.project_output_document_versions(id) on delete cascade,
  new_status text not null check(new_status in ('APPROVED','REVISION_REQUIRED')),
  created_at timestamptz not null default now(),
  primary key(output_document_id,request_id),
  unique(version_id)
);
alter table public.project_output_file_revisions enable row level security;
alter table public.project_output_review_requests enable row level security;
revoke all on public.project_output_file_revisions,public.project_output_review_requests from public,anon,authenticated,service_role;
grant select on public.project_output_file_revisions,public.project_output_review_requests to service_role;

create function public.protect_output_file_revision()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_project uuid;
begin
  if tg_op = 'INSERT' and current_setting('workflow.output_review_id',true) = new.version_id::text then return new; end if;
  if tg_op = 'DELETE' then
    select project_id into v_project from public.project_output_document_versions where id = old.version_id;
    if not found or current_setting('workflow.project_deletion_id',true) = v_project::text then return old; end if;
  end if;
  raise exception 'Historical file feedback is immutable' using errcode = '22023';
end $$;
create trigger output_file_revision_immutable before insert or update or delete on public.project_output_file_revisions
  for each row execute function public.protect_output_file_revision();

create function public.review_project_output_document_snapshot(
  p_output_document_id uuid,p_expected_version_id uuid,p_request_id uuid,p_action text,
  p_actor_id uuid,p_feedback text,p_file_revisions jsonb
)
returns table(document_id uuid,version_id uuid,new_status text,replayed boolean)
language plpgsql security definer set search_path = pg_catalog as $$
#variable_conflict use_column
declare v_d public.project_output_documents%rowtype; v_r public.project_output_review_requests%rowtype;
  v_status text; v_markers jsonb; v_payload jsonb; v_count integer;
begin
  -- Same project -> output lock order as upload/submit/deletion/PIC changes.
  v_d := public.lock_output_file_document(p_output_document_id);
  perform public.assert_output_file_actor(v_d.id,p_actor_id,true,false);
  if p_request_id is null or p_expected_version_id is null or p_action is null or p_action not in ('APPROVE','REVISE')
    or p_file_revisions is null or jsonb_typeof(p_file_revisions) <> 'array'
    or length(coalesce(p_feedback,'')) > 2000 then
    raise exception 'Invalid output review' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_file_revisions) m
    where jsonb_typeof(m) <> 'object' or jsonb_typeof(m->'file_id') is distinct from 'string'
      or jsonb_typeof(m->'feedback') is distinct from 'string'
      or length(btrim(m->>'feedback')) not between 1 and 2000 or m->>'feedback' !~ '[^[:space:]]'
      or (m - array['file_id','feedback']) <> '{}'::jsonb) then
    raise exception 'Invalid file feedback' using errcode = '22023';
  end if;
  select count(*),coalesce(jsonb_agg(jsonb_build_object('file_id',(m->>'file_id')::uuid,
    'feedback',btrim(m->>'feedback')) order by (m->>'file_id')::uuid),'[]'::jsonb)
    into v_count,v_markers from jsonb_array_elements(p_file_revisions) m;
  if v_count > 10 or (p_action = 'APPROVE' and v_count <> 0) or (p_action = 'REVISE' and v_count < 1)
    or v_count <> (select count(distinct m->>'file_id') from jsonb_array_elements(v_markers) m) then
    raise exception 'Invalid file revision selection' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('version_id',p_expected_version_id,'action',p_action,
    'feedback',nullif(btrim(p_feedback),''),'file_revisions',v_markers);
  select * into v_r from public.project_output_review_requests
    where output_document_id = v_d.id and request_id = p_request_id;
  if found then
    if v_r.actor_id is distinct from p_actor_id or v_r.payload is distinct from v_payload then
      raise exception 'Review request ID reused with different content' using errcode = '22023';
    end if;
    return query select v_d.id,v_r.version_id,v_r.new_status,true; return;
  end if;
  perform public.assert_output_file_actor(v_d.id,p_actor_id,true,true);
  if v_d.current_version_id is distinct from p_expected_version_id or v_d.status <> 'IN_REVIEW' then
    raise exception 'Output snapshot changed' using errcode = '40001';
  end if;
  if exists(select 1 from jsonb_array_elements(v_markers) m where not exists(
    select 1 from public.project_output_document_version_files vf
    where vf.version_id = p_expected_version_id and vf.file_id = (m->>'file_id')::uuid
      and vf.output_document_id = v_d.id and vf.project_id = v_d.project_id)) then
    raise exception 'File does not belong to reviewed snapshot' using errcode = '22023';
  end if;
  v_status := case p_action when 'APPROVE' then 'APPROVED' else 'REVISION_REQUIRED' end;
  update public.project_output_document_versions set status = v_status,reviewed_by = p_actor_id,
    reviewed_at = now(),review_feedback = nullif(btrim(p_feedback),''),updated_at = now()
    where id = p_expected_version_id and output_document_id = v_d.id and status = 'IN_REVIEW'
      and snapshot_kind in ('SUBMITTED','LEGACY_SUBMITTED');
  if not found then raise exception 'Output snapshot changed' using errcode = '40001'; end if;
  perform set_config('workflow.output_review_id',p_expected_version_id::text,true);
  insert into public.project_output_file_revisions(version_id,file_id,feedback)
    select p_expected_version_id,(m->>'file_id')::uuid,m->>'feedback' from jsonb_array_elements(v_markers) m;
  -- Draft references already retain every submitted file; no file/Storage metadata is rewritten.
  -- Existing status trigger enqueues the whole-output notification intent in this transaction.
  update public.project_output_documents set status = v_status,reviewed_by = p_actor_id,
    reviewed_at = now(),review_feedback = nullif(btrim(p_feedback),''),updated_at = now() where id = v_d.id;
  insert into public.activity_logs(project_id,user_id,action,description)
    values(v_d.project_id,p_actor_id,case p_action when 'APPROVE' then 'OUTPUT_DOCUMENTS_APPROVED'
      else 'OUTPUT_DOCUMENTS_REVISION_REQUESTED' end,
      jsonb_build_object('object_type','OUTPUT_DOCUMENT','object_id',v_d.id,'version_id',p_expected_version_id,
        'request_id',p_request_id,'marked_file_count',v_count)::text);
  insert into public.project_output_review_requests(output_document_id,request_id,actor_id,payload,version_id,new_status)
    values(v_d.id,p_request_id,p_actor_id,v_payload,p_expected_version_id,v_status);
  return query select v_d.id,p_expected_version_id,v_status,false;
end $$;
revoke all on function public.review_project_output_document_snapshot(uuid,uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.review_project_output_document_snapshot(uuid,uuid,uuid,text,uuid,text,jsonb) to service_role;
-- Retire the non-receipted review write, including old server instances.
revoke all on function public.transition_project_output_document_version(uuid,uuid,text,uuid,text,text) from public,anon,authenticated,service_role;

alter function public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text) rename to submit_output_draft_phase22_core;
revoke all on function public.submit_output_draft_phase22_core(uuid,bigint,uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.submit_project_output_document_draft(
  p_output_document_id uuid,p_expected_revision bigint,p_request_id uuid,p_actor_id uuid,p_submission_note text
)
returns table(document_id uuid,version_id uuid,version_number integer,draft_revision bigint,new_status text,created boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare v_d public.project_output_documents%rowtype;
begin
  v_d := public.lock_output_file_document(p_output_document_id);
  perform public.assert_output_file_actor(v_d.id,p_actor_id,false,false);
  -- A committed submit replay is validated by the unchanged core receipt logic.
  if not exists(select 1 from public.project_output_document_versions v
    where v.output_document_id = v_d.id and v.submission_request_id = p_request_id) then
    perform public.assert_output_file_actor(v_d.id,p_actor_id,false,true);
    if exists(select 1 from public.project_output_file_revisions r
      join public.project_output_document_draft_files df on df.file_id = r.file_id and df.output_document_id = v_d.id
      where r.version_id = v_d.current_version_id) then
      raise exception 'Marked snapshot files must be replaced or removed before submission' using errcode = '22023';
    end if;
  end if;
  return query select * from public.submit_output_draft_phase22_core(
    p_output_document_id,p_expected_revision,p_request_id,p_actor_id,p_submission_note);
end $$;
revoke all on function public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text) to service_role;
commit;
