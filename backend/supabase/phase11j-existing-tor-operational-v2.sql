begin;

-- Create an inactive, immutable operational template for future Existing TOR
-- projects. Existing TOR LEGACY v1 and all existing project snapshots remain
-- untouched.
do $$
declare
  legacy_tor_id uuid;
  target_v2_id uuid;
  target_v2_is_active boolean;
  source_scenario_count integer;
  target_name_count integer;
  target_stage_count integer;
  target_project_count integer;
  inserted_stage_count integer;
begin
  select count(*)
  into source_scenario_count
  from public.scenarios
  where name = 'Existing TOR'
    and workflow_model = 'LEGACY'
    and workflow_version = 1;

  if source_scenario_count <> 1 then
    raise exception 'Cannot seed Existing TOR Operational V2: expected exactly one Existing TOR LEGACY v1 source scenario.';
  end if;

  select id
  into legacy_tor_id
  from public.scenarios
  where name = 'Existing TOR'
    and workflow_model = 'LEGACY'
    and workflow_version = 1;

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
  ) or exists (
    select source_stage.step_order
    from public.workflow_stages source_stage
    where source_stage.scenario_id = legacy_tor_id
      and source_stage.step_order between 6 and 11
    group by source_stage.step_order
    having count(*) > 1
  ) then
    raise exception 'Cannot seed Existing TOR Operational V2: legacy Existing TOR stages 6 through 11 do not match the expected operational names and roles.';
  end if;

  select count(*)
  into target_name_count
  from public.scenarios
  where name = 'Existing TOR Operational V2';

  if target_name_count = 0 then
    insert into public.scenarios (
      name,
      description,
      is_active,
      workflow_model,
      workflow_version
    )
    values (
      'Existing TOR Operational V2',
      'Operational milestone workflow for future Existing TOR projects',
      false,
      'OPERATIONAL_V2',
      2
    );
  elsif target_name_count <> 1 then
    raise exception 'Cannot seed Existing TOR Operational V2: scenario name is not unique.';
  end if;

  select id, is_active
  into target_v2_id, target_v2_is_active
  from public.scenarios
  where name = 'Existing TOR Operational V2'
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2;

  if target_v2_id is null then
    raise exception 'Cannot seed Existing TOR Operational V2: the scenario name is already used by an incompatible workflow model or version.';
  end if;

  if target_v2_is_active then
    raise exception 'Existing TOR Operational V2 must remain inactive until a separate rollout is approved.';
  end if;

  select count(*)
  into target_stage_count
  from public.workflow_stages
  where scenario_id = target_v2_id;

  select count(*)
  into target_project_count
  from public.projects
  where scenario_id = target_v2_id;

  if target_stage_count = 0 then
    if target_project_count <> 0 then
      raise exception 'Cannot seed Existing TOR Operational V2: target scenario already has projects and cannot receive workflow stages.';
    end if;

    insert into public.workflow_stages (
      scenario_id,
      name,
      description,
      step_order,
      default_role,
      default_duration_working_days,
      is_required,
      is_active
    )
    select
      target_v2_id,
      source_stage.name,
      source_stage.description,
      expected.target_step_order,
      source_stage.default_role,
      source_stage.default_duration_working_days,
      source_stage.is_required,
      source_stage.is_active
    from (
      values
        (6, 1, 'Requirement Gathering', 'SA'),
        (7, 2, 'Pain Point Analysis', 'SA'),
        (8, 3, 'Proposal Solution', 'SA'),
        (9, 4, 'Deliverables', 'SA'),
        (10, 5, 'Technical Proposal & BOQ', 'SA'),
        (11, 6, 'Tender Process', 'SALES')
    ) as expected(source_step_order, target_step_order, name, default_role)
    join public.workflow_stages source_stage
      on source_stage.scenario_id = legacy_tor_id
      and source_stage.step_order = expected.source_step_order
      and source_stage.name = expected.name
      and source_stage.default_role = expected.default_role;

    get diagnostics inserted_stage_count = row_count;
    if inserted_stage_count <> 6 then
      raise exception 'Cannot seed Existing TOR Operational V2: expected to insert six operational stages.';
    end if;
  elsif target_stage_count = 6 then
    if exists (
      select 1
      from (values (1), (2), (3), (4), (5), (6)) as expected(target_step_order)
      where (
        select count(*)
        from public.workflow_stages target_stage
        where target_stage.scenario_id = target_v2_id
          and target_stage.step_order = expected.target_step_order
      ) <> 1
    ) or exists (
      select 1
      from public.workflow_stages target_stage
      where target_stage.scenario_id = target_v2_id
        and target_stage.step_order not in (1, 2, 3, 4, 5, 6)
    ) or exists (
      select target_stage.step_order
      from public.workflow_stages target_stage
      where target_stage.scenario_id = target_v2_id
      group by target_stage.step_order
      having count(*) > 1
    ) then
      raise exception 'Cannot seed Existing TOR Operational V2: target scenario must contain exactly one stage at each step order 1 through 6.';
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
          on target_stage.scenario_id = target_v2_id
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
      raise exception 'Cannot seed Existing TOR Operational V2: existing target stages do not match the mapped legacy Existing TOR metadata.';
    end if;
  else
    raise exception 'Cannot seed Existing TOR Operational V2: target scenario has a partial or unexpected stage set.';
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
-- select ws.step_order, ws.name, ws.default_role,
--        ws.default_duration_working_days, ws.is_required, ws.is_active
-- from public.workflow_stages ws
-- join public.scenarios s on s.id = ws.scenario_id
-- where s.name = 'Existing TOR Operational V2'
--   and s.workflow_model = 'OPERATIONAL_V2'
--   and s.workflow_version = 2
-- order by ws.step_order;
--
-- select count(*) as projects_pointing_to_existing_tor_operational_v2
-- from public.projects p
-- join public.scenarios s on s.id = p.scenario_id
-- where s.name = 'Existing TOR Operational V2'
--   and s.workflow_model = 'OPERATIONAL_V2'
--   and s.workflow_version = 2;
