-- All fixture changes are rolled back.
begin;
do $$
declare
  template public.projects%rowtype;
  test_project uuid := gen_random_uuid();
  final_stage uuid;
  phase uuid;
  kept uuid := gen_random_uuid();
  head_actor uuid;
  sa_actor uuid;
  required_keys text[];
  changed boolean;
begin
  select p.* into template from public.projects p join public.users u on u.id=p.sales_id
    join public.scenarios s on s.id=p.current_scenario_id
    where u.role='SALES' and u.is_active and p.active_phase_id is not null and s.name='On Submission Tender'
      and exists(select 1 from public.project_milestones m join public.workflow_stages s on s.id=m.workflow_stage_id
        where m.phase_id=p.active_phase_id and s.default_role='SALES'
          and not exists(select 1 from public.project_milestones later where later.phase_id=m.phase_id and later.step_order>m.step_order))
    limit 1;
  select id into head_actor from public.users where role='HEAD_SA' and is_active limit 1;
  select id into sa_actor from public.users where role='SA' and is_active limit 1;
  if template.id is null or head_actor is null or sa_actor is null then raise exception 'Missing phase44 fixture templates'; end if;

  insert into public.projects select (jsonb_populate_record(null::public.projects,to_jsonb(template)||jsonb_build_object(
    'id',test_project,'name','PHASE44 ROLLBACK TEST','status','DRAFT',
    'scenario_id',template.current_scenario_id,'active_phase_id',null,'is_postponed',false,'pic_id',sa_actor,
    'selected_document_keys',(select coalesce(jsonb_agg(document_key),'[]'::jsonb) from public.output_document_stage_catalog
      where group_key='ON_SUBMISSION_TENDER' and is_required),
    'final_contract_value',null,'loss_reason',null,'phase_migration_state','LEGACY_REVIEW'))).*;
  select active_phase_id into phase from public.projects where id=test_project;
  perform public.sync_phase_output_scope(test_project,template.sales_id,array[]::text[]);
  select id into final_stage from public.project_milestones where phase_id=phase order by step_order desc limit 1;
  if final_stage is null then raise exception 'Missing fixture final milestone'; end if;
  update public.project_milestones set start_date=(now() at time zone 'Asia/Jakarta')::date,
    due_date=(now() at time zone 'Asia/Jakarta')::date,duration_working_days=1 where phase_id=phase;
  update public.project_milestones set status='COMPLETED' where phase_id=phase and id<>final_stage;
  update public.project_output_documents set status='APPROVED' where phase_id=phase and (is_required or is_selected);
  select array_agg(document_key) into required_keys from public.project_output_documents where phase_id=phase and is_required;
  insert into public.project_plan_approvals(project_id,phase_id,status,requested_by,reviewed_by,reviewed_at)
    values(test_project,phase,'APPROVED',template.sales_id,head_actor,now());
  update public.projects set status='ACTIVE' where id=test_project;

  insert into public.documents(id,project_id,milestone_id,title,category,status)
    values(kept,test_project,final_stage,'Result evidence','OTHER','DRAFT');
  insert into public.document_versions(document_id,version_number,file_name,storage_path,file_size,mime_type,status,uploaded_by,is_outcome_evidence)
    values(kept,1,'sample.pdf','rollback-test/'||kept,10,'application/pdf','DRAFT',template.sales_id,true);

  begin
    perform public.complete_final_sales_with_evidence(final_stage,template.sales_id,'WON',1250.50,null,required_keys,array[gen_random_uuid()]);
    raise exception 'Missing evidence was accepted';
  exception when invalid_parameter_value then null; end;
  if (select status from public.project_milestones where id=final_stage)<>'CREATED'
    or (select status from public.projects where id=test_project)<>'ACTIVE' then raise exception 'Failed outcome changed project or stage'; end if;
  select c.changed into changed from public.complete_final_sales_with_evidence(final_stage,template.sales_id,'WON',1250.50,null,required_keys,array[kept]) c;
  if changed is distinct from true or (select status from public.project_milestones where id=final_stage)<>'COMPLETED'
    or (select status from public.projects where id=test_project)<>'WON'
    or (select final_contract_value from public.projects where id=test_project) is distinct from 1250.50
    or not exists(select 1 from public.project_outcome_evidence where project_id=test_project and document_id=kept)
    then raise exception 'Direct outcome was not recorded'; end if;
  select c.changed into changed from public.complete_final_sales_with_evidence(final_stage,template.sales_id,'WON',1250.50,null,required_keys,array[kept]) c;
  if changed is distinct from false then raise exception 'Repeated result changed the project'; end if;
end $$;
rollback;
select 'PASS direct Tender result, evidence rollback, amount and retry' as phase44_check;
