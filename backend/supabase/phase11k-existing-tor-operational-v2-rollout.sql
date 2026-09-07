begin;

-- Roll out the Existing TOR operational template for future project selection.
-- Existing project snapshots and the Assessment scenario family are untouched.
do $$
declare
  legacy_tor_id uuid;
  operational_v2_id uuid;
  legacy_tor_is_active boolean;
  operational_v2_is_active boolean;
  scenario_count integer;
  total_v2_stage_count integer;
  v2_project_count integer;
  updated_count integer;
begin
  select count(*)
  into scenario_count
  from public.scenarios
  where name = 'Existing TOR'
    and workflow_model = 'LEGACY'
    and workflow_version = 1;

  if scenario_count <> 1 then
    raise exception 'Existing TOR Operational V2 rollout requires exactly one Existing TOR scenario using LEGACY v1.';
  end if;

  select id, is_active
  into legacy_tor_id, legacy_tor_is_active
  from public.scenarios
  where name = 'Existing TOR'
    and workflow_model = 'LEGACY'
    and workflow_version = 1
  for update;

  select count(*)
  into scenario_count
  from public.scenarios
  where name = 'Existing TOR Operational V2'
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2;

  if scenario_count <> 1 then
    raise exception 'Existing TOR Operational V2 rollout requires exactly one Existing TOR Operational V2 scenario using OPERATIONAL_V2 v2.';
  end if;

  select id, is_active
  into operational_v2_id, operational_v2_is_active
  from public.scenarios
  where name = 'Existing TOR Operational V2'
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2
  for update;

  if exists (
    select 1
    from (
      values
        (6, 'Requirement Gathering', 'SA'),
        (7, 'Pain Point Analysis', 'SA'),
        (8, 'Proposal Solution', 'SA'),
        (9, 'Deliverables', 'SA'),
        (10, 'Technical Proposal & BOQ', 'SA'),
        (11, 'Tender Process', 'SALES')
    ) as expected(source_step_order, name, default_role)
    where (
      select count(*)
      from public.workflow_stages source_stage
      where source_stage.scenario_id = legacy_tor_id
        and source_stage.step_order = expected.source_step_order
    ) <> 1
      or not exists (
        select 1
        from public.workflow_stages source_stage
        where source_stage.scenario_id = legacy_tor_id
          and source_stage.step_order = expected.source_step_order
          and source_stage.name = expected.name
          and source_stage.default_role = expected.default_role
      )
  ) then
    raise exception 'Existing TOR Operational V2 rollout requires the mapped legacy Existing TOR stages 6 through 11.';
  end if;

  select count(*)
  into total_v2_stage_count
  from public.workflow_stages
  where scenario_id = operational_v2_id;

  if total_v2_stage_count <> 6 then
    raise exception 'Existing TOR Operational V2 rollout requires exactly six target workflow stages.';
  end if;

  if exists (
    select 1
    from (values (1), (2), (3), (4), (5), (6)) as expected(target_step_order)
    where (
      select count(*)
      from public.workflow_stages target_stage
      where target_stage.scenario_id = operational_v2_id
        and target_stage.step_order = expected.target_step_order
    ) <> 1
  ) or exists (
    select 1
    from public.workflow_stages target_stage
    where target_stage.scenario_id = operational_v2_id
      and target_stage.step_order not in (1, 2, 3, 4, 5, 6)
  ) or exists (
    select target_stage.step_order
    from public.workflow_stages target_stage
    where target_stage.scenario_id = operational_v2_id
    group by target_stage.step_order
    having count(*) > 1
  ) then
    raise exception 'Existing TOR Operational V2 rollout requires exactly one target stage at each step order 1 through 6.';
  end if;

  if exists (
    select 1
    from (
      values
        (6, 1, 'Requirement Gathering', 'SA'),
        (7, 2, 'Pain Point Analysis', 'SA'),
        (8, 3, 'Proposal Solution', 'SA'),
        (9, 4, 'Deliverables', 'SA'),
        (10, 5, 'Technical Proposal & BOQ', 'SA'),
        (11, 6, 'Tender Process', 'SALES')
    ) as expected(source_step_order, target_step_order, name, default_role)
    where not exists (
      select 1
      from public.workflow_stages source_stage
      join public.workflow_stages target_stage
        on target_stage.scenario_id = operational_v2_id
        and target_stage.step_order = expected.target_step_order
      where source_stage.scenario_id = legacy_tor_id
        and source_stage.step_order = expected.source_step_order
        and source_stage.name = expected.name
        and source_stage.default_role = expected.default_role
        and target_stage.name = source_stage.name
        and target_stage.default_role = source_stage.default_role
        and target_stage.default_duration_working_days is not distinct from source_stage.default_duration_working_days
        and target_stage.is_required is not distinct from source_stage.is_required
        and target_stage.description is not distinct from source_stage.description
        and target_stage.is_active is not distinct from source_stage.is_active
    )
  ) then
    raise exception 'Existing TOR Operational V2 rollout requires target stages matching the mapped legacy Existing TOR metadata.';
  end if;

  if legacy_tor_is_active is true and operational_v2_is_active is false then
    select count(*)
    into v2_project_count
    from public.projects
    where scenario_id = operational_v2_id;

    if v2_project_count <> 0 then
      raise exception 'Existing TOR Operational V2 first rollout requires zero projects referencing the target scenario.';
    end if;

    update public.scenarios
    set is_active = true
    where id = operational_v2_id
      and is_active is false;

    get diagnostics updated_count = row_count;
    if updated_count <> 1 then
      raise exception 'Existing TOR Operational V2 rollout could not activate the target scenario.';
    end if;

    update public.scenarios
    set is_active = false
    where id = legacy_tor_id
      and is_active is true;

    get diagnostics updated_count = row_count;
    if updated_count <> 1 then
      raise exception 'Existing TOR Operational V2 rollout could not deactivate the legacy scenario.';
    end if;
  elsif legacy_tor_is_active is false and operational_v2_is_active is true then
    -- Valid rerun after rollout. Existing V2 projects are allowed in this state.
    null;
  else
    raise exception 'Existing TOR Operational V2 rollout found an inconsistent or partially rolled-out scenario state.';
  end if;
end;
$$;

commit;

-- Read-only verification queries for manual execution after this migration:
--
-- select id, name, workflow_model, workflow_version, is_active
-- from public.scenarios
-- where name in ('Existing TOR', 'Existing TOR Operational V2')
-- order by name;
--
-- select ws.step_order, ws.name, ws.default_role, ws.is_active
-- from public.workflow_stages ws
-- join public.scenarios s on s.id = ws.scenario_id
-- where s.name = 'Existing TOR Operational V2'
--   and s.workflow_model = 'OPERATIONAL_V2'
--   and s.workflow_version = 2
-- order by ws.step_order;
--
-- select count(*) as legacy_existing_tor_projects_preserved
-- from public.projects p
-- join public.scenarios s on s.id = p.scenario_id
-- where s.name = 'Existing TOR'
--   and s.workflow_model = 'LEGACY'
--   and s.workflow_version = 1;
