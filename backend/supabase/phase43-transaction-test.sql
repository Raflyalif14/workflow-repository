-- Run after phase43 in a test database. All fixture changes are rolled back.
begin;
do $$
declare
  template public.projects%rowtype;
  test_project uuid := gen_random_uuid();
  final_stage uuid;
  phase uuid;
  ordinary uuid := gen_random_uuid();
  discarded uuid := gen_random_uuid();
  kept uuid := gen_random_uuid();
  head_actor uuid;
  n integer;
begin
  select p.* into template from public.projects p join public.users u on u.id=p.sales_id
    join public.scenarios s on s.id=p.current_scenario_id
    where u.role='SALES' and u.is_active and p.active_phase_id is not null and s.name='On Submission Tender'
      and exists(select 1 from public.project_milestones m join public.workflow_stages s on s.id=m.workflow_stage_id
        where m.phase_id=p.active_phase_id and s.default_role='SALES'
          and not exists(select 1 from public.project_milestones later where later.phase_id=m.phase_id and later.step_order>m.step_order))
    limit 1;
  select id into head_actor from public.users where role='HEAD_SA' and is_active limit 1;
  if template.id is null or head_actor is null then raise exception 'Missing phase43 fixture templates'; end if;

  insert into public.projects select (jsonb_populate_record(null::public.projects,to_jsonb(template)||jsonb_build_object(
    'id',test_project,'name','PHASE43 ROLLBACK TEST','status','DRAFT',
    'scenario_id',template.current_scenario_id,'active_phase_id',null,'is_postponed',false,
    'selected_document_keys',(select coalesce(jsonb_agg(document_key),'[]'::jsonb) from public.output_document_stage_catalog
      where group_key='ON_SUBMISSION_TENDER' and is_required),
    'final_contract_value',null,'loss_reason',null,'phase_migration_state','LEGACY_REVIEW'))).*;
  select active_phase_id into phase from public.projects where id=test_project;
  perform public.sync_phase_output_scope(test_project,template.sales_id,array[]::text[]);
  select id into final_stage from public.project_milestones where phase_id=phase order by step_order desc limit 1;
  if final_stage is null then raise exception 'Missing fixture final milestone'; end if;
  update public.projects set status='ACTIVE' where id=test_project;

  insert into public.documents(id,project_id,milestone_id,title,category,status) values
    (ordinary,test_project,final_stage,'Ordinary document','OTHER','APPROVED'),
    (discarded,test_project,final_stage,'Discarded evidence','OTHER','DRAFT'),
    (kept,test_project,final_stage,'Kept evidence','OTHER','DRAFT');
  insert into public.document_versions(document_id,version_number,file_name,storage_path,file_size,mime_type,status,uploaded_by,is_outcome_evidence)
    select d.id,1,'sample.pdf','rollback-test/'||d.id,10,'application/pdf',d.status,template.sales_id,d.id<>ordinary
    from public.documents d where d.id in (ordinary,discarded,kept);

  begin
    perform public.validate_outcome_evidence(test_project,template.sales_id,'WON',array[ordinary]);
    raise exception 'Ordinary document was accepted as evidence';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.claim_discarded_outcome_evidence(test_project,head_actor,array[discarded]);
    raise exception 'Unauthorized discard was accepted';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.claim_discarded_outcome_evidence(test_project,template.sales_id,array[ordinary,discarded]);
  if n<>1 or (select status from public.documents where id=ordinary)<>'APPROVED'
    or (select status from public.documents where id=discarded)<>'REJECTED' then raise exception 'Incorrect discard scope'; end if;
  select count(*) into n from public.claim_discarded_outcome_evidence(test_project,template.sales_id,array[discarded]);
  if n<>1 then raise exception 'Discard is not retryable'; end if;
  begin
    perform public.validate_outcome_evidence(test_project,template.sales_id,'WON',array[discarded]);
    raise exception 'Discarded evidence was finalized';
  exception when invalid_parameter_value then null; end;

  begin
    perform public.validate_outcome_evidence(test_project,template.sales_id,'WON',array[kept]);
    raise exception 'Simulated result write failure' using errcode='P0043';
  exception when sqlstate 'P0043' then null; end;
  if (select status from public.documents where id=kept)<>'DRAFT' or exists(select 1 from public.project_outcome_evidence where document_id=kept)
    then raise exception 'Evidence was published despite rollback'; end if;
  perform public.validate_outcome_evidence(test_project,template.sales_id,'WON',array[kept]);
  if (select status from public.documents where id=kept)<>'APPROVED'
    or (select status from public.document_versions where document_id=kept)<>'APPROVED'
    or not exists(select 1 from public.project_outcome_evidence where document_id=kept and project_id=test_project)
    then raise exception 'Evidence was not published and linked'; end if;
  select count(*) into n from public.claim_discarded_outcome_evidence(test_project,template.sales_id,array[kept]);
  if n<>0 then raise exception 'Published evidence was claimed for deletion'; end if;
end $$;
rollback;
select 'PASS phase43 evidence scope, rollback, finalization and discard retry' as phase43_check;
