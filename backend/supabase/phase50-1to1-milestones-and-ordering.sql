-- Phase 50: Enforce 1 Output Document = 1 Milestone and Canonical Milestone Ordering
-- 1. Adds sort_order to output_document_stage_catalog
-- 2. Updates sync_phase_output_scope_phase30_core & sync_draft_output_scope_phase30_core
--    to create 1 milestone per output document (1-to-1) and order by canonical sort_order
-- 3. Updates complete_phase_sa_milestone_phase30_core to check only milestone-linked outputs
-- 4. Fixes existing On Submission Tender phase milestones on projects such as firewall

begin;

-- 1. Add sort_order to output_document_stage_catalog
alter table public.output_document_stage_catalog add column if not exists sort_order integer;

update public.output_document_stage_catalog set sort_order = case document_key
  -- Pra-Tender
  when 'proposal_deck_solusi' then 1
  when 'poc_demo' then 2
  when 'assessment' then 3
  when 'kak_rfp' then 4
  when 'rab' then 5
  when 'kajian_teknis' then 6
  when 'spesifikasi_teknis' then 7
  when 'analisa_kebutuhan' then 8
  when 'operational_requirement' then 9
  when 'rencana_distribusi' then 10
  -- On Submission Tender
  when 'proposal_teknis' then 1
  when 'metodologi_implementasi' then 2
  when 'timeline_proyek' then 3
  when 'identitas_barang_produk' then 4
  when 'spesifikasi_teknis_toc' then 5
  when 'arsitektur_sistem' then 6
  when 'poc_demo_report' then 7
  else 999
end;

-- 2. Replace sync_phase_output_scope_phase30_core with 1-to-1 milestone creation and canonical ordering
create or replace function public.sync_phase_output_scope_phase30_core(
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

  select pg_catalog.array_agg(document_key order by coalesce(sort_order, 999), document_key) into v_final
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
        select 1 from public.project_output_documents od
        where od.milestone_id = pm.id and od.document_key = any(v_final)
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

  -- Remove unselected output documents and their unreferenced SA milestones
  delete from public.project_output_documents od
  where od.project_id = p_project_id and od.phase_id = v_project.active_phase_id and not (od.document_key = any(v_final));

  delete from public.project_milestones pm
  using public.workflow_stages ws
  where pm.project_id = p_project_id and pm.phase_id = v_project.active_phase_id and ws.id = pm.workflow_stage_id and ws.default_role = 'SA'
    and not exists (select 1 from public.project_output_documents od where od.milestone_id = pm.id and od.document_key = any(v_final));

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

  -- 1 Output Document = 1 Milestone (1-to-1 mapping)
  for v_output in
    select c.document_key, c.title, c.stage_key, c.is_required, coalesce(c.sort_order, 999) as sort_order,
           ws.id as stage_id, ws.name as stage_name, ws.description as stage_description, ws.step_order as stage_order
    from public.output_document_stage_catalog c
    join public.workflow_stages ws on ws.stage_key = c.stage_key and ws.scenario_id = v_project.scenario_id
      and ws.default_role = 'SA' and ws.is_active is true
    where c.document_key = any(v_final)
    order by coalesce(c.sort_order, 999), ws.step_order, c.document_key
  loop
    select pm.id into v_milestone
    from public.project_output_documents od
    join public.project_milestones pm on pm.id = od.milestone_id
    where od.project_id = p_project_id and od.phase_id = v_project.active_phase_id and od.document_key = v_output.document_key;

    if v_milestone.id is null then
      insert into public.project_milestones(project_id, phase_id, workflow_stage_id, name, description, step_order, status)
      values (p_project_id, v_project.active_phase_id, v_output.stage_id, v_output.title, 'Solution Architect menyiapkan ' || lower(v_output.title) || '.', 1, 'CREATED')
      returning id into v_milestone;

      insert into public.project_output_documents(project_id, phase_id, document_key, milestone_id, title, is_required, is_selected, status)
      values (p_project_id, v_project.active_phase_id, v_output.document_key, v_milestone.id, v_output.title, v_output.is_required, true, 'TO_DO')
      on conflict (project_id, document_key) do update
        set milestone_id = excluded.milestone_id, phase_id = excluded.phase_id, is_required = excluded.is_required,
          is_selected = true,
          status = case when public.project_output_documents.status = 'NOT_REQUIRED' then 'TO_DO'
            else public.project_output_documents.status end,
          updated_at = pg_catalog.now();
    else
      update public.project_milestones
      set name = v_output.title, workflow_stage_id = v_output.stage_id, updated_at = pg_catalog.now()
      where id = v_milestone.id;

      update public.project_output_documents
      set is_required = v_output.is_required, is_selected = true,
        status = case when status = 'NOT_REQUIRED' then 'TO_DO' else status end,
        updated_at = pg_catalog.now()
      where project_id = p_project_id and document_key = v_output.document_key;
    end if;
  end loop;

  -- Ensure final SALES milestone exists for On Submission Tender
  if v_scenario_name = 'On Submission Tender' then
    select ws.id, ws.name, ws.description into v_stage
    from public.workflow_stages ws
    where ws.scenario_id = v_project.scenario_id and ws.default_role = 'SALES' and ws.stage_key = 'TENDER_PROCESS' and ws.is_active is true
    limit 1;

    if not exists (
      select 1 from public.project_milestones pm
      where pm.project_id = p_project_id and pm.phase_id = v_project.active_phase_id and pm.workflow_stage_id = v_stage.id
    ) then
      insert into public.project_milestones(project_id, phase_id, workflow_stage_id, name, description, step_order, status)
      values (p_project_id, v_project.active_phase_id, v_stage.id, v_stage.name, v_stage.description, 999, 'CREATED');
    end if;
  end if;

  -- Stable step_order: canonical catalog sort_order for SA documents, SALES stage at the end
  update public.project_milestones pm
  set step_order = ranked.position + coalesce((select max(step_order) from public.project_milestones where project_id = p_project_id and phase_id <> v_project.active_phase_id), 0),
      updated_at = pg_catalog.now()
  from (
    select pm2.id,
      pg_catalog.row_number() over (
        order by
          case when ws.default_role = 'SA' then 0 else 1 end,
          coalesce(c.sort_order, 999),
          ws.step_order,
          coalesce(c.document_key, '')
      )::integer as position
    from public.project_milestones pm2
    join public.workflow_stages ws on ws.id = pm2.workflow_stage_id
    left join public.project_output_documents od on od.milestone_id = pm2.id and od.project_id = pm2.project_id
    left join public.output_document_stage_catalog c on c.document_key = od.document_key
    where pm2.project_id = p_project_id and pm2.phase_id = v_project.active_phase_id
  ) ranked
  where pm.id = ranked.id and pm.step_order is distinct from (ranked.position + coalesce((select max(step_order) from public.project_milestones where project_id = p_project_id and phase_id <> v_project.active_phase_id), 0));

  update public.projects set selected_document_keys = pg_catalog.to_jsonb(v_final), updated_at = pg_catalog.now()
  where id = p_project_id;
  update public.project_phases set selected_document_keys = pg_catalog.to_jsonb(v_final)
  where id = v_project.active_phase_id;

  return query select v_final, (select count(*)::integer from public.project_milestones where project_id = p_project_id and phase_id = v_project.active_phase_id);
end;
$$;

-- 3. Replace sync_draft_output_scope_phase30_core with 1-to-1 milestone creation and canonical ordering
create or replace function public.sync_draft_output_scope_phase30_core(
  p_project_id uuid, p_sales_id uuid, p_selected_keys text[]
)
returns table(selected_keys text[], milestone_count integer)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_project public.projects%rowtype;
  v_final text[];
  v_stage record;
  v_output record;
  v_milestone record;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found or v_project.sales_id is distinct from p_sales_id
    or v_project.status <> 'DRAFT' or coalesce(v_project.is_postponed,false)
    or not exists (select 1 from public.users where id = p_sales_id and role = 'SALES' and is_active is true) then
    raise exception 'Only the Sales owner may change an unlocked DRAFT scope';
  end if;
  if v_project.active_phase_id is not null then
    raise exception 'Project uses sequential phases. Use sync_phase_output_scope.';
  end if;
  if exists (select 1 from public.project_plan_approvals where project_id = p_project_id and status in ('PENDING','APPROVED')) then
    raise exception 'Project plan is pending review or locked';
  end if;
  if p_selected_keys is null or exists (
    select 1 from pg_catalog.unnest(p_selected_keys) k
    where k is null or pg_catalog.btrim(k) = '' or not exists (
      select 1 from public.output_document_stage_catalog c where c.document_key = k
    )
  ) then raise exception 'Invalid output selection'; end if;

  select pg_catalog.array_agg(document_key order by coalesce(sort_order, 999), document_key) into v_final
  from public.output_document_stage_catalog c
  where (c.is_required or c.document_key = any(p_selected_keys));

  if exists (select 1 from public.project_milestones where project_id = p_project_id and status <> 'CREATED') then
    raise exception 'DRAFT milestone already contains workflow progress';
  end if;
  if exists (
    select 1 from public.project_output_documents od
    where od.project_id = p_project_id and not (od.document_key = any(v_final))
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
    where od.project_id = p_project_id and od.document_key = any(v_final)
      and (od.status not in ('TO_DO','NOT_REQUIRED') or od.file_name is not null
        or od.storage_path is not null or od.current_version_id is not null
        or exists (select 1 from public.project_output_document_versions ov where ov.output_document_id = od.id)
        or exists (select 1 from public.project_output_document_files f where f.output_document_id = od.id)
        or exists (select 1 from public.project_output_document_draft_requests r where r.output_document_id = od.id))
      and (pm.id is null or pm.project_id is distinct from p_project_id
        or ws.stage_key is distinct from c.stage_key or ws.default_role is distinct from 'SA'
        or ws.scenario_id is distinct from v_project.scenario_id)
  ) then raise exception 'An output with work has an invalid milestone mapping'; end if;

  for v_milestone in
    select pm.id from public.project_milestones pm
    join public.workflow_stages ws on ws.id = pm.workflow_stage_id
    where pm.project_id = p_project_id and ws.default_role = 'SA'
      and not exists (
        select 1 from public.project_output_documents od
        where od.milestone_id = pm.id and od.document_key = any(v_final)
      )
  loop
    if exists (select 1 from public.documents where milestone_id = v_milestone.id)
      or exists (select 1 from public.milestone_contributions where milestone_id = v_milestone.id)
      or exists (select 1 from public.milestone_deadline_history where milestone_id = v_milestone.id)
      or exists (select 1 from public.milestone_deadline_approvals where milestone_id = v_milestone.id)
      or exists (select 1 from public.notifications where milestone_id = v_milestone.id) then
      raise exception 'An empty milestone has linked work or history';
    end if;
  end loop;

  delete from public.project_output_documents od
  where od.project_id = p_project_id and not (od.document_key = any(v_final));
  delete from public.project_milestones pm using public.workflow_stages ws
  where pm.project_id = p_project_id and ws.id = pm.workflow_stage_id and ws.default_role = 'SA'
    and not exists (select 1 from public.project_output_documents od where od.milestone_id = pm.id and od.document_key = any(v_final));

  if exists (
    select 1 from public.output_document_stage_catalog c
    where c.document_key = any(v_final) and not exists (
      select 1 from public.workflow_stages ws where ws.scenario_id = v_project.scenario_id
        and ws.stage_key = c.stage_key and ws.default_role = 'SA' and ws.is_active is true)
  ) then raise exception 'Selected output has no active SA stage'; end if;
  if (select count(*) from public.workflow_stages
      where scenario_id = v_project.scenario_id and default_role = 'SALES' and stage_key = 'TENDER_PROCESS' and is_active is true) <> 1 then
    raise exception 'Final Sales stage is missing';
  end if;

  for v_output in
    select c.document_key, c.title, c.stage_key, c.is_required, coalesce(c.sort_order, 999) as sort_order,
           ws.id as stage_id, ws.name as stage_name, ws.description as stage_description, ws.step_order as stage_order
    from public.output_document_stage_catalog c
    join public.workflow_stages ws on ws.stage_key = c.stage_key and ws.scenario_id = v_project.scenario_id
      and ws.default_role = 'SA' and ws.is_active is true
    where c.document_key = any(v_final)
    order by coalesce(c.sort_order, 999), ws.step_order, c.document_key
  loop
    select pm.id into v_milestone
    from public.project_output_documents od
    join public.project_milestones pm on pm.id = od.milestone_id
    where od.project_id = p_project_id and od.document_key = v_output.document_key;

    if v_milestone.id is null then
      insert into public.project_milestones(project_id, workflow_stage_id, name, description, step_order, status)
      values (p_project_id, v_output.stage_id, v_output.title, 'Solution Architect menyiapkan ' || lower(v_output.title) || '.', 1, 'CREATED')
      returning id into v_milestone;

      insert into public.project_output_documents(project_id, document_key, milestone_id, title, is_required, is_selected, status)
      values (p_project_id, v_output.document_key, v_milestone.id, v_output.title, v_output.is_required, true, 'TO_DO')
      on conflict (project_id, document_key) do update
        set milestone_id = excluded.milestone_id, is_required = excluded.is_required,
          is_selected = true,
          status = case when public.project_output_documents.status = 'NOT_REQUIRED' then 'TO_DO'
            else public.project_output_documents.status end,
          updated_at = pg_catalog.now();
    else
      update public.project_milestones
      set name = v_output.title, workflow_stage_id = v_output.stage_id, updated_at = pg_catalog.now()
      where id = v_milestone.id;

      update public.project_output_documents
      set is_required = v_output.is_required, is_selected = true,
        status = case when status = 'NOT_REQUIRED' then 'TO_DO' else status end,
        updated_at = pg_catalog.now()
      where project_id = p_project_id and document_key = v_output.document_key;
    end if;
  end loop;

  select ws.id, ws.name, ws.description into v_stage
  from public.workflow_stages ws
  where ws.scenario_id = v_project.scenario_id and ws.default_role = 'SALES' and ws.stage_key = 'TENDER_PROCESS' and ws.is_active is true
  limit 1;

  if not exists (
    select 1 from public.project_milestones pm
    where pm.project_id = p_project_id and pm.workflow_stage_id = v_stage.id
  ) then
    insert into public.project_milestones(project_id, workflow_stage_id, name, description, step_order, status)
    values (p_project_id, v_stage.id, v_stage.name, v_stage.description, 999, 'CREATED');
  end if;

  update public.project_milestones pm set step_order = ranked.position, updated_at = pg_catalog.now()
  from (
    select pm2.id,
      pg_catalog.row_number() over (
        order by
          case when ws.default_role = 'SA' then 0 else 1 end,
          coalesce(c.sort_order, 999),
          ws.step_order,
          coalesce(c.document_key, '')
      )::integer as position
    from public.project_milestones pm2
    join public.workflow_stages ws on ws.id = pm2.workflow_stage_id
    left join public.project_output_documents od on od.milestone_id = pm2.id and od.project_id = pm2.project_id
    left join public.output_document_stage_catalog c on c.document_key = od.document_key
    where pm2.project_id = p_project_id
  ) ranked
  where pm.id = ranked.id and pm.step_order is distinct from ranked.position;

  update public.projects set selected_document_keys = pg_catalog.to_jsonb(v_final), updated_at = pg_catalog.now()
  where id = p_project_id;
  return query select v_final, (select count(*)::integer from public.project_milestones where project_id = p_project_id);
end;
$$;

-- 4. Replace complete_phase_sa_milestone_phase30_core with milestone-scoped output validation
create or replace function public.complete_phase_sa_milestone_phase30_core(
  p_milestone_id uuid, p_actor_id uuid, p_allow_empty boolean default false
)
returns table(changed boolean, project_id uuid)
language plpgsql set search_path = public, pg_catalog as $$
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

  -- 1-to-1 milestone: check that the output document(s) linked to THIS milestone are APPROVED
  if exists (
    select 1 from public.project_output_documents od
    where od.milestone_id = p_milestone_id
      and (od.is_required or od.is_selected)
      and od.status <> 'APPROVED'
  ) or not exists (
    select 1 from public.project_output_documents od
    where od.milestone_id = p_milestone_id
      and (od.is_required or od.is_selected)
  ) then
    if not p_allow_empty or v_m.pic_id is distinct from p_actor_id then
      raise exception 'Selected output is missing or not approved';
    end if;
  end if;

  update public.project_milestones set status = 'COMPLETED', completed_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = p_milestone_id and status = 'IN_PROGRESS';
  return query select true, v_m.project_id;
end $$;

-- 5. Fix existing data for projects in ON_SUBMISSION_TENDER with multiple outputs in 1 milestone (e.g. firewall)
do $$
declare
  r record;
  v_new_milestone_id uuid;
  v_stage_id uuid;
  v_max_prev integer;
begin
  for r in
    select distinct p.id as project_id, ph.id as phase_id, p.pic_id
    from public.projects p
    join public.project_phases ph on ph.project_id = p.id and ph.phase_key = 'ON_SUBMISSION_TENDER' and ph.status in ('ACTIVE', 'DRAFT')
    join public.project_output_documents od on od.phase_id = ph.id
    group by p.id, ph.id, p.pic_id, od.milestone_id
    having count(od.id) > 1
  loop
    if exists (
      select 1 from public.project_output_documents od1
      join public.project_output_documents od2 on od1.milestone_id = od2.milestone_id and od1.id <> od2.id
      where od1.phase_id = r.phase_id and od1.document_key = 'proposal_teknis' and od2.document_key = 'spesifikasi_teknis_toc'
    ) then
      select ws.id into v_stage_id from public.workflow_stages ws
      join public.projects p on p.id = r.project_id and ws.scenario_id = p.current_scenario_id
      where ws.stage_key = 'TECHNICAL_PROPOSAL_BOQ' and ws.default_role = 'SA';

      -- Create new separate milestone for spesifikasi_teknis_toc
      insert into public.project_milestones (
        project_id, phase_id, workflow_stage_id, name, description,
        start_date, duration_working_days, due_date, status, pic_id, step_order
      )
      select
        r.project_id, r.phase_id, v_stage_id, 'Spesifikasi Teknis / TOC',
        'Solution Architect menyiapkan spesifikasi teknis / toc.',
        pm.start_date, pm.duration_working_days, pm.due_date, 'CREATED', pm.pic_id, 998
      from public.project_output_documents od
      join public.project_milestones pm on pm.id = od.milestone_id
      where od.phase_id = r.phase_id and od.document_key = 'proposal_teknis'
      returning id into v_new_milestone_id;

      -- Re-point spesifikasi_teknis_toc to new milestone
      update public.project_output_documents
      set milestone_id = v_new_milestone_id
      where phase_id = r.phase_id and document_key = 'spesifikasi_teknis_toc';

      -- Ensure proposal_teknis milestone has clean title
      update public.project_milestones pm
      set name = 'Proposal Teknis', description = 'Solution Architect menyiapkan proposal teknis.'
      from public.project_output_documents od
      where od.milestone_id = pm.id and od.phase_id = r.phase_id and od.document_key = 'proposal_teknis';

      -- Ensure poc_demo_report milestone has clean title
      update public.project_milestones pm
      set name = 'POC / Demo Report', description = 'Solution Architect menyiapkan poc / demo report.'
      from public.project_output_documents od
      where od.milestone_id = pm.id and od.phase_id = r.phase_id and od.document_key = 'poc_demo_report';

      -- Recalculate step_order for this phase
      select coalesce(max(step_order), 0) into v_max_prev
      from public.project_milestones where project_id = r.project_id and phase_id <> r.phase_id;

      update public.project_milestones pm set step_order = ranked.position + v_max_prev, updated_at = pg_catalog.now()
      from (
        select pm2.id,
          pg_catalog.row_number() over (
            order by
              case when ws.default_role = 'SA' then 0 else 1 end,
              coalesce(c.sort_order, 999),
              ws.step_order,
              coalesce(c.document_key, '')
          )::integer as position
        from public.project_milestones pm2
        join public.workflow_stages ws on ws.id = pm2.workflow_stage_id
        left join public.project_output_documents od on od.milestone_id = pm2.id and od.project_id = pm2.project_id
        left join public.output_document_stage_catalog c on c.document_key = od.document_key
        where pm2.project_id = r.project_id and pm2.phase_id = r.phase_id
      ) ranked
      where pm.id = ranked.id;

      -- Set proposal_teknis to IN_PROGRESS (first active milestone in phase)
      update public.project_milestones pm
      set status = 'IN_PROGRESS'
      from public.project_output_documents od
      where od.milestone_id = pm.id and od.phase_id = r.phase_id and od.document_key = 'proposal_teknis';

      -- Set other milestones to CREATED
      update public.project_milestones pm
      set status = 'CREATED'
      from public.project_output_documents od
      where od.milestone_id = pm.id and od.phase_id = r.phase_id and od.document_key in ('spesifikasi_teknis_toc', 'poc_demo_report');
    end if;
  end loop;
end $$;

revoke all on function public.sync_phase_output_scope_phase30_core(uuid,uuid,text[]) from public,anon,authenticated,service_role;
revoke all on function public.sync_draft_output_scope_phase30_core(uuid,uuid,text[]) from public,anon,authenticated,service_role;
revoke all on function public.complete_phase_sa_milestone_phase30_core(uuid,uuid,boolean) from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
