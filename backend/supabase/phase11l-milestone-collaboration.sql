begin;

create table if not exists public.milestone_contributions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_id uuid not null references public.project_milestones(id) on delete cascade,
  -- Immutable audit identifier without a user FK, matching Phase 11I cleanup audit behavior.
  contributed_by uuid not null,
  note text,
  status text not null default 'STAGING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestone_contributions_note_check
    check (note is null or char_length(btrim(note)) > 0),
  constraint milestone_contributions_status_check
    check (status in ('STAGING', 'READY', 'CLEANUP_FAILED'))
);

create index if not exists milestone_contributions_project_idx
  on public.milestone_contributions(project_id);
create index if not exists milestone_contributions_milestone_created_idx
  on public.milestone_contributions(milestone_id, created_at desc);
create index if not exists milestone_contributions_contributed_by_idx
  on public.milestone_contributions(contributed_by);

create table if not exists public.milestone_contribution_attachments (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.milestone_contributions(id) on delete cascade,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  constraint milestone_contribution_attachments_filename_check
    check (char_length(btrim(original_filename)) > 0),
  constraint milestone_contribution_attachments_mime_type_check
    check (char_length(btrim(mime_type)) > 0),
  constraint milestone_contribution_attachments_storage_path_check
    check (char_length(btrim(storage_path)) > 0)
);

create index if not exists milestone_contribution_attachments_contribution_idx
  on public.milestone_contribution_attachments(contribution_id);

alter table public.milestone_contributions enable row level security;
alter table public.milestone_contribution_attachments enable row level security;

drop policy if exists milestone_contributions_service_role_only
  on public.milestone_contributions;
create policy milestone_contributions_service_role_only
  on public.milestone_contributions
  for all to service_role using (true) with check (true);

drop policy if exists milestone_contribution_attachments_service_role_only
  on public.milestone_contribution_attachments;
create policy milestone_contribution_attachments_service_role_only
  on public.milestone_contribution_attachments
  for all to service_role using (true) with check (true);

revoke all on table public.milestone_contributions from public, anon, authenticated;
revoke all on table public.milestone_contribution_attachments from public, anon, authenticated;
grant select, insert, update, delete on table public.milestone_contributions to service_role;
grant select, insert, update, delete on table public.milestone_contribution_attachments to service_role;

-- Phase 11I is already deployed. Replace its service-role-only RPC so future
-- project deletion jobs also retain and remove exact contribution object paths.
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
    select 1
    from public.users
    where id = p_initiated_by
      and role = 'SUPER_ADMIN'
      and is_active = true
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
  ) paths;

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
    'milestone_contribution_attachments', (select count(*) from public.milestone_contribution_attachments a join public.milestone_contributions c on c.id = a.contribution_id where c.project_id = p_project_id)
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
-- select table_name from information_schema.tables
-- where table_schema = 'public'
--   and table_name in ('milestone_contributions', 'milestone_contribution_attachments');
