-- Phase 12: Canonical tender scenarios, project commercial outcome, and output documents.
-- Scenario UUIDs and workflow stages are preserved; output documents are not milestones.

begin;

lock table public.scenarios, public.projects, public.workflow_stages, public.project_milestones
  in share row exclusive mode;

do $$
declare
  pra_tender_id uuid;
  submission_tender_id uuid;
  pra_tender_count integer;
  submission_tender_count integer;
  pra_tender_project_count bigint;
  submission_tender_project_count bigint;
begin
  select count(*), min(id::text)::uuid into pra_tender_count, pra_tender_id
  from public.scenarios
  where name in ('Assessment', 'Pra-Tender')
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2
    and is_active is true;

  select count(*), min(id::text)::uuid into submission_tender_count, submission_tender_id
  from public.scenarios
  where name in ('Existing TOR', 'On Submission Tender')
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2
    and is_active is true;

  if pra_tender_count <> 1 or submission_tender_count <> 1 then
    raise exception 'Phase 12 requires exactly one active OPERATIONAL_V2 v2 source scenario for each tender workflow.';
  end if;

  if exists (
    select 1 from public.scenarios
    where name = 'Pra-Tender' and id <> pra_tender_id
  ) or exists (
    select 1 from public.scenarios
    where name = 'On Submission Tender' and id <> submission_tender_id
  ) then
    raise exception 'Phase 12 canonical scenario names are already used by unexpected rows.';
  end if;

  select count(*) into pra_tender_project_count from public.projects where scenario_id = pra_tender_id;
  select count(*) into submission_tender_project_count from public.projects where scenario_id = submission_tender_id;

  update public.scenarios set name = 'Pra-Tender'
  where id = pra_tender_id
    and name in ('Assessment', 'Pra-Tender')
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2
    and is_active is true;

  update public.scenarios set name = 'On Submission Tender'
  where id = submission_tender_id
    and name in ('Existing TOR', 'On Submission Tender')
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2
    and is_active is true;

  if not exists (
    select 1 from public.scenarios
    where id = pra_tender_id and name = 'Pra-Tender'
      and workflow_model = 'OPERATIONAL_V2' and workflow_version = 2 and is_active is true
  ) or not exists (
    select 1 from public.scenarios
    where id = submission_tender_id and name = 'On Submission Tender'
      and workflow_model = 'OPERATIONAL_V2' and workflow_version = 2 and is_active is true
  ) then
    raise exception 'Phase 12 scenario rename postcondition failed.';
  end if;

  if (select count(*) from public.projects where scenario_id = pra_tender_id) <> pra_tender_project_count
    or (select count(*) from public.projects where scenario_id = submission_tender_id) <> submission_tender_project_count then
    raise exception 'Phase 12 must not change project scenario references.';
  end if;
end;
$$;

alter table public.projects
  add column if not exists selected_document_keys jsonb not null default '[]'::jsonb,
  add column if not exists estimated_revenue numeric(18,2),
  add column if not exists final_contract_value numeric(18,2),
  add column if not exists loss_reason text,
  add column if not exists outcome_decided_by uuid references public.users(id) on delete set null,
  add column if not exists outcome_decided_at timestamptz;

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects
  add constraint projects_status_check check (status in (
    'DRAFT', 'ACTIVE', 'POSTPONED', 'COMPLETED', 'CANCELLED',
    'WAITING_RESULT', 'WON', 'LOST'
  ));

alter table public.projects drop constraint if exists projects_estimated_revenue_nonnegative;
alter table public.projects drop constraint if exists projects_revenue_nonnegative;
alter table public.projects
  add constraint projects_estimated_revenue_nonnegative check (estimated_revenue is null or estimated_revenue >= 0);

alter table public.projects drop constraint if exists projects_final_contract_value_positive;
alter table public.projects
  add constraint projects_final_contract_value_positive check (final_contract_value is null or final_contract_value > 0);

alter table public.projects drop constraint if exists projects_outcome_details_check;
alter table public.projects
  add constraint projects_outcome_details_check check (
    (status = 'WON' and final_contract_value is not null and nullif(btrim(loss_reason), '') is null)
    or (status = 'LOST' and final_contract_value is null and nullif(btrim(loss_reason), '') is not null)
    or status not in ('WON', 'LOST')
  );

create table if not exists public.project_output_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  document_key text not null,
  title text not null,
  is_required boolean not null default false,
  is_selected boolean not null default false,
  status text not null default 'TO_DO' check (status in (
    'NOT_REQUIRED',
    'TO_DO',
    'DRAFT',
    'IN_REVIEW',
    'REVISION_REQUIRED',
    'APPROVED'
  )),
  file_name text,
  storage_path text,
  file_size bigint check (file_size is null or file_size >= 0),
  mime_type text,
  uploaded_by uuid references public.users(id) on delete set null,
  uploaded_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_output_documents_unique unique (project_id, document_key)
);

create index if not exists project_output_documents_project_idx
  on public.project_output_documents(project_id, created_at asc);

create index if not exists project_output_documents_status_idx
  on public.project_output_documents(project_id, status);

alter table public.project_output_documents enable row level security;
drop policy if exists project_output_documents_service_role on public.project_output_documents;
create policy project_output_documents_service_role on public.project_output_documents
  for all to service_role using (true) with check (true);

revoke all on table public.project_output_documents from public, anon, authenticated;
grant select, insert, update, delete on table public.project_output_documents to service_role;

-- Keep project deletion exact-path cleanup complete for the new output domain.
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
    'project_output_documents', (select count(*) from public.project_output_documents where project_id = p_project_id)
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
