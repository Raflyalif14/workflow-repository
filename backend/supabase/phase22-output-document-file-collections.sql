-- Phase 22: editable file drafts and immutable whole-output review snapshots.
-- Apply after Phases 13, 18a/18b, 19, 20 and 21 during a coordinated write pause.
-- No Storage bytes are copied or deleted by this migration.
begin;

lock table public.projects, public.project_milestones, public.project_output_documents,
  public.project_output_document_versions in share row exclusive mode;

do $$ begin
  if to_regclass('public.output_document_stage_catalog') is null then
    raise exception 'Phase 22 requires Phase 19';
  end if;
  if to_regclass('public.milestone_submission_packages') is not null
    or to_regclass('public.milestone_submission_attachments') is not null
    or to_regclass('public.milestone_approvals') is not null then
    raise exception 'Phase 22 requires completed Phase 18b retirement';
  end if;
  if exists (select 1 from public.project_output_document_versions v
    join public.project_output_documents od on od.id = v.output_document_id
    where v.project_id is distinct from od.project_id) then
    raise exception 'Phase 22: legacy version/project mismatch; inspect preflight';
  end if;
  if exists (select 1 from public.project_output_documents od
    left join public.project_output_document_versions v on v.id = od.current_version_id
    where od.current_version_id is not null and (v.id is null
      or v.output_document_id is distinct from od.id
      or v.storage_path is distinct from od.storage_path)) then
    raise exception 'Phase 22: legacy active file/version mismatch; inspect preflight';
  end if;
end $$;

alter table public.project_output_documents
  add column draft_revision bigint not null default 0 check (draft_revision >= 0),
  add constraint project_output_documents_project_identity_unique unique (id, project_id);
alter table public.project_output_document_versions
  add column snapshot_kind text not null default 'LEGACY_UPLOAD_UNCONFIRMED'
    check (snapshot_kind in ('SUBMITTED','LEGACY_SUBMITTED','LEGACY_UPLOAD_UNCONFIRMED')),
  add column submitted_draft_revision bigint,
  add column submission_request_id uuid,
  add column submission_actor_id uuid;
create unique index project_output_versions_submission_request_unique
  on public.project_output_document_versions(output_document_id, submission_request_id)
  where submission_request_id is not null;
create unique index project_output_versions_draft_revision_unique
  on public.project_output_document_versions(output_document_id, submitted_draft_revision)
  where submitted_draft_revision is not null;

-- A historical upload is not presumed to have been submitted. Existing IDs,
-- version numbers, timestamps, review fields and notification references remain.
update public.project_output_document_versions
set snapshot_kind = 'LEGACY_SUBMITTED'
where submitted_at is not null or status in ('IN_REVIEW','REVISION_REQUIRED','APPROVED');

create table public.project_output_document_files (
  id uuid primary key,
  output_document_id uuid not null,
  project_id uuid not null,
  file_name text not null,
  storage_path text not null,
  file_size bigint check (file_size is null or file_size >= 0),
  mime_type text,
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid references public.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  constraint output_files_output_project_fkey foreign key (output_document_id, project_id)
    references public.project_output_documents(id, project_id) on delete cascade,
  constraint output_files_identity_unique unique (id, output_document_id, project_id)
);
create index output_files_project_idx on public.project_output_document_files(project_id);
create index output_files_exact_path_idx on public.project_output_document_files(storage_path);
create table public.project_output_document_draft_files (
  output_document_id uuid not null,
  file_id uuid not null,
  project_id uuid not null,
  position integer not null check (position > 0),
  primary key (output_document_id, file_id),
  unique (output_document_id, position),
  foreign key (file_id, output_document_id, project_id)
    references public.project_output_document_files(id, output_document_id, project_id) on delete cascade
);
create table public.project_output_document_version_files (
  version_id uuid not null,
  output_document_id uuid not null,
  file_id uuid not null,
  project_id uuid not null,
  position integer not null check (position > 0),
  primary key (version_id, file_id),
  unique (version_id, position),
  foreign key (version_id, output_document_id)
    references public.project_output_document_versions(id, output_document_id) on delete cascade,
  foreign key (file_id, output_document_id, project_id)
    references public.project_output_document_files(id, output_document_id, project_id) on delete cascade
);
create index output_version_files_output_idx on public.project_output_document_version_files(output_document_id);
create table public.project_output_document_draft_requests (
  output_document_id uuid not null references public.project_output_documents(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null,
  request_payload jsonb not null,
  result_revision bigint not null,
  result_file_id uuid,
  created_at timestamptz not null default now(),
  primary key (output_document_id, request_id)
);

insert into public.project_output_document_files
  (id,output_document_id,project_id,file_name,storage_path,file_size,mime_type,uploaded_by,uploaded_at)
select v.id,v.output_document_id,v.project_id,v.file_name,v.storage_path,v.file_size,v.mime_type,v.uploaded_by,v.uploaded_at
from public.project_output_document_versions v;
insert into public.project_output_document_version_files(version_id,output_document_id,file_id,project_id,position)
select id,output_document_id,id,project_id,1 from public.project_output_document_versions;
-- Preserve a legacy active upload even if no version was ever initialized.
insert into public.project_output_document_files
  (id,output_document_id,project_id,file_name,storage_path,file_size,mime_type,uploaded_by,uploaded_at)
select od.id,od.id,od.project_id,od.file_name,od.storage_path,od.file_size,od.mime_type,od.uploaded_by,
  coalesce(od.uploaded_at,od.created_at)
from public.project_output_documents od
where od.current_version_id is null and od.file_name is not null and od.storage_path is not null;
insert into public.project_output_document_draft_files(output_document_id,file_id,project_id,position)
select od.id,coalesce(od.current_version_id,od.id),od.project_id,1
from public.project_output_documents od
join public.project_output_document_files f on f.id = coalesce(od.current_version_id,od.id);

do $$ declare t text; begin
  foreach t in array array['project_output_document_files','project_output_document_draft_files',
    'project_output_document_version_files','project_output_document_draft_requests'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)',t || '_service_role',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on table public.%I to service_role',t);
  end loop;
end $$;

-- Lock project -> milestone -> output to serialize persistence against scope,
-- PIC, postponement and project deletion, then validate the persisted mapping.
create function public.lock_output_file_document(p_output_document_id uuid)
returns public.project_output_documents language plpgsql security definer set search_path = pg_catalog as $$
declare v_d public.project_output_documents%rowtype; v_p public.projects%rowtype;
  v_m public.project_milestones%rowtype;
begin
  select * into v_d from public.project_output_documents where id = p_output_document_id;
  if not found then raise exception 'Output not found' using errcode = 'P0002'; end if;
  select * into v_p from public.projects where id = v_d.project_id for update;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
  select * into v_m from public.project_milestones where id = v_d.milestone_id for update;
  select * into v_d from public.project_output_documents where id = p_output_document_id for update;
  if not found or v_m.id is null or v_m.id is distinct from v_d.milestone_id
    or v_m.project_id is distinct from v_d.project_id
    or not exists (select 1 from public.workflow_stages ws
      join public.output_document_stage_catalog c on c.document_key = v_d.document_key
      join public.scenarios s on s.id = v_p.scenario_id
      where ws.id = v_m.workflow_stage_id and ws.default_role = 'SA'
        and ws.scenario_id = v_p.scenario_id and ws.stage_key = c.stage_key
        and (s.name = 'Pra-Tender' or s.name = 'On Submission Tender' and c.group_key = 'ON_SUBMISSION_TENDER'))
    or not (v_d.is_required or v_d.is_selected) then
    raise exception 'Output milestone mapping or scope is invalid' using errcode = '22023';
  end if;
  return v_d;
end $$;

create function public.assert_output_file_actor(p_output_document_id uuid,p_actor_id uuid,p_review boolean,p_require_active boolean)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_d public.project_output_documents%rowtype; v_p public.projects%rowtype; v_m public.project_milestones%rowtype;
  v_user public.users%rowtype;
begin
  select * into v_d from public.project_output_documents where id = p_output_document_id;
  select * into v_p from public.projects where id = v_d.project_id;
  select * into v_m from public.project_milestones where id = v_d.milestone_id;
  select * into v_user from public.users u where u.id = p_actor_id for share;
  if not found or v_user.is_active is distinct from true
    or not (p_review and v_user.role = 'HEAD_SA' or not p_review and v_user.role in ('SA','HEAD_SA'))
    or (not p_review and (v_p.pic_id is distinct from p_actor_id or v_m.pic_id is distinct from p_actor_id)) then
    raise exception 'Output actor is not authorized' using errcode = '42501';
  end if;
  if p_require_active and (v_p.status <> 'ACTIVE' or coalesce(v_p.is_postponed,false)
    or v_m.status <> 'IN_PROGRESS'
    or (not p_review and v_m.start_date is not null and v_m.start_date > (now() at time zone 'Asia/Jakarta')::date)) then
    raise exception 'Output milestone is not active' using errcode = '22023';
  end if;
end $$;

create function public.mutate_project_output_document_draft(
  p_output_document_id uuid,p_expected_revision bigint,p_request_id uuid,p_action text,p_actor_id uuid,
  p_target_file_id uuid,p_file_id uuid,p_file_name text,p_storage_path text,p_file_size bigint,
  p_mime_type text,p_uploaded_at timestamptz,p_content_sha256 text
)
returns table(draft_revision bigint,file_id uuid,applied boolean)
language plpgsql security definer set search_path = pg_catalog as $$
#variable_conflict use_column
declare v_d public.project_output_documents%rowtype; v_receipt public.project_output_document_draft_requests%rowtype;
  v_payload jsonb; v_position integer; v_count integer; v_size bigint; v_first public.project_output_document_files%rowtype;
begin
  v_d := public.lock_output_file_document(p_output_document_id);
  perform public.assert_output_file_actor(v_d.id,p_actor_id,false,false);
  v_payload := jsonb_build_object('action',p_action,'expectedRevision',p_expected_revision,'targetFileId',p_target_file_id,
    'fileId',p_file_id,'fileName',p_file_name,'fileSize',p_file_size,'mimeType',p_mime_type,'sha256',p_content_sha256);
  select * into v_receipt from public.project_output_document_draft_requests r
    where r.output_document_id = v_d.id and r.request_id = p_request_id;
  if found then
    if v_receipt.actor_id is distinct from p_actor_id or v_receipt.request_payload is distinct from v_payload then
      raise exception 'Draft request ID reused with different content' using errcode = '22023';
    end if;
    return query select v_d.draft_revision,v_receipt.result_file_id,false; return;
  end if;
  perform public.assert_output_file_actor(v_d.id,p_actor_id,false,true);
  if p_request_id is null or p_expected_revision is null or v_d.draft_revision <> p_expected_revision then
    raise exception 'Draft revision changed' using errcode = '40001';
  end if;
  if v_d.status not in ('TO_DO','DRAFT','REVISION_REQUIRED') then
    raise exception 'Draft cannot be edited in its current state' using errcode = '22023';
  end if;
  if p_action not in ('ADD','REPLACE','REMOVE') or p_action is null then
    raise exception 'Unsupported draft action' using errcode = '22023';
  end if;
  if p_action in ('REPLACE','REMOVE') then
    select df.position into v_position from public.project_output_document_draft_files df
      where df.output_document_id = v_d.id and df.file_id = p_target_file_id;
    if not found then raise exception 'Target draft file not found' using errcode = '40001'; end if;
  elsif p_target_file_id is not null then
    raise exception 'ADD cannot replace a file' using errcode = '22023';
  end if;
  if p_action in ('ADD','REPLACE') then
    if p_file_id is null or nullif(btrim(p_file_name),'') is null or nullif(btrim(p_storage_path),'') is null
      or p_file_size is null or p_file_size <= 0 or p_file_size > 52428800
      or p_content_sha256 is null or p_content_sha256 !~ '^[0-9a-f]{64}$'
      or lower(p_file_name) !~ '\.(pdf|doc|docx|xls|xlsx|ppt|pptx|png|jpg|jpeg|svg|zip|txt|json)$' then
      raise exception 'Invalid draft file metadata' using errcode = '22023';
    end if;
    if split_part(p_storage_path,'/',1) <> 'output-documents'
      or split_part(p_storage_path,'/',2) <> v_d.project_id::text
      or split_part(p_storage_path,'/',3) <> v_d.document_key
      or array_length(string_to_array(p_storage_path,'/'),1) <> 4
      or split_part(p_storage_path,'/',4) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-.+$' then
      raise exception 'Invalid exact output upload path' using errcode = '22023';
    end if;
    if exists (select 1 from public.project_deletion_cleanups c
      where c.storage_paths @> jsonb_build_array(p_storage_path)) then
      raise exception 'Upload path is scheduled for cleanup' using errcode = '40001';
    end if;
    select count(*)::integer,coalesce(sum(f.file_size),0) into v_count,v_size
    from public.project_output_document_draft_files df join public.project_output_document_files f on f.id = df.file_id
    where df.output_document_id = v_d.id and (p_action = 'ADD' or df.file_id <> p_target_file_id);
    if v_count + 1 > 10 or v_size + p_file_size > 209715200 then
      raise exception 'Output exceeds 10 files or 200 MiB' using errcode = '22023';
    end if;
    if p_action = 'ADD' then
      select coalesce(max(df.position),0) + 1 into v_position from public.project_output_document_draft_files df
        where df.output_document_id = v_d.id;
    end if;
    insert into public.project_output_document_files
      (id,output_document_id,project_id,file_name,storage_path,file_size,mime_type,content_sha256,uploaded_by,uploaded_at)
    values (p_file_id,v_d.id,v_d.project_id,p_file_name,p_storage_path,p_file_size,p_mime_type,p_content_sha256,p_actor_id,coalesce(p_uploaded_at,now()));
  end if;
  if p_action in ('REPLACE','REMOVE') then
    delete from public.project_output_document_draft_files where output_document_id = v_d.id and file_id = p_target_file_id;
  end if;
  if p_action in ('ADD','REPLACE') then
    insert into public.project_output_document_draft_files(output_document_id,file_id,project_id,position)
    values (v_d.id,p_file_id,v_d.project_id,v_position);
  end if;
  select f.* into v_first from public.project_output_document_draft_files df
    join public.project_output_document_files f on f.id = df.file_id
    where df.output_document_id = v_d.id order by df.position limit 1;
  update public.project_output_documents set draft_revision = v_d.draft_revision + 1,
    status = case when v_d.status = 'REVISION_REQUIRED' then 'REVISION_REQUIRED' when v_first.id is null then 'TO_DO' else 'DRAFT' end,
    file_name = v_first.file_name,storage_path = v_first.storage_path,file_size = v_first.file_size,mime_type = v_first.mime_type,
    uploaded_by = v_first.uploaded_by,uploaded_at = v_first.uploaded_at,updated_at = now()
    where id = v_d.id;
  insert into public.project_output_document_draft_requests
    (output_document_id,request_id,actor_id,request_payload,result_revision,result_file_id)
  values (v_d.id,p_request_id,p_actor_id,v_payload,v_d.draft_revision + 1,
    case when p_action = 'REMOVE' then p_target_file_id else p_file_id end);
  return query select v_d.draft_revision + 1,case when p_action = 'REMOVE' then p_target_file_id else p_file_id end,true;
end $$;

create function public.submit_project_output_document_draft(
  p_output_document_id uuid,p_expected_revision bigint,p_request_id uuid,p_actor_id uuid,p_submission_note text
)
returns table(document_id uuid,version_id uuid,version_number integer,draft_revision bigint,new_status text,created boolean)
language plpgsql security definer set search_path = pg_catalog as $$
#variable_conflict use_column
declare v_d public.project_output_documents%rowtype; v_existing public.project_output_document_versions%rowtype;
  v_first public.project_output_document_files%rowtype; v_count integer; v_size bigint; v_id uuid; v_number integer;
  v_note text := nullif(btrim(p_submission_note),'');
begin
  v_d := public.lock_output_file_document(p_output_document_id);
  perform public.assert_output_file_actor(v_d.id,p_actor_id,false,false);
  select * into v_existing from public.project_output_document_versions v
    where v.output_document_id = v_d.id and v.submission_request_id = p_request_id;
  if found then
    if v_existing.submission_actor_id is distinct from p_actor_id
      or v_existing.submitted_draft_revision is distinct from p_expected_revision
      or v_existing.submission_note is distinct from v_note then
      raise exception 'Submit request ID reused with different content' using errcode = '22023';
    end if;
    return query select v_d.id,v_existing.id,v_existing.version_number,v_d.draft_revision,v_existing.status,false; return;
  end if;
  perform public.assert_output_file_actor(v_d.id,p_actor_id,false,true);
  if p_request_id is null or p_expected_revision is null or v_d.draft_revision <> p_expected_revision then
    raise exception 'Draft revision changed' using errcode = '40001';
  end if;
  if v_d.status not in ('DRAFT','REVISION_REQUIRED') then
    raise exception 'Output draft is not ready to submit' using errcode = '22023';
  end if;
  select count(*)::integer,coalesce(sum(f.file_size),0) into v_count,v_size
    from public.project_output_document_draft_files df join public.project_output_document_files f on f.id = df.file_id
    where df.output_document_id = v_d.id;
  if v_count < 1 or v_count > 10 or v_size > 209715200 then
    raise exception 'Submission requires 1 to 10 files within 200 MiB' using errcode = '22023';
  end if;
  if exists (select 1 from public.project_output_document_draft_files df
    join public.project_output_document_files f on f.id = df.file_id where df.output_document_id = v_d.id
      and (f.file_size is null or f.file_size <= 0 or f.file_size > 52428800
        or lower(f.file_name) !~ '\.(pdf|doc|docx|xls|xlsx|ppt|pptx|png|jpg|jpeg|svg|zip|txt|json)$')) then
    raise exception 'Draft contains file metadata that must be replaced before submission' using errcode = '22023';
  end if;
  select f.* into v_first from public.project_output_document_draft_files df
    join public.project_output_document_files f on f.id = df.file_id
    where df.output_document_id = v_d.id order by df.position limit 1;
  select coalesce(max(v.version_number),0) + 1 into v_number
    from public.project_output_document_versions v where v.output_document_id = v_d.id;
  v_id := gen_random_uuid();
  insert into public.project_output_document_versions
    (id,output_document_id,project_id,version_number,status,file_name,storage_path,file_size,mime_type,
      uploaded_by,uploaded_at,submitted_at,submission_note,snapshot_kind,submitted_draft_revision,submission_request_id,submission_actor_id)
  values (v_id,v_d.id,v_d.project_id,v_number,'IN_REVIEW',v_first.file_name,v_first.storage_path,v_first.file_size,v_first.mime_type,
    p_actor_id,now(),now(),v_note,'SUBMITTED',p_expected_revision,p_request_id,p_actor_id);
  perform set_config('workflow.output_snapshot_id',v_id::text,true);
  insert into public.project_output_document_version_files(version_id,output_document_id,file_id,project_id,position)
    select v_id,df.output_document_id,df.file_id,df.project_id,df.position
    from public.project_output_document_draft_files df where df.output_document_id = v_d.id;
  update public.project_output_documents set status = 'IN_REVIEW',current_version_id = v_id,
    draft_revision = v_d.draft_revision + 1,file_name = v_first.file_name,storage_path = v_first.storage_path,
    file_size = v_first.file_size,mime_type = v_first.mime_type,uploaded_by = p_actor_id,uploaded_at = now(),
    reviewed_by = null,reviewed_at = null,review_feedback = null,updated_at = now()
    where id = v_d.id;
  -- The existing output status trigger creates one notification intent per
  -- recipient. Replays return above without updating status or inserting refs.
  return query select v_d.id,v_id,v_number,v_d.draft_revision + 1,'IN_REVIEW'::text,true;
end $$;

create or replace function public.transition_project_output_document_version(
  p_output_document_id uuid,p_expected_version_id uuid,p_action text,p_actor_id uuid,p_feedback text,p_submission_note text
)
returns table(document_id uuid,version_id uuid,new_status text)
language plpgsql security definer set search_path = pg_catalog as $$
#variable_conflict use_column
declare v_d public.project_output_documents%rowtype; v_status text;
begin
  v_d := public.lock_output_file_document(p_output_document_id);
  perform public.assert_output_file_actor(v_d.id,p_actor_id,true,true);
  if p_action not in ('APPROVE','REVISE') or p_action is null then
    raise exception 'Use draft snapshot submit for submission' using errcode = '22023';
  end if;
  if v_d.current_version_id is distinct from p_expected_version_id then
    raise exception 'Output document version changed' using errcode = '40001';
  end if;
  if v_d.status <> 'IN_REVIEW' then
    raise exception 'Output document is not awaiting review' using errcode = '22023';
  end if;
  if p_action = 'REVISE' and nullif(btrim(p_feedback),'') is null then
    raise exception 'Revision feedback is required' using errcode = '22023';
  end if;
  v_status := case when p_action = 'APPROVE' then 'APPROVED' else 'REVISION_REQUIRED' end;
  update public.project_output_document_versions set status = v_status,reviewed_by = p_actor_id,
    reviewed_at = now(),review_feedback = p_feedback,updated_at = now()
    where id = p_expected_version_id and output_document_id = v_d.id and status = 'IN_REVIEW'
      and snapshot_kind in ('SUBMITTED','LEGACY_SUBMITTED');
  if not found then raise exception 'Output document version changed' using errcode = '40001'; end if;
  update public.project_output_documents set status = v_status,reviewed_by = p_actor_id,
    reviewed_at = now(),review_feedback = p_feedback,updated_at = now() where id = v_d.id;
  return query select v_d.id,p_expected_version_id,v_status;
end $$;

-- Old application instances cannot create a review version on each upload.
create or replace function public.create_project_output_document_version(
  p_output_document_id uuid,p_expected_version_id uuid,p_file_name text,p_storage_path text,
  p_file_size bigint,p_mime_type text,p_uploaded_by uuid,p_uploaded_at timestamptz
)
returns table(version_id uuid,version_number integer)
language plpgsql security definer set search_path = pg_catalog as $$
begin raise exception 'Phase 22 requires draft file upload' using errcode = '0A000'; end $$;
revoke all on function public.create_project_output_document_version(uuid,uuid,text,text,bigint,text,uuid,timestamptz)
  from public,anon,authenticated,service_role;

create function public.protect_output_file_snapshot()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('workflow.output_snapshot_id',true) = new.version_id::text then return new; end if;
    raise exception 'Submitted output snapshot cannot receive additional files' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then
    if current_setting('workflow.project_deletion_id',true) = old.project_id::text
      or not exists (select 1 from public.projects where id = old.project_id) then return old; end if;
    raise exception 'Historical output file references cannot be deleted' using errcode = '22023';
  end if;
  if tg_table_name = 'project_output_document_versions' then
    if (to_jsonb(new) - array['status','reviewed_by','reviewed_at','review_feedback','updated_at'])
      is not distinct from (to_jsonb(old) - array['status','reviewed_by','reviewed_at','review_feedback','updated_at']) then return new; end if;
    if new.uploaded_by is null and old.uploaded_by is not null
      and not exists (select 1 from public.users where id = old.uploaded_by)
      and (to_jsonb(new) - 'uploaded_by') is not distinct from (to_jsonb(old) - 'uploaded_by') then return new; end if;
  elsif tg_table_name = 'project_output_document_files' then
    -- Preserve account-deletion behavior of the existing nullable uploader FK.
    if new.uploaded_by is null and old.uploaded_by is not null
      and not exists (select 1 from public.users where id = old.uploaded_by)
      and (to_jsonb(new) - 'uploaded_by') is not distinct from (to_jsonb(old) - 'uploaded_by') then return new; end if;
  end if;
  raise exception 'Submitted output file metadata and references are immutable' using errcode = '22023';
end $$;
create trigger output_files_immutable before update or delete on public.project_output_document_files
  for each row execute function public.protect_output_file_snapshot();
create trigger output_snapshot_refs_immutable before insert or update or delete on public.project_output_document_version_files
  for each row execute function public.protect_output_file_snapshot();
create trigger output_snapshot_metadata_immutable before update or delete on public.project_output_document_versions
  for each row execute function public.protect_output_file_snapshot();

create function public.register_output_upload_cleanup(p_project_id uuid,p_output_document_id uuid,p_actor_id uuid,p_storage_path text)
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
  -- This service-only cleanup receipt is not a new output write. The upload was
  -- authorized before Storage work; PIC/status/account changes must not prevent
  -- tracking its unused bytes. No mutation eligibility is bypassed by this RPC.
  if p_actor_id is null or nullif(btrim(p_storage_path),'') is null
    or split_part(p_storage_path,'/',1) <> 'output-documents'
    or split_part(p_storage_path,'/',2) <> p_project_id::text
    or (v_d.id is not null and split_part(p_storage_path,'/',3) <> v_d.document_key)
    or not exists (select 1 from public.output_document_stage_catalog where document_key = split_part(p_storage_path,'/',3))
    or array_length(string_to_array(p_storage_path,'/'),1) <> 4
    or split_part(p_storage_path,'/',4) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-.+$' then
    raise exception 'Invalid exact upload cleanup path' using errcode = '22023';
  end if;
  if exists (select 1 from public.project_output_document_files where storage_path = p_storage_path)
    or exists (select 1 from public.document_versions where storage_path = p_storage_path)
    or exists (select 1 from public.project_output_documents where storage_path = p_storage_path)
    or exists (select 1 from public.project_output_document_versions where storage_path = p_storage_path)
    or exists (select 1 from public.project_intake_attachments where storage_path = p_storage_path)
    or exists (select 1 from public.milestone_contribution_attachments where storage_path = p_storage_path) then
    raise exception 'Upload path is still referenced' using errcode = '40001';
  end if;
  select c.id into v_id from public.project_deletion_cleanups c
    where c.storage_paths = jsonb_build_array(p_storage_path) limit 1;
  if found then return v_id; end if;
  insert into public.project_deletion_cleanups
    (project_id,project_name,initiated_by,status,storage_paths,storage_object_count,dependency_counts,failure_code,failed_at)
  values (p_project_id,'Output upload cleanup',p_actor_id,'FAILED',jsonb_build_array(p_storage_path),1,
    jsonb_build_object('output_upload_orphans',1),'STORAGE_DELETE_FAILED',now()) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.lock_output_file_document(uuid) from public,anon,authenticated;
revoke all on function public.assert_output_file_actor(uuid,uuid,boolean,boolean) from public,anon,authenticated;
revoke all on function public.protect_output_file_snapshot() from public,anon,authenticated;
revoke all on function public.mutate_project_output_document_draft(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.mutate_project_output_document_draft(uuid,bigint,uuid,text,uuid,uuid,uuid,text,text,bigint,text,timestamptz,text) to service_role;
revoke all on function public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.submit_project_output_document_draft(uuid,bigint,uuid,uuid,text) to service_role;
revoke all on function public.transition_project_output_document_version(uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.transition_project_output_document_version(uuid,uuid,text,uuid,text,text) to service_role;
revoke all on function public.register_output_upload_cleanup(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.register_output_upload_cleanup(uuid,uuid,uuid,text) to service_role;

-- The current project-deletion function is replaced below, preserving its
-- authorization/receipt contract and adding all registry paths.

create or replace function public.delete_project_with_cleanup(
  p_project_id uuid,
  p_confirmation text,
  p_initiated_by uuid
)
returns table(cleanup_id uuid, storage_paths jsonb, storage_object_count integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  v_project public.projects%rowtype;
  v_paths jsonb;
  v_counts jsonb;
  v_cleanup_id uuid;
begin
  if not exists (
    select 1 from public.users
    where id = p_initiated_by and role = 'SUPER_ADMIN' and is_active = true
  ) then
    raise exception 'Project deletion initiator is not an active SUPER_ADMIN' using errcode = '42501';
  end if;

  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if p_confirmation is distinct from v_project.name then
    raise exception 'Project confirmation does not match' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(path order by path), '[]'::jsonb) into v_paths
  from (
    select dv.storage_path as path
    from public.document_versions dv
    join public.documents d on d.id = dv.document_id
    where d.project_id = p_project_id
    union
    select a.storage_path as path
    from public.milestone_contribution_attachments a
    join public.milestone_contributions c on c.id = a.contribution_id
    where c.project_id = p_project_id
    union
    select a.storage_path as path
    from public.project_intake_attachments a
    where a.project_id = p_project_id
    union
    select od.storage_path as path
    from public.project_output_documents od
    where od.project_id = p_project_id and od.storage_path is not null
    union
    select version.storage_path as path
    from public.project_output_document_versions version
    where version.project_id = p_project_id
    union
    select f.storage_path as path
    from public.project_output_document_files f
    where f.project_id = p_project_id
  ) paths
  where path is not null
    and not exists (select 1 from public.project_output_document_files f where f.storage_path = paths.path and f.project_id <> p_project_id)
    and not exists (select 1 from public.project_output_documents od where od.storage_path = paths.path and od.project_id <> p_project_id)
    and not exists (select 1 from public.project_output_document_versions v where v.storage_path = paths.path and v.project_id <> p_project_id)
    and not exists (select 1 from public.document_versions dv join public.documents d on d.id = dv.document_id where dv.storage_path = paths.path and d.project_id is distinct from p_project_id)
    and not exists (select 1 from public.project_intake_attachments a where a.storage_path = paths.path and a.project_id <> p_project_id)
    and not exists (select 1 from public.milestone_contribution_attachments a join public.milestone_contributions c on c.id = a.contribution_id where a.storage_path = paths.path and c.project_id <> p_project_id);

  select jsonb_build_object(
    'milestones', (select count(*) from public.project_milestones where project_id = p_project_id),
    'deadline_approvals', (select count(*) from public.milestone_deadline_approvals where milestone_id in (select id from public.project_milestones where project_id = p_project_id)),
    'deadline_history', (select count(*) from public.milestone_deadline_history where milestone_id in (select id from public.project_milestones where project_id = p_project_id)),
    'project_plan_approvals', (select count(*) from public.project_plan_approvals where project_id = p_project_id),
    'assignments', (select count(*) from public.project_assignments where project_id = p_project_id),
    'activity_logs', (select count(*) from public.activity_logs where project_id = p_project_id),
    'notifications', (select count(*) from public.notifications where project_id = p_project_id or milestone_id in (select id from public.project_milestones where project_id = p_project_id)),
    'documents', (select count(*) from public.documents where project_id = p_project_id),
    'document_versions', (select count(*) from public.document_versions dv join public.documents d on d.id = dv.document_id where d.project_id = p_project_id),
    'document_version_approvals', (select count(*) from public.document_version_approvals a join public.document_versions dv on dv.id = a.document_version_id join public.documents d on d.id = dv.document_id where d.project_id = p_project_id),
    'document_comments', (select count(*) from public.document_comments c join public.documents d on d.id = c.document_id where d.project_id = p_project_id),
    'milestone_contributions', (select count(*) from public.milestone_contributions where project_id = p_project_id),
    'milestone_contribution_attachments', (select count(*) from public.milestone_contribution_attachments a join public.milestone_contributions c on c.id = a.contribution_id where c.project_id = p_project_id),
    'project_intake_attachments', (select count(*) from public.project_intake_attachments where project_id = p_project_id),
    'project_output_document_files', (select count(*) from public.project_output_document_files where project_id = p_project_id),
    'project_output_document_draft_files', (select count(*) from public.project_output_document_draft_files where project_id = p_project_id),
    'project_output_document_version_files', (select count(*) from public.project_output_document_version_files where project_id = p_project_id),
    'project_output_document_draft_requests', (select count(*) from public.project_output_document_draft_requests where output_document_id in (select id from public.project_output_documents where project_id = p_project_id)),
    'project_output_documents', (select count(*) from public.project_output_documents where project_id = p_project_id),
    'project_output_document_versions', (select count(*) from public.project_output_document_versions where project_id = p_project_id)
  ) into v_counts;

  insert into public.project_deletion_cleanups(project_id, project_name, initiated_by, storage_paths, storage_object_count, dependency_counts)
  values (p_project_id, v_project.name, p_initiated_by, v_paths, jsonb_array_length(v_paths), v_counts)
  returning id into v_cleanup_id;

  delete from public.notification_deliveries where notification_id in (select id from public.notifications where project_id = p_project_id or milestone_id in (select id from public.project_milestones where project_id = p_project_id));
  delete from public.notifications where project_id = p_project_id or milestone_id in (select id from public.project_milestones where project_id = p_project_id);
  delete from public.document_version_approvals where document_version_id in (select dv.id from public.document_versions dv join public.documents d on d.id = dv.document_id where d.project_id = p_project_id);
  delete from public.document_comments where document_id in (select id from public.documents where project_id = p_project_id);
  delete from public.milestone_contribution_attachments where contribution_id in (select id from public.milestone_contributions where project_id = p_project_id);
  delete from public.milestone_contributions where project_id = p_project_id;
  delete from public.project_intake_attachments where project_id = p_project_id;
  perform set_config('workflow.project_deletion_id',p_project_id::text,true);
  update public.project_output_documents set current_version_id = null where project_id = p_project_id;
  delete from public.project_output_document_versions where project_id = p_project_id;
  delete from public.project_output_document_files where project_id = p_project_id;
  delete from public.project_output_documents where project_id = p_project_id;
  delete from public.milestone_deadline_approvals where milestone_id in (select id from public.project_milestones where project_id = p_project_id);
  delete from public.milestone_deadline_history where milestone_id in (select id from public.project_milestones where project_id = p_project_id);
  delete from public.project_plan_approvals where project_id = p_project_id;
  delete from public.project_assignments where project_id = p_project_id;
  delete from public.activity_logs where project_id = p_project_id;
  delete from public.document_versions where document_id in (select id from public.documents where project_id = p_project_id);
  delete from public.documents where project_id = p_project_id;
  delete from public.project_milestones where project_id = p_project_id;
  delete from public.projects where id = p_project_id and name = p_confirmation;
  if not found then
    raise exception 'Project deletion did not affect the expected project' using errcode = 'P0002';
  end if;

  return query select v_cleanup_id, v_paths, jsonb_array_length(v_paths);
end;
$$;


revoke all on function public.delete_project_with_cleanup(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.delete_project_with_cleanup(uuid,text,uuid) to service_role;

commit;
