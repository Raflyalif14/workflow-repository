-- Phase 24: deploy under maintenance after Phases 22 and 23. Do not run old/new writers together.
-- Existing projects stay legacy; no output, milestone, approval or file is deleted/backfilled.
begin;
do $$ begin
  if to_regprocedure('public.record_output_upload_outcome(uuid,uuid,uuid,text,boolean)') is null then
    raise exception 'Phase 24 requires Phase 23';
  end if;
  if (select count(*) from public.output_document_stage_catalog where group_key = 'PRA_TENDER') <> 10
    or (select count(*) from public.output_document_stage_catalog where group_key = 'ON_SUBMISSION_TENDER') <> 7 then
    raise exception 'Phase 24 requires the canonical 10/7 output catalog';
  end if;
  if (select count(*) from public.scenarios where name = 'Pra-Tender' and is_active and workflow_model = 'OPERATIONAL_V2' and workflow_version = 2) <> 1
    or (select count(*) from public.scenarios where name = 'On Submission Tender' and is_active and workflow_model = 'OPERATIONAL_V2' and workflow_version = 2) <> 1 then
    raise exception 'Phase 24 requires both canonical active Operational V2 scenarios';
  end if;
  if exists(select 1 from public.output_document_stage_catalog c
    where not exists(select 1 from public.workflow_stages ws join public.scenarios s on s.id = ws.scenario_id
      where s.name = case c.group_key when 'PRA_TENDER' then 'Pra-Tender' else 'On Submission Tender' end
        and ws.stage_key = c.stage_key and ws.default_role = 'SA' and ws.is_active)) then
    raise exception 'Phase 24 requires the canonical document/stage mapping';
  end if;
end $$;
create table public.project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scenario_id uuid not null references public.scenarios(id),
  phase_key text not null check (phase_key in ('PRA_TENDER','ON_SUBMISSION_TENDER')),
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','COMPLETED')),
  selected_document_keys jsonb not null default '[]'::jsonb,
  pic_id uuid references public.users(id),
  created_at timestamptz not null default now(), completed_at timestamptz,
  unique(project_id,phase_key), unique(project_id,id)
);
alter table public.projects add column active_phase_id uuid references public.project_phases(id) deferrable initially deferred;
alter table public.projects add column current_scenario_id uuid references public.scenarios(id);
alter table public.projects add constraint active_phase_project_fk foreign key(id,active_phase_id)
  references public.project_phases(project_id,id) deferrable initially deferred;
alter table public.projects add column phase_migration_state text not null default 'LEGACY_REVIEW'
  check (phase_migration_state in ('LEGACY_REVIEW','READY'));
alter table public.projects add constraint ready_project_phase_check check
  (phase_migration_state <> 'READY' or (active_phase_id is not null and current_scenario_id is not null));
alter table public.project_milestones add column phase_id uuid;
alter table public.project_output_documents add column phase_id uuid;
alter table public.project_plan_approvals add column phase_id uuid;
alter table public.project_milestones add constraint milestone_phase_project_fk foreign key(project_id,phase_id) references public.project_phases(project_id,id);
alter table public.project_output_documents add constraint output_phase_project_fk foreign key(project_id,phase_id) references public.project_phases(project_id,id);
alter table public.project_plan_approvals add constraint approval_phase_project_fk foreign key(project_id,phase_id) references public.project_phases(project_id,id);
create index project_milestones_phase_idx on public.project_milestones(project_id,phase_id,step_order);
create index project_plan_approvals_phase_idx on public.project_plan_approvals(project_id,phase_id,submitted_at desc);
revoke all on public.project_phases from public,anon,authenticated;
alter table public.project_phases enable row level security;
grant select,insert,update,delete on public.project_phases to service_role;

create function public.initialize_project_phase() returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_s public.scenarios%rowtype; v_id uuid; v_key text;
begin
  select * into v_s from public.scenarios where id = new.scenario_id;
  if v_s.workflow_model <> 'OPERATIONAL_V2' or v_s.workflow_version <> 2 then return new; end if;
  v_key := case v_s.name when 'Pra-Tender' then 'PRA_TENDER' when 'On Submission Tender' then 'ON_SUBMISSION_TENDER' end;
  if v_key is null then raise exception 'Unsupported phase scenario'; end if;
  if exists(select 1 from jsonb_array_elements_text(new.selected_document_keys) k
    where not exists(select 1 from public.output_document_stage_catalog c where c.document_key = k and c.group_key = v_key))
    or exists(select 1 from public.output_document_stage_catalog c where c.group_key = v_key and c.is_required
      and not (new.selected_document_keys ? c.document_key)) then raise exception 'Invalid initial phase scope'; end if;
  insert into public.project_phases(project_id,scenario_id,phase_key,selected_document_keys)
    values(new.id,new.scenario_id,v_key,new.selected_document_keys) returning id into v_id;
  update public.projects set active_phase_id = v_id,current_scenario_id = new.scenario_id,phase_migration_state = 'READY' where id = new.id;
  return new;
end $$;
create trigger initialize_project_phase after insert on public.projects for each row execute function public.initialize_project_phase();

create function public.attach_project_phase() returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_p public.projects%rowtype;
begin
  select * into v_p from public.projects where id = new.project_id for update;
  if new.phase_id is null then new.phase_id := v_p.active_phase_id; end if;
  if v_p.active_phase_id is not null and new.phase_id is distinct from v_p.active_phase_id then
    raise exception 'New work must belong to the active phase';
  end if;
  return new;
end $$;
create trigger attach_milestone_phase before insert on public.project_milestones for each row execute function public.attach_project_phase();
create trigger attach_output_phase before insert on public.project_output_documents for each row execute function public.attach_project_phase();
create trigger attach_plan_phase before insert on public.project_plan_approvals for each row execute function public.attach_project_phase();

create function public.guard_project_phase_identity() returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if old.phase_id is distinct from new.phase_id then raise exception 'Phase history cannot be reclassified implicitly'; end if;
  return new;
end $$;
create trigger guard_milestone_phase_identity before update of phase_id on public.project_milestones for each row execute function public.guard_project_phase_identity();
create trigger guard_output_phase_identity before update of phase_id on public.project_output_documents for each row execute function public.guard_project_phase_identity();
create trigger guard_plan_phase_identity before update of phase_id on public.project_plan_approvals for each row execute function public.guard_project_phase_identity();

create function public.sync_project_phase_state() returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.active_phase_id is not null then
    update public.project_phases set selected_document_keys = new.selected_document_keys,
      pic_id = new.pic_id, status = case when new.status in ('ACTIVE','WAITING_RESULT') and status = 'DRAFT' then 'ACTIVE' else status end
      where id = new.active_phase_id and project_id = new.id;
  end if;
  return new;
end $$;
create trigger sync_project_phase_state after update of status,pic_id,selected_document_keys on public.projects
  for each row execute function public.sync_project_phase_state();

create or replace function public.sync_phase_output_scope(
  p_project_id uuid, p_sales_id uuid, p_selected_keys text[]
)
returns table(selected_keys text[], milestone_count integer)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_project public.projects%rowtype;
  v_scenario_name text;
  v_final text[];
  v_stage record;
  v_output record;
  v_milestone record;
  v_legacy_exists boolean;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if v_project.active_phase_id is null then raise exception 'Legacy phase classification requires manual review.'; end if;
  if not exists(select 1 from public.project_phases ph where ph.id = v_project.active_phase_id and ph.project_id = p_project_id
    and ph.scenario_id = v_project.current_scenario_id and ph.status = 'DRAFT') then raise exception 'Invalid active phase'; end if;
  v_project.scenario_id := v_project.current_scenario_id;
  if not found or v_project.sales_id is distinct from p_sales_id
    or v_project.status <> 'DRAFT' or coalesce(v_project.is_postponed,false)
    or not exists (select 1 from public.users where id = p_sales_id and role = 'SALES' and is_active is true) then
    raise exception 'Only the Sales owner may change an unlocked DRAFT scope';
  end if;
  if exists (select 1 from public.project_plan_approvals
    where project_id = p_project_id and phase_id = v_project.active_phase_id and status in ('PENDING','APPROVED')) then
    raise exception 'Project plan is pending review or locked';
  end if;
  select name into v_scenario_name from public.scenarios where id = v_project.scenario_id;
  if v_scenario_name not in ('Pra-Tender','On Submission Tender') or v_scenario_name is null then
    raise exception 'Unsupported project scenario';
  end if;
  if p_selected_keys is null or exists (
    select 1 from pg_catalog.unnest(p_selected_keys) k
    where k is null or pg_catalog.btrim(k) = '' or not exists (
      select 1 from public.output_document_stage_catalog c where c.document_key = k
        and c.group_key = case v_scenario_name when 'Pra-Tender' then 'PRA_TENDER' else 'ON_SUBMISSION_TENDER' end
    )
  ) then raise exception 'Invalid output selection for scenario'; end if;

  select pg_catalog.array_agg(document_key order by document_key) into v_final
  from public.output_document_stage_catalog c
  where c.group_key = case v_scenario_name when 'Pra-Tender' then 'PRA_TENDER' else 'ON_SUBMISSION_TENDER' end
    and (c.is_required or c.document_key = any(p_selected_keys));

  if exists (select 1 from public.project_milestones where project_id = p_project_id and phase_id = v_project.active_phase_id and status <> 'CREATED') then
    raise exception 'DRAFT milestone already contains workflow progress';
  end if;
  if exists (
    select 1 from public.project_output_documents od
    where od.project_id = p_project_id and od.phase_id = v_project.active_phase_id and not (od.document_key = any(v_final))
      and (od.status not in ('TO_DO','NOT_REQUIRED') or od.file_name is not null
        or od.storage_path is not null or od.current_version_id is not null
        or od.uploaded_at is not null or od.reviewed_at is not null
        or exists (select 1 from public.project_output_document_versions ov where ov.output_document_id = od.id)
        or exists (select 1 from public.project_output_document_files f where f.output_document_id = od.id)
        or exists (select 1 from public.project_output_document_draft_requests r where r.output_document_id = od.id))
  ) then raise exception 'An output to be removed has work or version history'; end if;
  if exists (
    select 1 from public.project_output_documents od
    join public.output_document_stage_catalog c on c.document_key = od.document_key
    left join public.project_milestones pm on pm.id = od.milestone_id
    left join public.workflow_stages ws on ws.id = pm.workflow_stage_id
    where od.project_id = p_project_id and od.phase_id = v_project.active_phase_id and od.document_key = any(v_final)
      and (od.status not in ('TO_DO','NOT_REQUIRED') or od.file_name is not null
        or od.storage_path is not null or od.current_version_id is not null
        or exists (select 1 from public.project_output_document_versions ov where ov.output_document_id = od.id)
        or exists (select 1 from public.project_output_document_files f where f.output_document_id = od.id)
        or exists (select 1 from public.project_output_document_draft_requests r where r.output_document_id = od.id))
      and (pm.id is null or pm.project_id is distinct from p_project_id
        or ws.stage_key is distinct from c.stage_key or ws.default_role is distinct from 'SA'
        or ws.scenario_id is distinct from v_project.scenario_id)
  ) then raise exception 'An output with work has an invalid milestone mapping'; end if;

  -- Preserve official files and every other milestone-linked record, even when
  -- the milestone is still CREATED.
  for v_milestone in
    select pm.id from public.project_milestones pm
    join public.workflow_stages ws on ws.id = pm.workflow_stage_id
    where pm.project_id = p_project_id and pm.phase_id = v_project.active_phase_id and ws.default_role = 'SA'
      and not exists (
        select 1 from public.output_document_stage_catalog c
        where c.stage_key = ws.stage_key and c.document_key = any(v_final)
      )
  loop
    if exists (select 1 from public.documents where milestone_id = v_milestone.id)
      or exists (select 1 from public.milestone_contributions where milestone_id = v_milestone.id)
      or exists (select 1 from public.milestone_deadline_history where milestone_id = v_milestone.id)
      or exists (select 1 from public.milestone_deadline_approvals where milestone_id = v_milestone.id)
      or exists (select 1 from public.notifications where milestone_id = v_milestone.id) then
      raise exception 'An empty milestone has linked work or history';
    end if;
    if pg_catalog.to_regclass('public.milestone_submission_packages') is not null then
      execute 'select exists(select 1 from public.milestone_submission_packages where milestone_id = $1)'
        into v_legacy_exists using v_milestone.id;
      if v_legacy_exists then raise exception 'An empty milestone has legacy submissions'; end if;
    end if;
    if pg_catalog.to_regclass('public.milestone_approvals') is not null then
      execute 'select exists(select 1 from public.milestone_approvals where milestone_id = $1)'
        into v_legacy_exists using v_milestone.id;
      if v_legacy_exists then raise exception 'An empty milestone has legacy approvals'; end if;
    end if;
  end loop;

  -- No unselected output row with a file or history may be deleted.
  delete from public.project_output_documents od
  where od.project_id = p_project_id and od.phase_id = v_project.active_phase_id and not (od.document_key = any(v_final));
  delete from public.project_milestones pm using public.workflow_stages ws
  where pm.project_id = p_project_id and pm.phase_id = v_project.active_phase_id and ws.id = pm.workflow_stage_id and ws.default_role = 'SA'
    and not exists (select 1 from public.output_document_stage_catalog c
      where c.stage_key = ws.stage_key and c.document_key = any(v_final));

  if exists (
    select 1 from public.output_document_stage_catalog c
    where c.document_key = any(v_final) and not exists (
      select 1 from public.workflow_stages ws where ws.scenario_id = v_project.scenario_id
        and ws.stage_key = c.stage_key and ws.default_role = 'SA' and ws.is_active is true)
  ) then raise exception 'Selected output has no active SA stage'; end if;
  if v_scenario_name = 'On Submission Tender' and (select count(*) from public.workflow_stages
      where scenario_id = v_project.scenario_id and default_role = 'SALES' and stage_key = 'TENDER_PROCESS' and is_active is true) <> 1 then
    raise exception 'Final Sales stage is missing';
  end if;

  insert into public.project_milestones(project_id,workflow_stage_id,name,description,step_order,status)
  select p_project_id, ws.id, ws.name, ws.description, ws.step_order + coalesce((select max(step_order) from public.project_milestones where project_id = p_project_id and phase_id <> v_project.active_phase_id),0), 'CREATED'
  from public.workflow_stages ws
  where ws.scenario_id = v_project.scenario_id and ws.is_active is true
    and (v_scenario_name = 'On Submission Tender' and ws.default_role = 'SALES' and ws.stage_key = 'TENDER_PROCESS'
      or ws.default_role = 'SA' and exists (select 1 from public.output_document_stage_catalog c
        where c.document_key = any(v_final) and c.stage_key = ws.stage_key))
  on conflict (project_id,workflow_stage_id) do nothing;

  update public.project_milestones pm set step_order = ranked.position + coalesce((select max(step_order) from public.project_milestones where project_id = p_project_id and phase_id <> v_project.active_phase_id),0), updated_at = pg_catalog.now()
  from (select pm2.id, pg_catalog.row_number() over (order by ws.step_order)::integer as position
    from public.project_milestones pm2 join public.workflow_stages ws on ws.id = pm2.workflow_stage_id
    where pm2.project_id = p_project_id and pm2.phase_id = v_project.active_phase_id) ranked
  where pm.id = ranked.id and pm.step_order is distinct from ranked.position;

  for v_output in
    select c.document_key,c.title,c.stage_key,c.is_required
    from public.output_document_stage_catalog c where c.document_key = any(v_final)
  loop
    select pm.id into v_milestone from public.project_milestones pm
    join public.workflow_stages ws on ws.id = pm.workflow_stage_id
    where pm.project_id = p_project_id and pm.phase_id = v_project.active_phase_id and ws.scenario_id = v_project.scenario_id
      and ws.stage_key = v_output.stage_key and ws.default_role = 'SA';
    if v_milestone.id is null then raise exception 'Selected output has no project milestone'; end if;
    insert into public.project_output_documents(project_id,document_key,milestone_id,title,is_required,is_selected,status)
    values (p_project_id,v_output.document_key,v_milestone.id,v_output.title,v_output.is_required,true,'TO_DO')
    on conflict (project_id,document_key) do update
      set milestone_id = excluded.milestone_id, is_required = excluded.is_required,
        is_selected = true,
        status = case when public.project_output_documents.status = 'NOT_REQUIRED' then 'TO_DO'
          else public.project_output_documents.status end,
        updated_at = pg_catalog.now();
  end loop;

  update public.projects set selected_document_keys = pg_catalog.to_jsonb(v_final), updated_at = pg_catalog.now()
  where id = p_project_id;
  return query select v_final, (select count(*)::integer from public.project_milestones where project_id = p_project_id and phase_id = v_project.active_phase_id);
end;
$$;
revoke all on function public.sync_phase_output_scope(uuid,uuid,text[]) from public, anon, authenticated;
grant execute on function public.sync_phase_output_scope(uuid,uuid,text[]) to service_role;

create or replace function public.complete_phase_sa_milestone(p_milestone_id uuid, p_actor_id uuid, p_allow_empty boolean default false)
returns table(changed boolean, project_id uuid) language plpgsql security invoker set search_path = public as $$
declare
  v_m public.project_milestones%rowtype;
  v_p public.projects%rowtype;
  v_stage public.workflow_stages%rowtype;
  v_scenario text;
  v_expected integer;
begin
  select p.* into v_p from public.projects p join public.project_milestones m on m.project_id = p.id where m.id = p_milestone_id for update of p;
  select * into v_m from public.project_milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found'; end if;
  select * into v_p from public.projects where id = v_m.project_id;
  if v_p.active_phase_id is null then
    return query select * from public.complete_sa_output_milestone(p_milestone_id,p_actor_id,p_allow_empty); return;
  end if;
  if v_m.phase_id is distinct from v_p.active_phase_id then raise exception 'Milestone is not in the active phase'; end if;
  v_p.scenario_id := v_p.current_scenario_id;
  if not exists (select 1 from public.users where id = p_actor_id and is_active and
    (role = 'HEAD_SA' or role = 'SA' and id = v_m.pic_id)) then raise exception 'Forbidden'; end if;
  select * into v_stage from public.workflow_stages where id = v_m.workflow_stage_id;
  select name into v_scenario from public.scenarios where id = v_p.scenario_id;
  if v_stage.default_role is distinct from 'SA' or v_stage.scenario_id is distinct from v_p.scenario_id then
    raise exception 'Only SA output milestones use this completion gate';
  end if;
  if v_p.status <> 'ACTIVE' or v_p.is_postponed then raise exception 'Project is not active'; end if;
  if v_m.status = 'COMPLETED' then return query select false, v_m.project_id; return; end if;
  if v_m.status <> 'IN_PROGRESS' then raise exception 'Milestone is not in progress'; end if;
  if v_m.start_date is not null and v_m.start_date > (pg_catalog.now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Milestone start date has not arrived';
  end if;
  perform 1 from public.project_output_documents where milestone_id = p_milestone_id for update;
  select count(*) into v_expected from public.output_document_stage_catalog c
    where c.stage_key = v_stage.stage_key
      and c.group_key = case v_scenario when 'Pra-Tender' then 'PRA_TENDER' else 'ON_SUBMISSION_TENDER' end
      and (c.is_required or v_p.selected_document_keys ? c.document_key);
  if v_expected = 0 then
    if not p_allow_empty or v_m.pic_id is distinct from p_actor_id then
      raise exception 'Only the PIC may complete a stage without output'; end if;
  elsif exists (
    select 1 from public.output_document_stage_catalog c
    left join public.project_output_documents od on od.project_id = v_p.id
      and od.document_key = c.document_key
    where c.stage_key = v_stage.stage_key
      and c.group_key = case v_scenario when 'Pra-Tender' then 'PRA_TENDER' else 'ON_SUBMISSION_TENDER' end
      and (c.is_required or v_p.selected_document_keys ? c.document_key)
      and (od.id is null or od.milestone_id is distinct from v_m.id
        or od.is_required is distinct from c.is_required or od.is_selected is distinct from true
        or od.status <> 'APPROVED')
  ) then raise exception 'Selected output is missing or not approved';
  end if;
  update public.project_milestones set status = 'COMPLETED', completed_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = p_milestone_id and status = 'IN_PROGRESS';
  return query select true, v_m.project_id;
end $$;
revoke all on function public.complete_phase_sa_milestone(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.complete_phase_sa_milestone(uuid,uuid,boolean) to service_role;

create or replace function public.lock_output_file_document(p_output_document_id uuid)
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
    or v_d.phase_id is distinct from v_m.phase_id
    or not exists (select 1 from public.workflow_stages ws
      join public.output_document_stage_catalog c on c.document_key = v_d.document_key
      join public.scenarios s on s.id = coalesce((select scenario_id from public.project_phases where id = v_d.phase_id and project_id = v_p.id),v_p.scenario_id)
      where ws.id = v_m.workflow_stage_id and ws.default_role = 'SA'
        and ws.scenario_id = s.id and ws.stage_key = c.stage_key
        and (v_p.active_phase_id is null and s.name = 'Pra-Tender' or c.group_key = case s.name when 'Pra-Tender' then 'PRA_TENDER' else 'ON_SUBMISSION_TENDER' end))
    or not (v_d.is_required or v_d.is_selected) then
    raise exception 'Output milestone mapping or scope is invalid' using errcode = '22023';
  end if;
  return v_d;
end $$;

create or replace function public.assert_output_file_actor(p_output_document_id uuid,p_actor_id uuid,p_review boolean,p_require_active boolean)
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
    or v_p.active_phase_id is distinct from v_d.phase_id
    or (not p_review and v_m.start_date is not null and v_m.start_date > (now() at time zone 'Asia/Jakarta')::date)) then
    raise exception 'Output milestone is not active' using errcode = '22023';
  end if;
end $$;

create function public.finish_project_phase(p_project_id uuid,p_phase_id uuid,p_actor_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare v_p public.projects%rowtype; v_phase public.project_phases%rowtype;
begin
  select * into v_p from public.projects where id = p_project_id for update;
  if not found or v_p.active_phase_id is distinct from p_phase_id or v_p.status <> 'ACTIVE' or coalesce(v_p.is_postponed,false)
    or not exists (select 1 from public.users where id = p_actor_id and is_active and
      (role = 'HEAD_SA' or role = 'SA' and id = v_p.pic_id or role = 'SALES' and id = v_p.sales_id)) then raise exception 'Forbidden'; end if;
  select * into v_phase from public.project_phases where id = p_phase_id and project_id = p_project_id for update;
  if v_phase.status = 'COMPLETED' then return false; end if;
  if not exists (select 1 from public.project_milestones where project_id = p_project_id and phase_id = p_phase_id)
    or exists (select 1 from public.project_milestones where project_id = p_project_id and phase_id = p_phase_id and status not in ('COMPLETED','APPROVED'))
    or exists (select 1 from public.output_document_stage_catalog c left join public.project_output_documents od
      on od.project_id = p_project_id and od.phase_id = p_phase_id and od.document_key = c.document_key
      where c.group_key = v_phase.phase_key and (c.is_required or v_phase.selected_document_keys ? c.document_key)
        and (od.id is null or od.status <> 'APPROVED' or not od.is_selected)) then
    raise exception 'Phase outputs or milestones are not completed';
  end if;
  update public.project_phases set status = 'COMPLETED',completed_at = now() where id = p_phase_id;
  if v_phase.phase_key = 'ON_SUBMISSION_TENDER' then
    update public.projects set status = 'WAITING_RESULT',updated_at = now() where id = p_project_id;
  end if;
  insert into public.activity_logs(project_id,user_id,action,description)
    values(p_project_id,p_actor_id,'PROJECT_PHASE_COMPLETED',v_phase.phase_key);
  return true;
end $$;

create function public.continue_project_tender_phase(p_project_id uuid,p_sales_id uuid,p_selected_keys text[])
returns table(phase_id uuid,created boolean) language plpgsql security definer set search_path = pg_catalog as $$
#variable_conflict use_column
declare v_p public.projects%rowtype; v_phase public.project_phases%rowtype; v_id uuid; v_scenario uuid;
begin
  select * into v_p from public.projects where id = p_project_id for update;
  if not found or v_p.sales_id is distinct from p_sales_id
    or not exists(select 1 from public.users where id = p_sales_id and role = 'SALES' and is_active) then raise exception 'Forbidden'; end if;
  if coalesce(v_p.is_postponed,false) or v_p.status not in ('ACTIVE','DRAFT') then raise exception 'Project is not active.'; end if;
  if v_p.active_phase_id is null then raise exception 'Legacy phase classification requires manual review.'; end if;
  -- A replay returns the already-created phase without changing scope, schedule or intents.
  select id into v_id from public.project_phases where project_id = p_project_id and phase_key = 'ON_SUBMISSION_TENDER';
  if found then return query select v_id,false; return; end if;
  if v_p.status <> 'ACTIVE' then raise exception 'Project is not active.'; end if;
  select * into v_phase from public.project_phases where id = v_p.active_phase_id and project_id = p_project_id;
  if v_phase.phase_key <> 'PRA_TENDER' or v_phase.status <> 'COMPLETED'
    or exists(select 1 from public.project_milestones where phase_id = v_phase.id and status not in ('COMPLETED','APPROVED'))
    or exists(select 1 from public.output_document_stage_catalog c left join public.project_output_documents od
      on od.phase_id = v_phase.id and od.document_key = c.document_key
      where c.group_key = 'PRA_TENDER' and (c.is_required or v_phase.selected_document_keys ? c.document_key)
        and (od.id is null or od.status <> 'APPROVED')) then raise exception 'Pra-Tender is not completed.'; end if;
  if p_selected_keys is null or exists(select 1 from unnest(p_selected_keys) k
    where k is null or not exists(select 1 from public.output_document_stage_catalog c where c.document_key = k and c.group_key = 'ON_SUBMISSION_TENDER')) then
    raise exception 'Invalid phase output selection.';
  end if;
  select id into strict v_scenario from public.scenarios where name = 'On Submission Tender' and is_active and workflow_model = 'OPERATIONAL_V2' and workflow_version = 2;
  insert into public.project_phases(project_id,scenario_id,phase_key)
    values(p_project_id,v_scenario,'ON_SUBMISSION_TENDER') returning id into v_id;
  update public.projects set active_phase_id = v_id,current_scenario_id = v_scenario,
    status = 'DRAFT',pic_id = null,selected_document_keys = '[]'::jsonb,updated_at = now() where id = p_project_id;
  perform public.sync_phase_output_scope(p_project_id,p_sales_id,p_selected_keys);
  insert into public.activity_logs(project_id,user_id,action,description)
    values(p_project_id,p_sales_id,'PROJECT_PHASE_CREATED','ON_SUBMISSION_TENDER');
  return query select v_id,true;
end $$;

create function public.review_project_phase_plan(p_project_id uuid,p_approval_id uuid,p_actor_id uuid,p_decision text,p_note text,p_pic_id uuid)
returns public.project_plan_approvals language plpgsql security definer set search_path = pg_catalog as $$
declare v_p public.projects%rowtype; v_a public.project_plan_approvals%rowtype; v_first uuid;
begin
  select * into v_p from public.projects where id = p_project_id for update;
  if not found or not exists(select 1 from public.users where id = p_actor_id and role = 'HEAD_SA' and is_active) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if v_p.active_phase_id is null or v_p.status <> 'DRAFT' or coalesce(v_p.is_postponed,false) then
    raise exception 'Project plan approval is no longer pending.' using errcode = '40001'; end if;
  select * into v_a from public.project_plan_approvals where id = p_approval_id and project_id = p_project_id
    and phase_id = v_p.active_phase_id and status = 'PENDING' for update;
  if not found then raise exception 'Project plan approval is no longer pending.' using errcode = '40001'; end if;
  if p_decision not in ('APPROVED','REJECTED') or p_decision is null
    or (p_decision = 'REJECTED' and nullif(btrim(p_note),'') is null) then raise exception 'Invalid plan decision'; end if;
  if p_decision = 'APPROVED' then
    if v_p.pic_id is not null or not exists(select 1 from public.users where id = p_pic_id and is_active and (role = 'SA' or role = 'HEAD_SA' and id = p_actor_id))
      or not exists(select 1 from public.project_milestones where phase_id = v_p.active_phase_id)
      or exists(select 1 from public.project_milestones where phase_id = v_p.active_phase_id
        and (status <> 'CREATED' or start_date is null or duration_working_days is null or duration_working_days <= 0 or due_date is null)) then
      raise exception 'Phase plan or PIC is not ready'; end if;
    select id into v_first from public.project_milestones where phase_id = v_p.active_phase_id order by step_order,id limit 1;
    update public.project_milestones pm set pic_id = p_pic_id,updated_at = now() from public.workflow_stages ws
      where pm.phase_id = v_p.active_phase_id and ws.id = pm.workflow_stage_id and ws.default_role = 'SA';
    update public.project_milestones set status = 'IN_PROGRESS',updated_at = now() where id = v_first;
    insert into public.project_assignments(project_id,pic_id,assigned_by,previous_pic_id,assignment_type)
      values(p_project_id,p_pic_id,p_actor_id,null,'INITIAL_ASSIGNMENT');
    update public.projects set status = 'ACTIVE',pic_id = p_pic_id,updated_at = now() where id = p_project_id;
  end if;
  update public.project_plan_approvals set status = p_decision,reviewed_by = p_actor_id,
    review_note = nullif(btrim(p_note),''),reviewed_at = now(),updated_at = now() where id = v_a.id returning * into v_a;
  return v_a;
end $$;

-- Keep phase history immutable to accidental DRAFT reuse; existing active deadline review remains available.
create function public.guard_phase_timeline() returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_p public.projects%rowtype;
begin
  if old.phase_id is null then return new; end if;
  select * into v_p from public.projects where id = old.project_id for update;
  if old.phase_id is distinct from v_p.active_phase_id or
    (v_p.status = 'DRAFT' and exists(select 1 from public.project_plan_approvals where phase_id = old.phase_id and status in ('PENDING','APPROVED'))) then
    raise exception 'Phase schedule is locked';
  end if;
  return new;
end $$;
create trigger guard_phase_timeline before update of start_date,duration_working_days,due_date on public.project_milestones
  for each row when (old.start_date is distinct from new.start_date or old.duration_working_days is distinct from new.duration_working_days or old.due_date is distinct from new.due_date)
  execute function public.guard_phase_timeline();

revoke all on function public.finish_project_phase(uuid,uuid,uuid),public.continue_project_tender_phase(uuid,uuid,text[]),
  public.review_project_phase_plan(uuid,uuid,uuid,text,text,uuid),public.initialize_project_phase(),public.attach_project_phase(),
  public.sync_project_phase_state(),public.guard_phase_timeline(),public.guard_project_phase_identity() from public,anon,authenticated;
grant execute on function public.finish_project_phase(uuid,uuid,uuid),public.continue_project_tender_phase(uuid,uuid,text[]),
  public.review_project_phase_plan(uuid,uuid,uuid,text,text,uuid) to service_role;
create or replace function public.complete_phase_final_sales_milestone_with_outcome(
  p_milestone_id uuid,
  p_sales_id uuid,
  p_outcome text,
  p_final_contract_value numeric,
  p_loss_reason text,
  p_required_output_keys text[]
)
returns table(changed boolean, project_id uuid, milestone_name text, completed_at timestamptz, project_status text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_project public.projects%rowtype;
  v_milestone public.project_milestones%rowtype;
  v_role text;
  v_now timestamptz;
begin
  select p.* into v_project
  from public.projects p
  join public.project_milestones m on m.project_id = p.id
  where m.id = p_milestone_id
  for update of p;
  if not found then raise exception 'Milestone not found.'; end if;

  select m.* into v_milestone
  from public.project_milestones m
  where m.id = p_milestone_id and m.project_id = v_project.id
  for update of m;
  if not found then raise exception 'Milestone not found.'; end if;
  if v_project.active_phase_id is null then
    return query select * from public.complete_final_sales_milestone_with_outcome(p_milestone_id,p_sales_id,p_outcome,p_final_contract_value,p_loss_reason,p_required_output_keys); return;
  end if;
  if v_milestone.phase_id is distinct from v_project.active_phase_id or not exists(select 1 from public.project_phases where id = v_project.active_phase_id and phase_key = 'ON_SUBMISSION_TENDER') then
    raise exception 'This is not the final milestone.';
  end if;
  select s.default_role into v_role from public.workflow_stages s where s.id = v_milestone.workflow_stage_id;

  if v_project.sales_id is distinct from p_sales_id or v_role is distinct from 'SALES'
    or not exists (select 1 from public.users u where u.id = p_sales_id and u.role = 'SALES' and u.is_active is true) then
    raise exception 'Only the project owner can complete this milestone.';
  end if;
  if exists (select 1 from public.project_milestones m where m.project_id = v_project.id and m.phase_id = v_project.active_phase_id and m.step_order > v_milestone.step_order) then
    raise exception 'This is not the final milestone.';
  end if;
  if p_outcome is null or p_outcome not in ('WON', 'LOST')
    or (p_outcome = 'WON' and (p_final_contract_value is null or p_final_contract_value <= 0 or p_final_contract_value = 'NaN'::numeric or p_loss_reason is not null))
    or (p_outcome = 'LOST' and (p_final_contract_value is not null or nullif(pg_catalog.btrim(p_loss_reason), '') is null or pg_catalog.length(p_loss_reason) > 2000)) then
    raise exception 'A valid project result is required.';
  end if;

  if v_milestone.status = 'COMPLETED' and v_project.status in ('WON', 'LOST') then
    if v_project.status <> p_outcome
      or v_project.final_contract_value is distinct from p_final_contract_value
      or v_project.loss_reason is distinct from p_loss_reason then
      raise exception 'Project result has already been recorded.';
    end if;
    return query select false, v_project.id, v_milestone.name, v_milestone.completed_at, v_project.status;
    return;
  end if;

  if v_project.status <> 'ACTIVE' or v_project.is_postponed is true then
    raise exception 'Project is not active.';
  end if;
  if v_milestone.status <> 'IN_PROGRESS' then
    raise exception 'Only IN_PROGRESS milestones can be completed.';
  end if;
  if not exists (select 1 from public.project_milestones m where m.project_id = v_project.id)
    or exists (select 1 from public.project_milestones m where m.project_id = v_project.id and m.phase_id = v_project.active_phase_id and m.id <> v_milestone.id and m.status not in ('COMPLETED', 'APPROVED')) then
    raise exception 'Other milestones must be completed first.';
  end if;

  perform 1 from public.project_output_documents d where d.project_id = v_project.id and d.phase_id = v_project.active_phase_id for update;

  if p_required_output_keys is null or pg_catalog.array_length(p_required_output_keys, 1) is null
    or exists (select 1 from pg_catalog.unnest(p_required_output_keys) k where k is null or pg_catalog.btrim(k) = '')
    or exists (
      select 1 from pg_catalog.unnest(p_required_output_keys) k
      where not exists (select 1 from public.project_output_documents d where d.project_id = v_project.id and d.phase_id = v_project.active_phase_id and d.document_key = k and d.status = 'APPROVED')
    )
    or exists (
      select 1 from pg_catalog.jsonb_array_elements_text(v_project.selected_document_keys) k
      where not exists (select 1 from public.project_output_documents d where d.project_id = v_project.id and d.phase_id = v_project.active_phase_id and d.document_key = k and d.status = 'APPROVED')
    )
    or exists (
      select 1 from public.project_output_documents d
      where d.project_id = v_project.id and d.phase_id = v_project.active_phase_id and (d.is_required or d.is_selected) and d.status <> 'APPROVED'
    ) then
    raise exception 'Selected output documents must be approved first.';
  end if;

  v_now := pg_catalog.now();
  update public.project_milestones
  set status = 'COMPLETED', completed_at = v_now, updated_at = v_now
  where id = v_milestone.id and status = 'IN_PROGRESS';
  if not found then raise exception 'Milestone changed during completion.'; end if;

  update public.projects
  set status = p_outcome,
      final_contract_value = p_final_contract_value,
      loss_reason = p_loss_reason,
      outcome_decided_by = p_sales_id,
      outcome_decided_at = v_now,
      updated_at = v_now
  where id = v_project.id and status = 'ACTIVE' and is_postponed is not true;
  if not found then raise exception 'Project changed during completion.'; end if;

  update public.project_phases set status = 'COMPLETED',completed_at = v_now where id = v_project.active_phase_id;
  return query select true, v_project.id, v_milestone.name, v_now, p_outcome;
end;
$$;

revoke all on function public.complete_phase_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[]) from public,anon,authenticated;
grant execute on function public.complete_phase_final_sales_milestone_with_outcome(uuid,uuid,text,numeric,text,text[]) to service_role;

commit;
