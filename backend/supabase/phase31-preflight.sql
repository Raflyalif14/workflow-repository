-- READ ONLY before Phase31. No user content or exact Storage paths selected.
select to_regprocedure('public.audit_project_creation_phase30()') as creation_audit,
  to_regprocedure('public.initialize_project_phase()') as initial_phase,
  to_regclass('public.project_intake_attachments') as intake,
  to_regclass('public.project_creation_requests') as must_be_null;
select name,workflow_model,workflow_version,is_active from public.scenarios order by name;
select group_key,count(*),count(*) filter(where is_required) as required from public.output_document_stage_catalog group by group_key;
select s.name,ws.stage_key,count(*) from public.workflow_stages ws join public.scenarios s on s.id=ws.scenario_id
  where ws.is_active group by s.name,ws.stage_key having count(*)>1;
-- Review all direct project INSERT writers; stop old API instances during rollout.
select has_table_privilege('authenticated','public.projects','INSERT') as inspect_client_writer;
