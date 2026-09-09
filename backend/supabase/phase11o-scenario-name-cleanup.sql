-- Final scenario cleanup. This migration deletes the unused LEGACY v1 templates
-- before assigning their canonical names to the existing OPERATIONAL_V2 rows.
begin;

lock table public.scenarios, public.projects, public.workflow_stages, public.project_milestones
  in share row exclusive mode;

do $$
declare
  legacy_assessment_count integer;
  legacy_existing_tor_count integer;
  v2_assessment_count integer;
  v2_existing_tor_count integer;
  relevant_scenario_count integer;
  deleted_row_count integer;
  renamed_row_count integer;
  legacy_assessment_id uuid;
  legacy_existing_tor_id uuid;
  v2_assessment_id uuid;
  v2_existing_tor_id uuid;
  legacy_assessment_active boolean;
  legacy_existing_tor_active boolean;
  v2_assessment_active boolean;
  v2_existing_tor_active boolean;
  legacy_assessment_project_count bigint;
  legacy_existing_tor_project_count bigint;
  legacy_assessment_stage_reference_count bigint;
  legacy_existing_tor_stage_reference_count bigint;
  v2_assessment_project_count bigint;
  v2_existing_tor_project_count bigint;
begin
  select count(*) into legacy_assessment_count
  from public.scenarios
  where name = 'Assessment'
    and workflow_model = 'LEGACY'
    and workflow_version = 1;

  select count(*) into legacy_existing_tor_count
  from public.scenarios
  where name = 'Existing TOR'
    and workflow_model = 'LEGACY'
    and workflow_version = 1;

  select count(*) into v2_assessment_count
  from public.scenarios
  where name = 'Assessment Operational V2'
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2;

  select count(*) into v2_existing_tor_count
  from public.scenarios
  where name = 'Existing TOR Operational V2'
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2;

  if legacy_assessment_count <> 1
    or legacy_existing_tor_count <> 1
    or v2_assessment_count <> 1
    or v2_existing_tor_count <> 1 then
    raise exception 'Scenario cleanup requires exactly one expected LEGACY v1 and OPERATIONAL_V2 v2 row for Assessment and Existing TOR.';
  end if;

  select id, is_active
  into legacy_assessment_id, legacy_assessment_active
  from public.scenarios
  where name = 'Assessment'
    and workflow_model = 'LEGACY'
    and workflow_version = 1;

  select id, is_active
  into legacy_existing_tor_id, legacy_existing_tor_active
  from public.scenarios
  where name = 'Existing TOR'
    and workflow_model = 'LEGACY'
    and workflow_version = 1;

  select id, is_active
  into v2_assessment_id, v2_assessment_active
  from public.scenarios
  where name = 'Assessment Operational V2'
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2;

  select id, is_active
  into v2_existing_tor_id, v2_existing_tor_active
  from public.scenarios
  where name = 'Existing TOR Operational V2'
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2;

  if legacy_assessment_active is distinct from false
    or legacy_existing_tor_active is distinct from false
    or v2_assessment_active is distinct from true
    or v2_existing_tor_active is distinct from true then
    raise exception 'Scenario cleanup requires inactive LEGACY v1 rows and active OPERATIONAL_V2 v2 rows.';
  end if;

  select count(*) into legacy_assessment_project_count
  from public.projects
  where scenario_id = legacy_assessment_id;

  select count(*) into legacy_existing_tor_project_count
  from public.projects
  where scenario_id = legacy_existing_tor_id;

  if legacy_assessment_project_count <> 0 or legacy_existing_tor_project_count <> 0 then
    raise exception 'Scenario cleanup cannot delete LEGACY scenarios while projects still reference them.';
  end if;

  select count(*) into legacy_assessment_stage_reference_count
  from public.project_milestones milestone
  join public.workflow_stages stage on stage.id = milestone.workflow_stage_id
  where stage.scenario_id = legacy_assessment_id;

  select count(*) into legacy_existing_tor_stage_reference_count
  from public.project_milestones milestone
  join public.workflow_stages stage on stage.id = milestone.workflow_stage_id
  where stage.scenario_id = legacy_existing_tor_id;

  if legacy_assessment_stage_reference_count <> 0 or legacy_existing_tor_stage_reference_count <> 0 then
    raise exception 'Scenario cleanup cannot delete LEGACY scenarios while project milestones reference their workflow stages.';
  end if;

  select count(*) into v2_assessment_project_count
  from public.projects
  where scenario_id = v2_assessment_id;

  select count(*) into v2_existing_tor_project_count
  from public.projects
  where scenario_id = v2_existing_tor_id;

  delete from public.scenarios
  where id = legacy_assessment_id
    and name = 'Assessment'
    and workflow_model = 'LEGACY'
    and workflow_version = 1
    and is_active is false
    and not exists (
      select 1 from public.projects where scenario_id = legacy_assessment_id
    )
    and not exists (
      select 1
      from public.project_milestones milestone
      join public.workflow_stages stage on stage.id = milestone.workflow_stage_id
      where stage.scenario_id = legacy_assessment_id
    );
  get diagnostics deleted_row_count = row_count;
  if deleted_row_count <> 1 then
    raise exception 'Scenario cleanup could not delete the legacy Assessment scenario.';
  end if;

  delete from public.scenarios
  where id = legacy_existing_tor_id
    and name = 'Existing TOR'
    and workflow_model = 'LEGACY'
    and workflow_version = 1
    and is_active is false
    and not exists (
      select 1 from public.projects where scenario_id = legacy_existing_tor_id
    )
    and not exists (
      select 1
      from public.project_milestones milestone
      join public.workflow_stages stage on stage.id = milestone.workflow_stage_id
      where stage.scenario_id = legacy_existing_tor_id
    );
  get diagnostics deleted_row_count = row_count;
  if deleted_row_count <> 1 then
    raise exception 'Scenario cleanup could not delete the legacy Existing TOR scenario.';
  end if;

  update public.scenarios
  set name = 'Assessment'
  where id = v2_assessment_id
    and name = 'Assessment Operational V2'
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2
    and is_active is true;
  get diagnostics renamed_row_count = row_count;
  if renamed_row_count <> 1 then
    raise exception 'Scenario cleanup could not rename the Operational V2 Assessment scenario.';
  end if;

  update public.scenarios
  set name = 'Existing TOR'
  where id = v2_existing_tor_id
    and name = 'Existing TOR Operational V2'
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2
    and is_active is true;
  get diagnostics renamed_row_count = row_count;
  if renamed_row_count <> 1 then
    raise exception 'Scenario cleanup could not rename the Operational V2 Existing TOR scenario.';
  end if;

  select count(*) into relevant_scenario_count
  from public.scenarios
  where (name in ('Assessment', 'Existing TOR') and workflow_model = 'OPERATIONAL_V2' and workflow_version = 2)
    or (name in ('Assessment Operational V2', 'Existing TOR Operational V2') and workflow_model = 'OPERATIONAL_V2' and workflow_version = 2)
    or (name in ('Assessment', 'Existing TOR') and workflow_model = 'LEGACY' and workflow_version = 1);

  if relevant_scenario_count <> 2
    or exists (
      select 1
      from public.scenarios
      where id in (legacy_assessment_id, legacy_existing_tor_id)
    )
    or exists (
      select 1
      from public.scenarios
      where name in ('Assessment Operational V2', 'Existing TOR Operational V2')
    )
    or not exists (
      select 1
      from public.scenarios
      where id = v2_assessment_id
        and name = 'Assessment'
        and workflow_model = 'OPERATIONAL_V2'
        and workflow_version = 2
        and is_active is true
    )
    or not exists (
      select 1
      from public.scenarios
      where id = v2_existing_tor_id
        and name = 'Existing TOR'
        and workflow_model = 'OPERATIONAL_V2'
        and workflow_version = 2
        and is_active is true
    ) then
    raise exception 'Scenario cleanup postcondition verification failed.';
  end if;

  if (select count(*) from public.projects where scenario_id = v2_assessment_id) <> v2_assessment_project_count
    or (select count(*) from public.projects where scenario_id = v2_existing_tor_id) <> v2_existing_tor_project_count then
    raise exception 'Scenario cleanup detected an unexpected Operational V2 project scenario reference change.';
  end if;
end;
$$;

commit;
