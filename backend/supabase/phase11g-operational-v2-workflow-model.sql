begin;

-- Existing scenarios retain the legacy model by default. Future workflow
-- behavior can select an immutable model/version instead of scenario names.
alter table public.scenarios
  add column if not exists workflow_model text not null default 'LEGACY',
  add column if not exists workflow_version integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.scenarios'::regclass
      and conname = 'scenarios_workflow_model_version_check'
  ) then
    alter table public.scenarios
      add constraint scenarios_workflow_model_version_check
      check (
        (workflow_model = 'LEGACY' and workflow_version = 1)
        or (workflow_model = 'OPERATIONAL_V2' and workflow_version = 2)
      );
  end if;
end;
$$;

-- Supports future selection of an active scenario by its workflow model.
create index if not exists scenarios_active_model_version_idx
  on public.scenarios (workflow_model, workflow_version)
  where is_active = true;

-- This template is deliberately inactive. Runtime support will activate it in
-- a later rollout, after new-project initialization understands V2 semantics.
insert into public.scenarios (
  name,
  description,
  is_active,
  workflow_model,
  workflow_version
)
values (
  'Assessment Operational V2',
  'Operational milestone workflow for future Assessment projects',
  false,
  'OPERATIONAL_V2',
  2
)
on conflict (name) do nothing;

do $$
declare
  legacy_assessment_id uuid;
  v2_scenario_id uuid;
  v2_is_active boolean;
  existing_v2_stage_count integer;
  invalid_source_stage_count integer;
  matching_v2_stage_count integer;
  inserted_stage_count integer;
begin
  select id
  into legacy_assessment_id
  from public.scenarios
  where name = 'Assessment'
    and workflow_model = 'LEGACY'
    and workflow_version = 1;

  if legacy_assessment_id is null then
    raise exception 'Cannot seed Assessment Operational V2: the legacy Assessment scenario is missing or does not use LEGACY v1.';
  end if;

  select id, is_active
  into v2_scenario_id, v2_is_active
  from public.scenarios
  where name = 'Assessment Operational V2'
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2;

  if v2_scenario_id is null then
    raise exception 'Cannot seed Assessment Operational V2: the scenario name is already used by an incompatible scenario.';
  end if;

  if v2_is_active then
    raise exception 'Assessment Operational V2 must remain inactive until its runtime rollout is complete.';
  end if;

  select count(*)
  into existing_v2_stage_count
  from public.workflow_stages
  where scenario_id = v2_scenario_id;

  if existing_v2_stage_count = 0 then
    select count(*)
    into invalid_source_stage_count
    from (
      values
        (6, 'Customer Assessment', 1),
        (7, 'Assessment Report', 2),
        (8, 'Requirement Gathering', 3),
        (9, 'Pain Point Analysis', 4),
        (10, 'Proposal Solution', 5),
        (11, 'Deliverables', 6),
        (12, 'Technical Proposal & BOQ', 7),
        (13, 'Tender Process', 8)
    ) as expected(source_step_order, name, target_step_order)
    left join public.workflow_stages source_stage
      on source_stage.scenario_id = legacy_assessment_id
      and source_stage.step_order = expected.source_step_order
      and source_stage.name = expected.name
    where source_stage.id is null
      or source_stage.is_active is distinct from true;

    if invalid_source_stage_count <> 0 then
      raise exception 'Cannot seed Assessment Operational V2: required legacy Assessment operational stages are missing, renamed, reordered, or inactive.';
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
      v2_scenario_id,
      expected.name,
      source_stage.description,
      expected.target_step_order,
      source_stage.default_role,
      source_stage.default_duration_working_days,
      source_stage.is_required,
      true
    from (
      values
        (6, 'Customer Assessment', 1),
        (7, 'Assessment Report', 2),
        (8, 'Requirement Gathering', 3),
        (9, 'Pain Point Analysis', 4),
        (10, 'Proposal Solution', 5),
        (11, 'Deliverables', 6),
        (12, 'Technical Proposal & BOQ', 7),
        (13, 'Tender Process', 8)
    ) as expected(source_step_order, name, target_step_order)
    join public.workflow_stages source_stage
      on source_stage.scenario_id = legacy_assessment_id
      and source_stage.step_order = expected.source_step_order
      and source_stage.name = expected.name
    on conflict (scenario_id, step_order) do nothing;

    get diagnostics inserted_stage_count = row_count;

    if inserted_stage_count <> 8 then
      raise exception 'Cannot seed Assessment Operational V2: expected to insert eight operational stages.';
    end if;
  elsif existing_v2_stage_count = 8 then
    select count(*)
    into matching_v2_stage_count
    from (
      values
        (6, 'Customer Assessment', 1),
        (7, 'Assessment Report', 2),
        (8, 'Requirement Gathering', 3),
        (9, 'Pain Point Analysis', 4),
        (10, 'Proposal Solution', 5),
        (11, 'Deliverables', 6),
        (12, 'Technical Proposal & BOQ', 7),
        (13, 'Tender Process', 8)
    ) as expected(source_step_order, name, target_step_order)
    join public.workflow_stages source_stage
      on source_stage.scenario_id = legacy_assessment_id
      and source_stage.step_order = expected.source_step_order
      and source_stage.name = expected.name
    join public.workflow_stages v2_stage
      on v2_stage.scenario_id = v2_scenario_id
      and v2_stage.name = expected.name
      and v2_stage.step_order = expected.target_step_order
    where source_stage.is_active is true
      and v2_stage.is_active is true
      and v2_stage.default_role is not distinct from source_stage.default_role
      and v2_stage.default_duration_working_days is not distinct from source_stage.default_duration_working_days
      and v2_stage.is_required is not distinct from source_stage.is_required
      and v2_stage.description is not distinct from source_stage.description;

    if matching_v2_stage_count <> 8 then
      raise exception 'Cannot seed Assessment Operational V2: existing V2 stages do not match the mapped legacy Assessment metadata or active state.';
    end if;
  else
    raise exception 'Cannot seed Assessment Operational V2: existing V2 scenario has a partial or unexpected stage set.';
  end if;
end;
$$;

commit;

-- Read-only verification queries for manual execution after this migration:
--
-- select id, name, workflow_model, workflow_version, is_active
-- from public.scenarios
-- order by workflow_model, workflow_version, name;
--
-- select ws.step_order, ws.name, ws.default_role, ws.is_active
-- from public.workflow_stages ws
-- join public.scenarios s on s.id = ws.scenario_id
-- where s.workflow_model = 'OPERATIONAL_V2'
--   and s.workflow_version = 2
-- order by ws.step_order;
--
-- select count(*) as projects_pointing_to_legacy_scenarios
-- from public.projects p
-- join public.scenarios s on s.id = p.scenario_id
-- where s.workflow_model = 'LEGACY'
--   and s.workflow_version = 1;
--
-- select count(*) as projects_pointing_to_operational_v2_before_rollout
-- from public.projects p
-- join public.scenarios s on s.id = p.scenario_id
-- where s.workflow_model = 'OPERATIONAL_V2'
--   and s.workflow_version = 2;
