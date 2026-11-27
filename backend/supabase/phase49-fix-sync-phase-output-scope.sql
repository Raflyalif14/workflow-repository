-- Phase 49: Fix sync_phase_output_scope_phase30_core and sync_draft_output_scope_phase30_core
-- Replaces 'on conflict (project_id, workflow_stage_id)' with 'not exists' check
-- because unique constraint on (project_id, workflow_stage_id) was dropped in Phase 48 (1-to-1 milestones).

begin;

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
    and not exists (
      select 1 from public.project_milestones pm
      where pm.project_id = p_project_id and pm.phase_id = v_project.active_phase_id and pm.workflow_stage_id = ws.id
    );

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

  select pg_catalog.array_agg(document_key order by document_key) into v_final
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
  end loop;

  delete from public.project_output_documents od
  where od.project_id = p_project_id and not (od.document_key = any(v_final));
  delete from public.project_milestones pm using public.workflow_stages ws
  where pm.project_id = p_project_id and ws.id = pm.workflow_stage_id and ws.default_role = 'SA'
    and not exists (select 1 from public.output_document_stage_catalog c
      where c.stage_key = ws.stage_key and c.document_key = any(v_final));

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

  insert into public.project_milestones(project_id,workflow_stage_id,name,description,step_order,status)
  select p_project_id, ws.id, ws.name, ws.description, ws.step_order, 'CREATED'
  from public.workflow_stages ws
  where ws.scenario_id = v_project.scenario_id and ws.is_active is true
    and (ws.default_role = 'SALES' and ws.stage_key = 'TENDER_PROCESS'
      or ws.default_role = 'SA' and exists (select 1 from public.output_document_stage_catalog c
        where c.document_key = any(v_final) and c.stage_key = ws.stage_key))
    and not exists (
      select 1 from public.project_milestones pm
      where pm.project_id = p_project_id and pm.workflow_stage_id = ws.id
    );

  update public.project_milestones pm set step_order = ranked.position, updated_at = pg_catalog.now()
  from (select pm2.id, pg_catalog.row_number() over (order by ws.step_order)::integer as position
    from public.project_milestones pm2 join public.workflow_stages ws on ws.id = pm2.workflow_stage_id
    where pm2.project_id = p_project_id) ranked
  where pm.id = ranked.id and pm.step_order is distinct from ranked.position;

  for v_output in
    select c.document_key,c.title,c.stage_key,c.is_required
    from public.output_document_stage_catalog c where c.document_key = any(v_final)
  loop
    select pm.id into v_milestone from public.project_milestones pm
    join public.workflow_stages ws on ws.id = pm.workflow_stage_id
    where pm.project_id = p_project_id and ws.scenario_id = v_project.scenario_id
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
  return query select v_final, (select count(*)::integer from public.project_milestones where project_id = p_project_id);
end;
$$;

revoke all on function public.sync_phase_output_scope_phase30_core(uuid,uuid,text[]) from public,anon,authenticated,service_role;
revoke all on function public.sync_draft_output_scope_phase30_core(uuid,uuid,text[]) from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
