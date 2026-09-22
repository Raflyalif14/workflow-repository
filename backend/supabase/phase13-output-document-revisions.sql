-- Phase 13: Partial output submission, batch review, and durable output version history.
-- Phase 12 must be applied first. This migration does not modify milestones or project outcomes.

begin;

lock table public.projects, public.project_output_documents in share row exclusive mode;

create table if not exists public.project_output_document_versions (
  id uuid primary key default gen_random_uuid(),
  output_document_id uuid not null references public.project_output_documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null check (status in ('DRAFT', 'IN_REVIEW', 'REVISION_REQUIRED', 'APPROVED')),
  file_name text not null,
  storage_path text not null,
  file_size bigint check (file_size is null or file_size >= 0),
  mime_type text,
  uploaded_by uuid references public.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  submitted_at timestamptz,
  submission_note text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_output_document_versions_number_unique unique (output_document_id, version_number),
  constraint project_output_document_versions_identity_unique unique (id, output_document_id)
);

alter table public.project_output_documents
  add column if not exists current_version_id uuid;

insert into public.project_output_document_versions (
  output_document_id, project_id, version_number, status,
  file_name, storage_path, file_size, mime_type,
  uploaded_by, uploaded_at, reviewed_by, reviewed_at, review_feedback,
  created_at, updated_at
)
select
  od.id,
  od.project_id,
  1,
  case
    when od.status in ('DRAFT', 'IN_REVIEW', 'REVISION_REQUIRED', 'APPROVED') then od.status
    else 'DRAFT'
  end,
  od.file_name,
  od.storage_path,
  od.file_size,
  od.mime_type,
  od.uploaded_by,
  coalesce(od.uploaded_at, od.created_at),
  od.reviewed_by,
  od.reviewed_at,
  od.review_feedback,
  od.created_at,
  od.updated_at
from public.project_output_documents od
where od.file_name is not null
  and od.storage_path is not null
  and not exists (
    select 1
    from public.project_output_document_versions version
    where version.output_document_id = od.id
  )
on conflict (output_document_id, version_number) do nothing;

update public.project_output_documents od
set current_version_id = version.id
from public.project_output_document_versions version
where version.output_document_id = od.id
  and od.current_version_id is null
  and version.version_number = (
    select max(candidate.version_number)
    from public.project_output_document_versions candidate
    where candidate.output_document_id = od.id
  );

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'project_output_documents_current_version_fkey'
      and conrelid = 'public.project_output_documents'::regclass
  ) then
    alter table public.project_output_documents
      add constraint project_output_documents_current_version_fkey
      foreign key (current_version_id, id)
      references public.project_output_document_versions(id, output_document_id)
      deferrable initially immediate;
  end if;
end;
$$;

create index if not exists project_output_document_versions_document_idx
  on public.project_output_document_versions(output_document_id, version_number desc);

create index if not exists project_output_document_versions_project_idx
  on public.project_output_document_versions(project_id, created_at desc);

alter table public.project_output_document_versions enable row level security;
drop policy if exists project_output_document_versions_service_role on public.project_output_document_versions;
create policy project_output_document_versions_service_role on public.project_output_document_versions
  for all to service_role using (true) with check (true);

revoke all on table public.project_output_document_versions from public, anon, authenticated;
grant select, insert, update, delete on table public.project_output_document_versions to service_role;

create or replace function public.create_project_output_document_version(
  p_output_document_id uuid,
  p_expected_version_id uuid,
  p_file_name text,
  p_storage_path text,
  p_file_size bigint,
  p_mime_type text,
  p_uploaded_by uuid,
  p_uploaded_at timestamptz
)
returns table(version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_document public.project_output_documents%rowtype;
  v_project public.projects%rowtype;
  v_version_id uuid;
  v_version_number integer;
begin
  select * into v_document
  from public.project_output_documents
  where id = p_output_document_id
  for update;
  if not found then
    raise exception 'Output document not found' using errcode = 'P0002';
  end if;

  select * into v_project from public.projects where id = v_document.project_id;
  if v_project.status <> 'ACTIVE' or coalesce(v_project.is_postponed, false) then
    raise exception 'Project is not available for output upload' using errcode = '22023';
  end if;
  if v_project.pic_id is distinct from p_uploaded_by or not exists (
    select 1 from public.users
    where id = p_uploaded_by and role in ('SA', 'HEAD_SA') and is_active = true
  ) then
    raise exception 'Output upload actor is not the assigned PIC' using errcode = '42501';
  end if;
  if v_document.status not in ('TO_DO', 'DRAFT', 'REVISION_REQUIRED') then
    raise exception 'Output document cannot be replaced in its current state' using errcode = '22023';
  end if;
  if v_document.current_version_id is distinct from p_expected_version_id then
    raise exception 'Output document version changed' using errcode = '40001';
  end if;

  select coalesce(max(version.version_number), 0) + 1 into v_version_number
  from public.project_output_document_versions version
  where version.output_document_id = v_document.id;
  v_version_id := gen_random_uuid();

  insert into public.project_output_document_versions (
    id, output_document_id, project_id, version_number, status,
    file_name, storage_path, file_size, mime_type, uploaded_by, uploaded_at
  ) values (
    v_version_id, v_document.id, v_document.project_id, v_version_number, 'DRAFT',
    p_file_name, p_storage_path, p_file_size, p_mime_type, p_uploaded_by, p_uploaded_at
  );

  update public.project_output_documents
  set status = 'DRAFT',
      file_name = p_file_name,
      storage_path = p_storage_path,
      file_size = p_file_size,
      mime_type = p_mime_type,
      uploaded_by = p_uploaded_by,
      uploaded_at = p_uploaded_at,
      reviewed_by = null,
      reviewed_at = null,
      review_feedback = null,
      current_version_id = v_version_id,
      updated_at = p_uploaded_at
  where id = v_document.id;

  return query select v_version_id, v_version_number;
end;
$$;

create or replace function public.transition_project_output_document_version(
  p_output_document_id uuid,
  p_expected_version_id uuid,
  p_action text,
  p_actor_id uuid,
  p_feedback text,
  p_submission_note text
)
returns table(document_id uuid, version_id uuid, new_status text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_document public.project_output_documents%rowtype;
  v_project public.projects%rowtype;
  v_new_status text;
  v_now timestamptz := now();
begin
  select * into v_document
  from public.project_output_documents
  where id = p_output_document_id
  for update;
  if not found then
    raise exception 'Output document not found' using errcode = 'P0002';
  end if;

  select * into v_project from public.projects where id = v_document.project_id;
  if v_document.current_version_id is distinct from p_expected_version_id then
    raise exception 'Output document version changed' using errcode = '40001';
  end if;

  if p_action = 'SUBMIT' then
    if v_project.status <> 'ACTIVE' or coalesce(v_project.is_postponed, false)
      or v_project.pic_id is distinct from p_actor_id
      or not exists (
        select 1 from public.users
        where id = p_actor_id and role in ('SA', 'HEAD_SA') and is_active = true
      ) then
      raise exception 'Output submit actor is not authorized' using errcode = '42501';
    end if;
    if v_document.status not in ('DRAFT', 'REVISION_REQUIRED') or v_document.storage_path is null then
      raise exception 'Output document is not ready for submission' using errcode = '22023';
    end if;
    v_new_status := 'IN_REVIEW';
  elsif p_action in ('APPROVE', 'REVISE') then
    if not exists (
      select 1 from public.users
      where id = p_actor_id and role = 'HEAD_SA' and is_active = true
    ) then
      raise exception 'Output review actor is not authorized' using errcode = '42501';
    end if;
    if v_document.status <> 'IN_REVIEW' then
      raise exception 'Output document is not awaiting review' using errcode = '22023';
    end if;
    if p_action = 'REVISE' and nullif(btrim(p_feedback), '') is null then
      raise exception 'Revision feedback is required' using errcode = '22023';
    end if;
    v_new_status := case when p_action = 'APPROVE' then 'APPROVED' else 'REVISION_REQUIRED' end;
  else
    raise exception 'Unsupported output document transition' using errcode = '22023';
  end if;

  update public.project_output_document_versions
  set status = v_new_status,
      submitted_at = case when p_action = 'SUBMIT' then v_now else submitted_at end,
      submission_note = case when p_action = 'SUBMIT' then p_submission_note else submission_note end,
      reviewed_by = case when p_action in ('APPROVE', 'REVISE') then p_actor_id else reviewed_by end,
      reviewed_at = case when p_action in ('APPROVE', 'REVISE') then v_now else reviewed_at end,
      review_feedback = case when p_action in ('APPROVE', 'REVISE') then p_feedback else review_feedback end,
      updated_at = v_now
  where id = p_expected_version_id
    and output_document_id = v_document.id
    and status = v_document.status;
  if not found then
    raise exception 'Output document version changed' using errcode = '40001';
  end if;

  update public.project_output_documents
  set status = v_new_status,
      reviewed_by = case when p_action in ('APPROVE', 'REVISE') then p_actor_id else reviewed_by end,
      reviewed_at = case when p_action in ('APPROVE', 'REVISE') then v_now else reviewed_at end,
      review_feedback = case when p_action in ('APPROVE', 'REVISE') then p_feedback else review_feedback end,
      updated_at = v_now
  where id = v_document.id
    and current_version_id = p_expected_version_id
    and status = v_document.status;
  if not found then
    raise exception 'Output document changed' using errcode = '40001';
  end if;

  return query select v_document.id, p_expected_version_id, v_new_status;
end;
$$;

revoke all on function public.create_project_output_document_version(uuid, uuid, text, text, bigint, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.create_project_output_document_version(uuid, uuid, text, text, bigint, text, uuid, timestamptz) to service_role;
revoke all on function public.transition_project_output_document_version(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.transition_project_output_document_version(uuid, uuid, text, uuid, text, text) to service_role;

-- Replace the project deletion RPC only to add exact historical output-version paths.
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
    from public.milestone_submission_attachments a
    join public.milestone_submission_packages sp on sp.id = a.package_id
    where sp.project_id = p_project_id
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
  ) paths
  where path is not null;

  select jsonb_build_object(
    'milestones', (select count(*) from public.project_milestones where project_id = p_project_id),
    'milestone_approvals', (select count(*) from public.milestone_approvals where milestone_id in (select id from public.project_milestones where project_id = p_project_id)),
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
    'submission_packages', (select count(*) from public.milestone_submission_packages where project_id = p_project_id),
    'submission_attachments', (select count(*) from public.milestone_submission_attachments a join public.milestone_submission_packages sp on sp.id = a.package_id where sp.project_id = p_project_id),
    'milestone_contributions', (select count(*) from public.milestone_contributions where project_id = p_project_id),
    'milestone_contribution_attachments', (select count(*) from public.milestone_contribution_attachments a join public.milestone_contributions c on c.id = a.contribution_id where c.project_id = p_project_id),
    'project_intake_attachments', (select count(*) from public.project_intake_attachments where project_id = p_project_id),
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
  delete from public.milestone_submission_attachments where package_id in (select id from public.milestone_submission_packages where project_id = p_project_id);
  delete from public.milestone_submission_packages where project_id = p_project_id;
  delete from public.milestone_contribution_attachments where contribution_id in (select id from public.milestone_contributions where project_id = p_project_id);
  delete from public.milestone_contributions where project_id = p_project_id;
  delete from public.project_intake_attachments where project_id = p_project_id;
  update public.project_output_documents set current_version_id = null where project_id = p_project_id;
  delete from public.project_output_document_versions where project_id = p_project_id;
  delete from public.project_output_documents where project_id = p_project_id;
  delete from public.milestone_deadline_approvals where milestone_id in (select id from public.project_milestones where project_id = p_project_id);
  delete from public.milestone_deadline_history where milestone_id in (select id from public.project_milestones where project_id = p_project_id);
  delete from public.milestone_approvals where milestone_id in (select id from public.project_milestones where project_id = p_project_id);
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

revoke all on function public.delete_project_with_cleanup(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.delete_project_with_cleanup(uuid, text, uuid) to service_role;

commit;

-- Read-only verification after manual application:
-- select count(*) from public.project_output_document_versions;
-- select count(*) from public.project_output_documents where storage_path is not null and current_version_id is null;
