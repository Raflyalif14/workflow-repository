-- Production-safe project deletion. Apply manually in the Supabase SQL Editor.
-- The cleanup record intentionally has no project FK so it survives project deletion.

create table if not exists public.project_deletion_cleanups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  project_name text not null,
  -- Intentionally no FK: auth.users deletion cascades the public profile, while
  -- this immutable audit identifier must remain available for cleanup history.
  initiated_by uuid not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'FAILED')),
  storage_paths jsonb not null default '[]'::jsonb,
  storage_object_count integer not null default 0 check (storage_object_count >= 0),
  dependency_counts jsonb not null default '{}'::jsonb,
  failure_code text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists project_deletion_cleanups_project_id_idx on public.project_deletion_cleanups(project_id);
create index if not exists project_deletion_cleanups_status_idx on public.project_deletion_cleanups(status);

alter table public.project_deletion_cleanups enable row level security;
drop policy if exists project_deletion_cleanups_service_role_only on public.project_deletion_cleanups;
create policy project_deletion_cleanups_service_role_only on public.project_deletion_cleanups
  for all to service_role using (true) with check (true);

revoke all on table public.project_deletion_cleanups from public, anon, authenticated;
grant select, update on table public.project_deletion_cleanups to service_role;

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
    'submission_attachments', (select count(*) from public.milestone_submission_attachments a join public.milestone_submission_packages sp on sp.id = a.package_id where sp.project_id = p_project_id)
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
