begin;

-- This rollout changes scenario availability for future project selection only.
-- It intentionally does not update projects, project_milestones, or workflow_stages.
do $$
declare
  legacy_assessment_id uuid;
  operational_v2_id uuid;
  legacy_assessment_is_active boolean;
  operational_v2_is_active boolean;
  matching_v2_stage_count integer;
  total_v2_stage_count integer;
  v2_project_count integer;
  updated_count integer;
begin
  select count(*)
  into total_v2_stage_count
  from public.scenarios
  where name = 'Assessment'
    and workflow_model = 'LEGACY'
    and workflow_version = 1;

  if total_v2_stage_count <> 1 then
    raise exception 'Operational V2 rollout requires exactly one Assessment scenario using LEGACY v1.';
  end if;

  select id, is_active
  into legacy_assessment_id, legacy_assessment_is_active
  from public.scenarios
  where name = 'Assessment'
    and workflow_model = 'LEGACY'
    and workflow_version = 1;

  select count(*)
  into total_v2_stage_count
  from public.scenarios
  where name = 'Assessment Operational V2'
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2;

  if total_v2_stage_count <> 1 then
    raise exception 'Operational V2 rollout requires exactly one Assessment Operational V2 scenario using OPERATIONAL_V2 v2.';
  end if;

  select id, is_active
  into operational_v2_id, operational_v2_is_active
  from public.scenarios
  where name = 'Assessment Operational V2'
    and workflow_model = 'OPERATIONAL_V2'
    and workflow_version = 2;

  if legacy_assessment_is_active is distinct from true then
    raise exception 'Operational V2 rollout requires the legacy Assessment scenario to be active before rollout.';
  end if;

  if operational_v2_is_active is distinct from false then
    raise exception 'Operational V2 rollout requires Assessment Operational V2 to be inactive before rollout.';
  end if;

  select count(*)
  into v2_project_count
  from public.projects
  where scenario_id = operational_v2_id;

  if v2_project_count <> 0 then
    raise exception 'Operational V2 rollout cannot run after projects reference Assessment Operational V2.';
  end if;

  select count(*)
  into total_v2_stage_count
  from public.workflow_stages
  where scenario_id = operational_v2_id;

  select count(*)
  into matching_v2_stage_count
  from (
    values
      (6, 1, 'Customer Assessment'),
      (7, 2, 'Assessment Report'),
      (8, 3, 'Requirement Gathering'),
      (9, 4, 'Pain Point Analysis'),
      (10, 5, 'Proposal Solution'),
      (11, 6, 'Deliverables'),
      (12, 7, 'Technical Proposal & BOQ'),
      (13, 8, 'Tender Process')
  ) as expected(source_step_order, target_step_order, name)
  join public.workflow_stages source_stage
    on source_stage.scenario_id = legacy_assessment_id
    and source_stage.step_order = expected.source_step_order
    and source_stage.name = expected.name
  join public.workflow_stages v2_stage
    on v2_stage.scenario_id = operational_v2_id
    and v2_stage.step_order = expected.target_step_order
    and v2_stage.name = expected.name
  where source_stage.is_active is true
    and v2_stage.is_active is true
    and v2_stage.default_role is not distinct from source_stage.default_role
    and v2_stage.default_duration_working_days is not distinct from source_stage.default_duration_working_days
    and v2_stage.is_required is not distinct from source_stage.is_required
    and v2_stage.description is not distinct from source_stage.description;

  if total_v2_stage_count <> 8 or matching_v2_stage_count <> 8 then
    raise exception 'Operational V2 rollout requires exactly eight active stages matching mapped legacy Assessment operational metadata.';
  end if;

  update public.scenarios
  set is_active = true
  where id = operational_v2_id
    and is_active is false;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Operational V2 rollout could not activate Assessment Operational V2.';
  end if;

  update public.scenarios
  set is_active = false
  where id = legacy_assessment_id
    and is_active is true;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Operational V2 rollout could not deactivate the legacy Assessment scenario.';
  end if;
end;
$$;

commit;

-- Read-only verification queries for manual execution after this migration:
--
-- select id, name, workflow_model, workflow_version, is_active
-- from public.scenarios
-- where (name = 'Assessment' and workflow_model = 'LEGACY' and workflow_version = 1)
--    or (name = 'Assessment Operational V2' and workflow_model = 'OPERATIONAL_V2' and workflow_version = 2)
--    or name = 'Existing TOR'
-- order by name;
--
-- select ws.step_order, ws.name, ws.default_role, ws.is_active
-- from public.workflow_stages ws
-- join public.scenarios s on s.id = ws.scenario_id
-- where s.name = 'Assessment Operational V2'
--   and s.workflow_model = 'OPERATIONAL_V2'
--   and s.workflow_version = 2
-- order by ws.step_order;
--
-- select count(*) as projects_pointing_to_operational_v2
-- from public.projects p
-- join public.scenarios s on s.id = p.scenario_id
-- where s.workflow_model = 'OPERATIONAL_V2'
--   and s.workflow_version = 2;
